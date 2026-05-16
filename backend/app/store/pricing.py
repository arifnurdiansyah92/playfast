"""Shared pricing helpers for promo codes + referral credit."""

from __future__ import annotations

from datetime import datetime, timezone
from app.models import PromoCode, PromoCodeUsage, User


def validate_promo_code(code: str, user_id: int, subtotal: int, order_type: str, game_id: int | None = None, plan: str | None = None):
    """Validate a promo code for a given user + order context.

    Returns:
        (promo, discount_amount, None)         on success
        (None, 0, error_message)                on failure
    """
    if not code:
        return None, 0, "Kode promo kosong"

    # Use a single generic message for non-existent / inactive / expired codes so
    # attackers can't distinguish real-but-disabled codes from random guesses.
    _INVALID = "Kode promo tidak berlaku"

    promo = PromoCode.query.filter_by(code=code.upper()).first()
    if not promo:
        return None, 0, _INVALID
    if not promo.is_active:
        return None, 0, _INVALID
    if promo.expires_at and promo.expires_at < datetime.now(timezone.utc):
        return None, 0, _INVALID
    # NOTE: assigned_user_id is purely for attribution tracking (e.g. which
    # marketer/affiliate owns this code) — NOT a redemption restriction.
    # Anyone matching the scope/min/max constraints can redeem; the owner
    # just sees aggregate usage in their Promo Tracker.

    scope = promo.scope or "all"
    if scope == "all":
        pass
    elif scope == "games":
        if order_type != "game":
            return None, 0, "Kode promo ini hanya untuk pembelian game"
    elif scope == "subscriptions":
        if order_type != "subscription":
            return None, 0, "Kode promo ini hanya untuk subscription"
    elif scope.startswith("game:"):
        try:
            scoped_id = int(scope.split(":")[1])
        except (ValueError, IndexError):
            return None, 0, "Kode promo tidak berlaku"
        if order_type != "game" or game_id != scoped_id:
            return None, 0, "Kode promo ini tidak berlaku untuk item ini"
    elif scope.startswith("sub:"):
        scoped_plan = scope.split(":", 1)[1] if ":" in scope else ""
        if order_type != "subscription" or plan != scoped_plan:
            return None, 0, "Kode promo ini tidak berlaku untuk plan ini"
    else:
        return None, 0, "Kode promo tidak berlaku"

    if subtotal < promo.min_order_amount:
        return None, 0, f"Minimum pembelian Rp {promo.min_order_amount:,} untuk pakai kode ini"

    if promo.max_uses_total is not None:
        total_uses = promo.usages.count()
        if total_uses >= promo.max_uses_total:
            return None, 0, "Kode promo sudah habis kuotanya"

    user_uses = PromoCodeUsage.query.filter_by(promo_code_id=promo.id, user_id=user_id).count()
    if user_uses >= promo.max_uses_per_user:
        return None, 0, "Kamu sudah pernah pakai kode ini"

    if promo.discount_type == "percentage":
        discount = int(subtotal * promo.discount_value / 100)
    else:
        discount = min(promo.discount_value, subtotal)

    return promo, discount, None


def compute_final_amount(subtotal: int, user_id: int, promo_code: str | None, apply_credit: bool, order_type: str, game_id: int | None = None, plan: str | None = None):
    """Compute the final order amount after promo + credit.

    Returns dict:
        {
            subtotal, promo_discount, credit_applied, total,
            promo_code_id, error: str | None
        }
    """
    promo_discount = 0
    promo_code_id = None
    if promo_code:
        promo, discount, err = validate_promo_code(
            promo_code, user_id, subtotal, order_type, game_id=game_id, plan=plan
        )
        if err:
            return {
                "subtotal": subtotal,
                "promo_discount": 0,
                "credit_applied": 0,
                "total": subtotal,
                "promo_code_id": None,
                "error": err,
            }
        promo_discount = discount
        promo_code_id = promo.id

    interim = subtotal - promo_discount

    credit_applied = 0
    if apply_credit:
        user = User.query.filter_by(id=user_id).first()
        if user and user.referral_credit > 0:
            credit_applied = min(user.referral_credit, interim)

    total = max(0, interim - credit_applied)

    return {
        "subtotal": subtotal,
        "promo_discount": promo_discount,
        "credit_applied": credit_applied,
        "total": total,
        "promo_code_id": promo_code_id,
        "error": None,
    }


def compute_cart_amount(
    cart_items: list,
    user_id: int,
    promo_code: str | None,
    apply_credit: bool,
):
    """Compute final cart amount with promo + first-order discount + credit.

    cart_items is a list of dicts: [{"game_id": int, "unit_price": int}, ...]
    Returns dict with:
        cart_subtotal, first_order_discount, promo_discount, credit_applied,
        cart_total, promo_code_id, per_item_breakdown, error
    per_item_breakdown is a list aligned with cart_items, each containing
    `subtotal`, `discount`, `credit`, `final` so the caller can persist
    prorated values into each Order.
    """
    cart_subtotal = sum(it["unit_price"] for it in cart_items)
    if cart_subtotal <= 0 or not cart_items:
        return {
            "cart_subtotal": 0, "first_order_discount": 0,
            "promo_discount": 0, "credit_applied": 0,
            "cart_total": 0, "promo_code_id": None,
            "per_item_breakdown": [],
            "error": "Cart is empty",
        }

    user = User.query.filter_by(id=user_id).first()
    if not user:
        return {
            "cart_subtotal": cart_subtotal, "first_order_discount": 0,
            "promo_discount": 0, "credit_applied": 0,
            "cart_total": cart_subtotal, "promo_code_id": None,
            "per_item_breakdown": [],
            "error": "User not found",
        }

    # First-order referee discount (one-time, applies only if no fulfilled order yet)
    from app.models import Order, SiteSetting
    first_order_discount = 0
    if user.referred_by_user_id and not Order.query.filter_by(
        user_id=user_id, status="fulfilled"
    ).first():
        referee_pct = int(SiteSetting.get("referral_referee_discount_pct") or "10")
        first_order_discount = int(cart_subtotal * referee_pct / 100)

    interim_after_first = cart_subtotal - first_order_discount

    promo_discount = 0
    promo_code_id = None
    if promo_code:
        promo, discount, err = validate_promo_code(
            promo_code, user_id, interim_after_first, "game"
        )
        if err:
            return {
                "cart_subtotal": cart_subtotal,
                "first_order_discount": 0, "promo_discount": 0,
                "credit_applied": 0, "cart_total": cart_subtotal,
                "promo_code_id": None, "per_item_breakdown": [],
                "error": err,
            }
        promo_discount = discount
        promo_code_id = promo.id

    interim_after_promo = interim_after_first - promo_discount

    credit_applied = 0
    if apply_credit and user.referral_credit > 0:
        credit_applied = min(user.referral_credit, interim_after_promo)

    cart_total = max(0, interim_after_promo - credit_applied)

    # Prorate total discount per item: share = unit_price / cart_subtotal
    total_discount_per_item = first_order_discount + promo_discount
    per_item = []
    accumulated_discount = 0
    accumulated_credit = 0
    for idx, it in enumerate(cart_items):
        is_last = idx == len(cart_items) - 1
        if is_last:
            item_discount = total_discount_per_item - accumulated_discount
            item_credit = credit_applied - accumulated_credit
        else:
            share = it["unit_price"] / cart_subtotal
            item_discount = round(total_discount_per_item * share)
            item_credit = round(credit_applied * share)
            accumulated_discount += item_discount
            accumulated_credit += item_credit
        per_item.append({
            "game_id": it["game_id"],
            "subtotal": it["unit_price"],
            "discount": item_discount,
            "credit": item_credit,
            "final": max(0, it["unit_price"] - item_discount - item_credit),
        })

    return {
        "cart_subtotal": cart_subtotal,
        "first_order_discount": first_order_discount,
        "promo_discount": promo_discount,
        "credit_applied": credit_applied,
        "cart_total": cart_total,
        "promo_code_id": promo_code_id,
        "per_item_breakdown": per_item,
        "error": None,
    }
