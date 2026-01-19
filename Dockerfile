# Multi-stage build for smaller final image
FROM node:18-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Python backend stage
FROM python:3.10-slim

WORKDIR /app

# Copy backend files
COPY backend/ ./backend/
COPY docs/ ./docs/

# Copy built frontend from previous stage
COPY --from=frontend-build /app/frontend/build ./frontend/build

# Install Python dependencies
WORKDIR /app/backend
RUN pip install --no-cache-dir -r requirements.txt

# Initialize database with default data
RUN python init_db.py

# Expose port
EXPOSE 5000

# Create volume for database persistence
VOLUME ["/app/backend"]

# Set environment variables
ENV FLASK_ENV=production
ENV TIMEZONE=Europe/Paris
ENV DATABASE_PATH=soundmeter.db

# Run with Gunicorn (production server)
CMD ["python", "-m", "gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
