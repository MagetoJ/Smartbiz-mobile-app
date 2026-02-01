# Backend API Dockerfile (FastAPI)
# Optimized for horizontal scaling on Render

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
# WeasyPrint requires: cairo, pango, gdk-pixbuf, fonts for PDF generation
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libpangoft2-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    fontconfig \
    fonts-liberation \
    fonts-dejavu-core \
    libjpeg62-turbo \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f -v

# Copy requirements and install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY . .

# Create uploads directory for local file storage
RUN mkdir -p uploads/logos

# Expose port (Render will set PORT env var)
EXPOSE 8000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
    CMD python -c "import requests; requests.get('http://localhost:8000/health', timeout=2)" || exit 1

# Run with uvicorn
# Bind to 0.0.0.0 and use PORT env var (Render requirement)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
