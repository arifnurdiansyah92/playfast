"""Helpers shared by user-facing and admin review routes.

- Identity masking (mask_email)
- Plan-tier badge derivation (derive_plan_label)
- Eligibility check (is_eligible_to_review)
- Image processing (process_review_image)
- Public serialization (serialize_review)
"""

import io
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from PIL import Image, ImageOps

from app.extensions import db
from app.models import Order, Review, ReviewImage, Subscription, User


# ---------------------------------------------------------------------------
# Identity / display helpers
# ---------------------------------------------------------------------------


def mask_email(email: Optional[str]) -> str:
    """ris***@gmail.com style mask. Public-safe — never reversible."""
    if not email or "@" not in email:
        return ""
    local, _, domain = email.partition("@")
    visible = local[:3]
    return f"{visible}***@{domain}"


def derive_plan_label(user: Optional[User]) -> str:
    """Compute the public-facing transaction badge for a user.

    Priority (best signal wins, regardless of current active state):
      Lifetime > Yearly > 3-Monthly > Monthly > "Beli Satuan • N game"
                                                 > "" (no purchases)
    """
    if not user:
        return ""

    plan_priority = {"lifetime": 4, "yearly": 3, "3monthly": 2, "monthly": 1}
    best_plan = None
    best_priority = 0
    for sub in user.subscriptions.filter(Subscription.paid_at.isnot(None)).all():
        p = plan_priority.get(sub.plan, 0)
        if p > best_priority:
            best_priority = p
            best_plan = sub.plan

    if best_plan:
        labels = {
            "lifetime": "Subscriber Lifetime",
            "yearly": "Subscriber Yearly",
            "3monthly": "Subscriber 3 Bulan",
            "monthly": "Subscriber Monthly",
        }
        return labels[best_plan]

    fulfilled_purchases = (
        Order.query.filter_by(user_id=user.id, type="purchase", status="fulfilled")
        .count()
    )
    if fulfilled_purchases > 0:
        return f"Beli Satuan • {fulfilled_purchases} game"

    return ""


def is_eligible_to_review(user: User) -> bool:
    """User can submit a review iff they have at least one fulfilled purchase
    OR any subscription that has been paid (active or expired)."""
    if not user:
        return False

    has_purchase = (
        Order.query.filter_by(user_id=user.id, type="purchase", status="fulfilled")
        .first()
        is not None
    )
    has_subscription = (
        Subscription.query.filter_by(user_id=user.id)
        .filter(Subscription.paid_at.isnot(None))
        .first()
        is not None
    )
    return has_purchase or has_subscription


# ---------------------------------------------------------------------------
# Image processing
# ---------------------------------------------------------------------------

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_IMAGES_PER_REVIEW = 4
MAX_DIMENSION = 1920


def process_review_image(file_storage, review_id: int) -> str:
    """Resize+convert to WebP and persist under uploads/reviews/<review_id>/.
    Returns the public URL path. Caller should validate before calling."""
    upload_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "uploads",
        "reviews",
        str(review_id),
    )
    os.makedirs(upload_dir, exist_ok=True)

    raw = file_storage.read()
    img = Image.open(io.BytesIO(raw))
    # ImageOps.exif_transpose: respect EXIF orientation, otherwise phone
    # photos can come out sideways after the resize/convert.
    img = ImageOps.exif_transpose(img)

    # Convert to RGB so WebP encoder accepts it (drops alpha for jpegs etc).
    if img.mode in ("RGBA", "LA"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[-1])
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # Resize so longest side <= MAX_DIMENSION (preserve aspect)
    longest = max(img.size)
    if longest > MAX_DIMENSION:
        scale = MAX_DIMENSION / longest
        new_size = (int(img.size[0] * scale), int(img.size[1] * scale))
        img = img.resize(new_size, Image.LANCZOS)

    filename = f"{uuid.uuid4().hex}.webp"
    filepath = os.path.join(upload_dir, filename)
    img.save(filepath, format="WEBP", quality=82, method=6)

    return f"/uploads/reviews/{review_id}/{filename}"


def delete_review_image_file(url: str):
    """Remove the on-disk file for a ReviewImage URL. Idempotent."""
    if not url or not url.startswith("/uploads/"):
        return
    relative = url[len("/uploads/"):]
    abs_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "uploads",
        relative,
    )
    try:
        os.remove(abs_path)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------


def _display_identity(review: Review) -> tuple[str, str]:
    """Return (display_email, plan_label) for a review.

    For user-linked reviews: derived live from the User (current state).
    For manual seeds: stored values.
    """
    if review.user_id and review.user:
        return mask_email(review.user.email), derive_plan_label(review.user)
    return (
        mask_email(review.manual_email) if review.manual_email else "",
        review.manual_plan_label or "",
    )


def serialize_review(review: Review, *, admin: bool = False) -> dict:
    display_email, plan_label = _display_identity(review)

    data = {
        "id": review.id,
        "rating": review.rating,
        "headline": review.headline,
        "body": review.body,
        "status": review.status,
        "is_featured": review.is_featured,
        "display_email": display_email,
        "plan_label": plan_label,
        "images": [img.to_dict() for img in review.images.order_by(ReviewImage.sort_order).all()],
        "created_at": review.created_at.isoformat(),
        "updated_at": review.updated_at.isoformat(),
        "approved_at": review.approved_at.isoformat() if review.approved_at else None,
    }
    if admin:
        data["user_id"] = review.user_id
        data["user_email"] = review.user.email if review.user else None
        data["manual_email"] = review.manual_email
        data["manual_plan_label"] = review.manual_plan_label
        data["admin_note"] = review.admin_note
        data["moderated_by_user_id"] = review.moderated_by_user_id
        data["moderated_by_email"] = (
            review.moderated_by.email if review.moderated_by else None
        )
    return data
