"""Authentication endpoints: register, login, logout, current user."""

import re

from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt_identity,
    jwt_required,
    set_access_cookies,
    set_refresh_cookies,
    unset_jwt_cookies,
)

from flask import current_app

from app.extensions import db
from app.models import EmailVerificationToken, PasswordResetToken, User
from app.email_service import send_password_reset_email, send_verification_email

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    # Basic email format validation
    if "@" not in email or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return jsonify({"error": "Invalid email format"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 409

    user = User(email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.flush()

    # Generate unique referral code for this user
    import secrets, string
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(20):
        candidate = ''.join(secrets.choice(alphabet) for _ in range(6))
        if not User.query.filter_by(referral_code=candidate).first():
            user.referral_code = candidate
            break

    # Apply referrer link if referral_code was provided
    input_ref = (data.get("referral_code") or "").strip().upper()
    if input_ref:
        referrer = User.query.filter_by(referral_code=input_ref).first()
        if referrer and referrer.id != user.id and referrer.email != user.email:
            user.referred_by_user_id = referrer.id
        # If invalid/self/same-email, silently skip — soft error (don't block registration)

    # Send verification email
    token = EmailVerificationToken.create_for_user(user.id)
    db.session.commit()

    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
    verify_url = f"{frontend_url}/verify-email?token={token.token}"
    send_verification_email(email, verify_url)

    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    response = jsonify({
        "message": "Registration successful",
        "user": user.to_dict(),
        "access_token": access_token,
    })
    set_access_cookies(response, access_token)
    set_refresh_cookies(response, refresh_token)
    return response, 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid email or password"}), 401

    if not user.is_active:
        return jsonify({"error": "Account has been deactivated"}), 403

    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    response = jsonify({
        "message": "Login successful",
        "user": user.to_dict(),
        "access_token": access_token,
    })
    set_access_cookies(response, access_token)
    set_refresh_cookies(response, refresh_token)
    return response, 200


@auth_bp.route("/logout", methods=["POST"])
def logout():
    response = jsonify({"message": "Logged out"})
    unset_jwt_cookies(response)
    return response, 200


@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    """Issue a new access token using a valid refresh token cookie."""
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    if not user or not user.is_active:
        return jsonify({"error": "Invalid user"}), 401

    new_access_token = create_access_token(identity=str(user.id))

    response = jsonify({"message": "Token refreshed", "access_token": new_access_token})
    set_access_cookies(response, new_access_token)
    return response, 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"user": user.to_dict()}), 200


@auth_bp.route("/profile", methods=["PUT"])
@jwt_required()
def update_profile():
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json() or {}

    current_password = data.get("current_password") or ""
    new_email = data.get("email")
    new_password = data.get("password")

    if not new_email and not new_password:
        return jsonify({"error": "Nothing to update"}), 400

    # Changing password requires current_password verification
    if new_password:
        if not current_password:
            return jsonify({"error": "Current password is required to change password"}), 400
        if not user.check_password(current_password):
            return jsonify({"error": "Current password is incorrect"}), 403
        if len(new_password) < 6:
            return jsonify({"error": "New password must be at least 6 characters"}), 400
        user.set_password(new_password)

    # Changing email requires uniqueness check
    if new_email:
        new_email = new_email.strip().lower()
        if "@" not in new_email or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", new_email):
            return jsonify({"error": "Invalid email format"}), 400
        if new_email != user.email:
            if not current_password:
                return jsonify({"error": "Current password is required to change email"}), 400
            if not user.check_password(current_password):
                return jsonify({"error": "Current password is incorrect"}), 403
            if User.query.filter_by(email=new_email).first():
                return jsonify({"error": "Email already in use"}), 409
            user.email = new_email

    db.session.commit()
    return jsonify({"message": "Profile updated successfully", "user": user.to_dict()}), 200


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    """Request a password reset. Creates a token and sends email."""
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()

    if not email:
        return jsonify({"error": "Email harus diisi"}), 400

    user = User.query.filter_by(email=email).first()

    # Always return success to prevent email enumeration
    if not user or not user.is_active:
        return jsonify({
            "message": "Jika email terdaftar, instruksi reset password akan dikirim."
        }), 200

    token = PasswordResetToken.create_for_user(user.id)
    db.session.commit()

    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
    reset_url = f"{frontend_url}/reset-password?token={token.token}"
    send_password_reset_email(email, reset_url)

    return jsonify({
        "message": "Jika email terdaftar, instruksi reset password akan dikirim.",
    }), 200


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    """Reset password using a valid token."""
    data = request.get_json() or {}
    token_str = (data.get("token") or "").strip()
    new_password = data.get("password") or ""

    if not token_str:
        return jsonify({"error": "Token tidak valid"}), 400
    if len(new_password) < 6:
        return jsonify({"error": "Password minimal 6 karakter"}), 400

    token = PasswordResetToken.validate(token_str)
    if not token:
        return jsonify({"error": "Token tidak valid atau sudah kedaluwarsa"}), 400

    user = db.session.get(User, token.user_id)
    if not user:
        return jsonify({"error": "User tidak ditemukan"}), 404

    user.set_password(new_password)
    token.is_used = True
    db.session.commit()

    return jsonify({"message": "Password berhasil direset. Silakan login."}), 200


@auth_bp.route("/verify-email", methods=["POST"])
def verify_email():
    """Verify email using a token."""
    data = request.get_json() or {}
    token_str = (data.get("token") or "").strip()

    if not token_str:
        return jsonify({"error": "Token tidak valid"}), 400

    token = EmailVerificationToken.validate(token_str)
    if not token:
        return jsonify({"error": "Token tidak valid atau sudah kedaluwarsa"}), 400

    user = db.session.get(User, token.user_id)
    if not user:
        return jsonify({"error": "User tidak ditemukan"}), 404

    user.email_verified = True
    token.is_used = True
    db.session.commit()

    return jsonify({"message": "Email berhasil diverifikasi!"}), 200


@auth_bp.route("/resend-verification", methods=["POST"])
@jwt_required()
def resend_verification():
    """Resend the verification email for the current user."""
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User tidak ditemukan"}), 404

    if user.email_verified:
        return jsonify({"message": "Email sudah terverifikasi"}), 200

    token = EmailVerificationToken.create_for_user(user.id)
    db.session.commit()

    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
    verify_url = f"{frontend_url}/verify-email?token={token.token}"
    send_verification_email(user.email, verify_url)

    return jsonify({"message": "Email verifikasi telah dikirim ulang."}), 200
