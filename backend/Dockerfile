FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy steam modules (root level)
COPY steam_guard.py .
COPY steam_client.py .

# Copy backend app
COPY backend/ ./backend/

# Add project root to PYTHONPATH so steam_guard/steam_client can be found
ENV PYTHONPATH="/app:/app/backend"

WORKDIR /app/backend

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "3", "--timeout", "300", "run:app"]
