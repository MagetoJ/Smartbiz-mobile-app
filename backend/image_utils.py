"""
Image processing and R2 upload utilities for product images.
Handles validation, resizing, optimization, and cloud storage.
"""

from fastapi import UploadFile, HTTPException
from PIL import Image
import io
import time
import asyncio
from pathlib import Path
from typing import Optional
from r2_client import get_r2_client
from config import settings
from botocore.exceptions import ClientError


# Configuration
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
MIN_DIMENSION = 100  # Minimum width or height in pixels
MAX_DIMENSION = 4000  # Maximum width or height in pixels

# Image variant sizes
THUMBNAIL_SIZE = (300, 300)  # For POS cards and inventory grid
OPTIMIZED_SIZE = (800, 800)  # For detail views


def validate_image_file(file: UploadFile) -> None:
    """
    Validate uploaded file is a valid image.

    Args:
        file: UploadFile from FastAPI

    Raises:
        HTTPException: If file is invalid
    """
    # Check file extension
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    file_ext = file.filename.lower().split('.')[-1]
    if f".{file_ext}" not in ALLOWED_EXTENSIONS:
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


def create_thumbnail(image: Image.Image, size: tuple) -> Image.Image:
    """
    Create a thumbnail maintaining aspect ratio.

    Args:
        image: PIL Image object
        size: Target size tuple (width, height)

    Returns:
        PIL Image object (thumbnail)
    """
    # Create a copy to avoid modifying original
    thumb = image.copy()

    # Convert RGBA to RGB (for JPEG compatibility)
    if thumb.mode == 'RGBA':
        # Create white background
        background = Image.new('RGB', thumb.size, (255, 255, 255))
        background.paste(thumb, mask=thumb.split()[3])  # 3 is the alpha channel
        thumb = background
    elif thumb.mode != 'RGB':
        thumb = thumb.convert('RGB')

    # Resize maintaining aspect ratio
    thumb.thumbnail(size, Image.Resampling.LANCZOS)

    return thumb


def optimize_image(image: Image.Image, quality: int = 85) -> bytes:
    """
    Optimize image for web delivery.

    Args:
        image: PIL Image object
        quality: JPEG quality (1-100, default 85)

    Returns:
        bytes: Optimized image data
    """
    # Convert to RGB if needed
    if image.mode == 'RGBA':
        background = Image.new('RGB', image.size, (255, 255, 255))
        background.paste(image, mask=image.split()[3])
        image = background
    elif image.mode != 'RGB':
        image = image.convert('RGB')

    # Save to bytes buffer with optimization
    buffer = io.BytesIO()
    image.save(
        buffer,
        format='JPEG',
        quality=quality,
        optimize=True,
        progressive=True  # Progressive JPEG for faster perceived loading
    )
    buffer.seek(0)
    return buffer.getvalue()


async def upload_to_r2(file_data: bytes, object_key: str, content_type: str = 'image/jpeg'):
    """
    Upload file to Cloudflare R2.

    Args:
        file_data: Image data as bytes
        object_key: R2 object path (e.g., "tenant_1/product_123_1234567890.jpg")
        content_type: MIME type

    Raises:
        HTTPException: If upload fails
    """
    try:
        async with get_r2_client() as client:
            await client.put_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=object_key,
                Body=file_data,
                ContentType=content_type
            )
    except ClientError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload to cloud storage: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error during upload: {str(e)}"
        )


async def delete_from_r2(object_key_pattern: str):
    """
    Delete file and its variants from R2.

    Args:
        object_key_pattern: Base path without variant suffix
                           (e.g., "tenant_1/product_123_1234567890.jpg")

    Note: Deletes original, _optimized, and _thumb variants
    """
    try:
        async with get_r2_client() as client:
            # Generate all variant keys
            base_path = object_key_pattern.rsplit('.', 1)[0]  # Remove extension
            extension = object_key_pattern.rsplit('.', 1)[1] if '.' in object_key_pattern else 'jpg'

            variants = [
                object_key_pattern,  # Original
                f"{base_path}_optimized.{extension}",
                f"{base_path}_thumb.{extension}"
            ]

            # Delete all variants
            for key in variants:
                try:
                    await client.delete_object(
                        Bucket=settings.R2_BUCKET_NAME,
                        Key=key
                    )
                    print(f"Deleted R2 object: {key}")
                except ClientError as e:
                    # Ignore if object doesn't exist
                    if e.response['Error']['Code'] != 'NoSuchKey':
                        print(f"Warning: Failed to delete {key}: {e}")

    except Exception as e:
        print(f"Warning: Error during R2 deletion: {e}")


async def process_and_upload_product_image(
    file: UploadFile,
    tenant_id: int,
    product_id: int,
    old_image_path: Optional[str] = None
) -> str:
    """
    Process product image and upload all variants to R2.

    Process flow:
    1. Validate file (type, size, MIME)
    2. Load and validate image with Pillow
    3. Create optimized (800x800) and thumbnail (300x300) versions
    4. Upload all 3 variants to R2 in parallel
    5. Delete old images if updating
    6. Return R2 object path

    Args:
        file: UploadFile from FastAPI
        tenant_id: Tenant ID for path isolation
        product_id: Product ID for filename
        old_image_path: Previous image path to delete (optional)

    Returns:
        str: R2 object path (e.g., "tenant_1/product_123_1234567890.jpg")

    Raises:
        HTTPException: If validation or processing fails
    """
    # Validate file
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

    # Load image with Pillow
    try:
        image = Image.open(io.BytesIO(content))
        image.verify()  # Verify it's a valid image
        # Re-open after verify (verify() closes the file)
        image = Image.open(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid or corrupted image file: {str(e)}"
        )

    # Validate dimensions
    width, height = image.size
    if width < MIN_DIMENSION or height < MIN_DIMENSION:
        raise HTTPException(
            status_code=400,
            detail=f"Image too small. Minimum dimensions: {MIN_DIMENSION}x{MIN_DIMENSION}px"
        )
    if width > MAX_DIMENSION or height > MAX_DIMENSION:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large. Maximum dimensions: {MAX_DIMENSION}x{MAX_DIMENSION}px"
        )

    # Generate unique filename with timestamp
    timestamp = int(time.time())
    file_ext = file.filename.lower().split('.')[-1]
    # Normalize extension to jpg
    if file_ext in ['jpeg', 'jpg']:
        file_ext = 'jpg'

    # Base path: products/tenant_X/product_Y_timestamp.ext
    base_filename = f"product_{product_id}_{timestamp}"
    base_path = f"products/tenant_{tenant_id}/{base_filename}.{file_ext}"

    # Create variants
    try:
        # Original (store as-is but convert to JPEG) - reduced quality for faster processing
        original_data = optimize_image(image, quality=85)

        # Optimized version (800x800) - reduced quality
        optimized_img = create_thumbnail(image, OPTIMIZED_SIZE)
        optimized_data = optimize_image(optimized_img, quality=80)

        # Thumbnail version (300x300) - reduced quality
        thumb_img = create_thumbnail(image, THUMBNAIL_SIZE)
        thumb_data = optimize_image(thumb_img, quality=75)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process image: {str(e)}"
        )

    # Upload all variants to R2
    try:
        # Generate R2 keys
        original_key = base_path
        optimized_key = f"products/tenant_{tenant_id}/{base_filename}_optimized.{file_ext}"
        thumb_key = f"products/tenant_{tenant_id}/{base_filename}_thumb.{file_ext}"

        # Upload all variants
        await upload_to_r2(original_data, original_key, 'image/jpeg')
        await upload_to_r2(optimized_data, optimized_key, 'image/jpeg')
        await upload_to_r2(thumb_data, thumb_key, 'image/jpeg')

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload images: {str(e)}"
        )

    # Delete old images if updating
    if old_image_path:
        await delete_from_r2(old_image_path)

    # Return base path (frontend will append variant suffix as needed)
    return base_path


async def process_and_upload_logo(
    file: UploadFile,
    tenant_id: int,
    old_logo_url: Optional[str] = None
) -> str:
    """
    Process and upload business logo to Cloudflare R2 with variants.

    Creates 2 variants:
    - Original: Full resolution, quality 95
    - Display: 400x400px, quality 90

    Args:
        file: Uploaded file from FastAPI
        tenant_id: Tenant ID for organizing uploads
        old_logo_url: Previous logo URL to delete (if updating)

    Returns:
        str: R2 object path (base path without variant suffix)
        Example: "logos/tenant_1/logo_1736524800.jpg"

    Raises:
        HTTPException: If file validation or upload fails
    """
    # 1. Validate file
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_MIME_TYPES)}"
        )

    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file extension. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # 2. Read and validate image
    try:
        content = await file.read()

        # Check file size
        file_size = len(content)
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size: {MAX_FILE_SIZE / (1024*1024):.1f}MB"
            )

        image = Image.open(io.BytesIO(content))

        # Validate dimensions
        width, height = image.size
        if width < 100 or height < 100:
            raise HTTPException(
                status_code=400,
                detail=f"Image too small. Minimum 100x100px. Got {width}x{height}px"
            )
        if width > 2000 or height > 2000:
            raise HTTPException(
                status_code=400,
                detail=f"Image too large. Maximum 2000x2000px. Got {width}x{height}px"
            )

    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")

    # 3. Generate base filename
    timestamp = int(time.time())
    base_filename = f"logo_{timestamp}"
    output_ext = ".jpg"  # Always convert to JPEG for consistency

    # 4. Prepare image (convert RGBA to RGB if needed)
    if image.mode == 'RGBA':
        background = Image.new('RGB', image.size, (255, 255, 255))
        background.paste(image, mask=image.split()[3])
        image = background
    elif image.mode != 'RGB':
        image = image.convert('RGB')

    # 5. Create variants
    variants = {}

    # Original variant - High quality, preserve dimensions
    original_buffer = io.BytesIO()
    image.save(
        original_buffer,
        format='JPEG',
        quality=95,
        optimize=True,
        progressive=True
    )
    variants['original'] = original_buffer.getvalue()

    # Display variant - 400x400px, maintain aspect ratio
    display_size = (400, 400)
    display_image = image.copy()
    display_image.thumbnail(display_size, Image.Resampling.LANCZOS)

    display_buffer = io.BytesIO()
    display_image.save(
        display_buffer,
        format='JPEG',
        quality=90,
        optimize=True,
        progressive=True
    )
    variants['display'] = display_buffer.getvalue()

    # 6. Construct R2 paths
    base_path = f"logos/tenant_{tenant_id}/{base_filename}{output_ext}"

    upload_tasks = []

    # Upload original
    upload_tasks.append(
        upload_to_r2(
            file_data=variants['original'],
            object_key=base_path,
            content_type='image/jpeg'
        )
    )

    # Upload display variant
    display_path = f"logos/tenant_{tenant_id}/{base_filename}_display{output_ext}"
    upload_tasks.append(
        upload_to_r2(
            file_data=variants['display'],
            object_key=display_path,
            content_type='image/jpeg'
        )
    )

    # 7. Upload all variants to R2
    await asyncio.gather(*upload_tasks)

    # 8. Clean up old logo if exists
    if old_logo_url:
        try:
            # Delete both variants of old logo
            old_base = old_logo_url.replace('.jpg', '').replace('.png', '').replace('.jpeg', '')
            old_ext = '.jpg'  # Assume jpg since we always save as jpg

            delete_tasks = [
                delete_from_r2(f"{old_base}{old_ext}"),  # Original
                delete_from_r2(f"{old_base}_display{old_ext}")  # Display
            ]
            await asyncio.gather(*delete_tasks, return_exceptions=True)
        except Exception as e:
            print(f"Warning: Failed to delete old logo {old_logo_url}: {e}")

    return base_path
