#!/bin/bash
set -e

# Playfast Deploy Script
# Run on the VPS: ./deploy.sh

APP_DIR="/opt/playfast"
REPO_URL="https://github.com/YOUR_REPO/playfast.git"  # Update this

echo "=== Playfast Deploy ==="

# Create app directory if needed
sudo mkdir -p "$APP_DIR"
cd "$APP_DIR"

# Pull latest code (or clone if first time)
if [ -d ".git" ]; then
    echo "Pulling latest..."
    git pull
else
    echo "Cloning..."
    git clone "$REPO_URL" .
fi

# Create .env if not exists
if [ ! -f ".env" ]; then
    echo "Creating .env from template..."
    cp .env.production .env
    # Generate random secrets
    RANDOM_PG=$(openssl rand -hex 16)
    RANDOM_JWT=$(openssl rand -hex 32)
    sed -i "s/playfast_change_this_password/$RANDOM_PG/" .env
    sed -i "s/change-this-to-a-random-64-char-string/$RANDOM_JWT/" .env
    echo ">> .env created with random secrets. Review it: cat .env"
fi

# Build and start
echo "Building containers..."
docker compose build --no-cache

echo "Starting services..."
docker compose up -d

# Wait for DB
echo "Waiting for PostgreSQL..."
sleep 5

# Initialize database + admin user
echo "Initializing database..."
docker compose exec backend python -c "
from app import create_app
from app.extensions import db
from app.models import User
app = create_app()
with app.app_context():
    db.create_all()
    if not User.query.filter_by(email='admin@playfast.id').first():
        admin = User(email='admin@playfast.id', is_admin=True)
        admin.set_password('admin123')
        db.session.add(admin)
        db.session.commit()
        print('Admin created: admin@playfast.id / admin123')
    else:
        print('Admin already exists')
    print('Database ready!')
"

# Setup Nginx
echo "Configuring Nginx..."
sudo cp nginx/playfast.conf /etc/nginx/sites-available/playfast
sudo ln -sf /etc/nginx/sites-available/playfast /etc/nginx/sites-enabled/playfast
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "=== Deploy Complete ==="
echo "Site: https://playfast.andev.web.id"
echo "Admin: admin@playfast.id / admin123 (CHANGE THIS!)"
echo ""
docker compose ps
