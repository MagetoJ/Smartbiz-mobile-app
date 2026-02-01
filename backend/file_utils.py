"""File upload utilities for handling logo uploads"""
from fastapi import UploadFile, HTTPException
from pathlib import Path
import os
import time
from typing import Optional


# Configuration
UPLOAD_DIR = Path(__file__).parent / "uploads" / "logos"
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


def ensure_upload_dir():
    """Create uploads directory if it doesn't exist"""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def validate_image_file(file: UploadFile) -> None:
    """Validate uploaded file is a valid image"""
    # Check file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Check MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid content type. Must be an image."
        )


async def save_logo(
    file: UploadFile,
    tenant_id: int,
    old_logo_url: Optional[str] = None
) -> str:
    """
    Save uploaded logo file and return the file path

    Args:
        file: UploadFile from FastAPI
        tenant_id: Tenant ID for filename
        old_logo_url: Previous logo URL to delete (optional)

    Returns:
        str: Relative path (e.g., "logos/tenant_1_1234567890.png")
    """
    ensure_upload_dir()
    validate_image_file(file)

    # Read file content
    content = await file.read()
    file_size = len(content)

    # Check file size
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE / (1024*1024):.1f}MB"
        )

    # Generate unique filename
    timestamp = int(time.time())
    file_ext = Path(file.filename).suffix.lower()
    filename = f"tenant_{tenant_id}_{timestamp}{file_ext}"
    file_path = UPLOAD_DIR / filename

    # Save file
    try:
        with open(file_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save file: {str(e)}"
        )

    # Delete old logo if it exists
    if old_logo_url:
        delete_logo(old_logo_url)

    return f"logos/{filename}"


def delete_logo(logo_url: str) -> None:
    """Delete logo file from filesystem"""
    try:
        file_path = UPLOAD_DIR.parent / logo_url
        if file_path.exists() and file_path.is_file():
            file_path.unlink()
            print(f"Deleted old logo: {logo_url}")
    except Exception as e:
        print(f"Warning: Failed to delete old logo {logo_url}: {e}")
