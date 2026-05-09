"""User-facing review endpoints.

- GET  /api/reviews                List approved reviews (paginated, filters)
- GET  /api/reviews/featured       Top-rated recent approved reviews (landing)
- GET  /api/reviews/eligibility    Whether the current user can submit
- GET  /api/reviews/me             Current user's review (any status)
- POST /api/reviews                Submit a new review (multipart/form-data)
- PATCH /api/reviews/me            Edit own review while still pending
- DELETE /api/reviews/me           Delete own pending review
"""

import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required, verify_jwt_in_request
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import Review, ReviewImage, User
from app.reviews.service import (
    ALLOWED_EXT,
    MAX_IMAGES_PER_REVIEW,
    MAX_IMAGE_SIZE_BYTES,
    delete_review_image_file,
    is_eligible_to_review,
    process_review_image,
    serialize_review,
)

logger = logging.getLogger(__name__)

reviews_bp = Blueprint("reviews", __name__, url_prefix="/api/reviews")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_optional_user() -> User | None:
    try:
        verify_jwt_in_request(optional=True)
        uid = get_jwt_identity()
        if uid is None:
            return None
        return db.session.get(User, int(uid))
    except Exception:
        return None


def _validate_review_payload(rating, body, headline) -> str | None:
    try:
        rating_int = int(rating)
    except (TypeError, ValueError):
        return "Rating wajib angka 1-5"
    if rating_int < 1 or rating_int > 5:
        return "Rating harus 1-5"
    if not body or not body.strip():
        return "Body review wajib diisi"
    if len(body) > 5000:
        return "Body review terlalu panjang (max 5000 karakter)"
    if headline and len(headline) > 200:
        return "Headline terlalu panjang (max 200 karakter)"
    return None


def _validate_uploaded_files(files) -> str | None:
    if len(files) > MAX_IMAGES_PER_REVIEW:
        return f"Maksimal {MAX_IMAGES_PER_REVIEW} foto per review"
    for f in files:
        if not f.filename:
            continue
        ext = ("." + f.filename.rsplit(".", 1)[-1].lower()) if "." in f.filename else ""
        if ext not in ALLOWED_EXT:
            return f"Format tidak didukung: {f.filename}"
        # Size check: read end-pos via stream
        f.stream.seek(0, 2)
        size = f.stream.tell()
        f.stream.seek(0)
        if size > MAX_IMAGE_SIZE_BYTES:
            return f"Ukuran {f.filename} melebihi 5 MB"
    return None


def _save_images(review: Review, files, *, start_sort: int = 0) -> int:
    """Process and persist uploaded images. Returns count saved.
    Caller is responsible for committing the session.
    """
    saved = 0
    for f in files:
        if not f.filename:
            continue
        url = process_review_image(f, review.id)
        ri = ReviewImage(review_id=review.id, url=url, sort_order=start_sort + saved)
        db.session.add(ri)
        saved += 1
    return saved


# ---------------------------------------------------------------------------
# Public listing
# ---------------------------------------------------------------------------


@reviews_bp.route("", methods=["GET"])
def list_reviews():
    """Paginated public list. Filters: rating_gte, has_photo, sort."""
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(50, max(1, int(request.args.get("per_page", 12))))
    rating_gte = request.args.get("rating_gte", type=int)
    has_photo = request.args.get("has_photo") in ("1", "true", "yes")
    sort = request.args.get("sort", "newest")

    q = Review.query.filter_by(status="approved")
    if rating_gte:
        q = q.filter(Review.rating >= rating_gte)
    if has_photo:
        # Subquery: only reviews with at least one image
        q = q.filter(Review.images.any())

    # Featured always floats to the top regardless of sort.
    if sort == "rating":
        q = q.order_by(
            Review.is_featured.desc(),
            Review.rating.desc(),
            Review.approved_at.desc().nullslast(),
            Review.created_at.desc(),
        )
    else:  # newest
        q = q.order_by(
            Review.is_featured.desc(),
            Review.approved_at.desc().nullslast(),
            Review.created_at.desc(),
        )

    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1

    return jsonify({
        "items": [serialize_review(r) for r in items],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages,
    })


@reviews_bp.route("/featured", methods=["GET"])
def featured_reviews():
    """Top reviews for landing-page. Default rule: rating>=4, sort by approved/created
    desc, limit 3. Featured-flag floats to top."""
    limit = min(12, max(1, int(request.args.get("limit", 3))))
    items = (
        Review.query.filter_by(status="approved")
        .filter(Review.rating >= 4)
        .order_by(
            Review.is_featured.desc(),
            Review.rating.desc(),
            Review.approved_at.desc().nullslast(),
            Review.created_at.desc(),
        )
        .limit(limit)
        .all()
    )
    return jsonify({"items": [serialize_review(r) for r in items]})


# ---------------------------------------------------------------------------
# Eligibility / "my review"
# ---------------------------------------------------------------------------


@reviews_bp.route("/eligibility", methods=["GET"])
@jwt_required()
def eligibility():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return jsonify({"error": "User not found"}), 404

    eligible = is_eligible_to_review(user)
    existing = Review.query.filter_by(user_id=user.id).first()
    return jsonify({
        "eligible": eligible,
        "has_review": existing is not None,
        "review": serialize_review(existing) if existing else None,
    })


@reviews_bp.route("/me", methods=["GET"])
@jwt_required()
def my_review():
    user_id = int(get_jwt_identity())
    review = Review.query.filter_by(user_id=user_id).first()
    if not review:
        return jsonify({"review": None})
    return jsonify({"review": serialize_review(review)})


# ---------------------------------------------------------------------------
# Submit / edit / delete own
# ---------------------------------------------------------------------------


@reviews_bp.route("", methods=["POST"])
@jwt_required()
def submit_review():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return jsonify({"error": "User not found"}), 404
    if not is_eligible_to_review(user):
        return jsonify({
            "error": "Hanya pelanggan yang sudah pernah transaksi yang bisa menulis review."
        }), 403

    if Review.query.filter_by(user_id=user.id).first():
        return jsonify({"error": "Kamu sudah punya review. Edit review yang ada."}), 409

    rating = request.form.get("rating")
    body = (request.form.get("body") or "").strip()
    headline = (request.form.get("headline") or "").strip() or None

    err = _validate_review_payload(rating, body, headline)
    if err:
        return jsonify({"error": err}), 400

    files = request.files.getlist("images")
    err = _validate_uploaded_files(files)
    if err:
        return jsonify({"error": err}), 400

    review = Review(
        user_id=user.id,
        rating=int(rating),
        headline=headline,
        body=body,
        status="pending",
    )
    db.session.add(review)
    try:
        db.session.flush()  # need review.id for image storage
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Kamu sudah punya review."}), 409

    _save_images(review, files)
    db.session.commit()

    return jsonify({
        "message": "Review terkirim. Menunggu approval admin.",
        "review": serialize_review(review),
    }), 201


@reviews_bp.route("/me", methods=["PATCH"])
@jwt_required()
def edit_my_review():
    user_id = int(get_jwt_identity())
    review = Review.query.filter_by(user_id=user_id).first()
    if not review:
        return jsonify({"error": "Belum ada review."}), 404
    if review.status == "approved":
        return jsonify({
            "error": "Review sudah disetujui. Hubungi admin untuk perubahan."
        }), 403

    rating = request.form.get("rating", str(review.rating))
    body = (request.form.get("body") or review.body or "").strip()
    headline = (request.form.get("headline") or "").strip() or None

    err = _validate_review_payload(rating, body, headline)
    if err:
        return jsonify({"error": err}), 400

    review.rating = int(rating)
    review.body = body
    review.headline = headline
    # If admin previously rejected, resubmit puts it back to pending so they
    # see the edited version on next moderation pass.
    if review.status == "rejected":
        review.status = "pending"
        review.admin_note = None

    # Image handling — delete IDs in `delete_image_ids` (csv), then append new uploads
    delete_ids_raw = request.form.get("delete_image_ids", "")
    if delete_ids_raw:
        delete_ids = [
            int(x) for x in delete_ids_raw.split(",") if x.strip().isdigit()
        ]
        for img_id in delete_ids:
            img = db.session.get(ReviewImage, img_id)
            if img and img.review_id == review.id:
                delete_review_image_file(img.url)
                db.session.delete(img)

    files = request.files.getlist("images")
    if files:
        # Count current images after deletes
        current_count = review.images.count()
        if current_count + len([f for f in files if f.filename]) > MAX_IMAGES_PER_REVIEW:
            return jsonify({
                "error": f"Total foto melebihi maksimal {MAX_IMAGES_PER_REVIEW}."
            }), 400
        err = _validate_uploaded_files(files)
        if err:
            return jsonify({"error": err}), 400
        _save_images(review, files, start_sort=current_count)

    review.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    return jsonify({
        "message": "Review diperbarui.",
        "review": serialize_review(review),
    })


@reviews_bp.route("/me", methods=["DELETE"])
@jwt_required()
def delete_my_review():
    user_id = int(get_jwt_identity())
    review = Review.query.filter_by(user_id=user_id).first()
    if not review:
        return jsonify({"error": "Belum ada review."}), 404
    if review.status == "approved":
        return jsonify({
            "error": "Review sudah disetujui. Hubungi admin untuk hapus."
        }), 403

    for img in review.images.all():
        delete_review_image_file(img.url)
    db.session.delete(review)
    db.session.commit()
    return jsonify({"message": "Review dihapus."})
