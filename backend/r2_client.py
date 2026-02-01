"""
Cloudflare R2 client configuration and utilities.
Provides async context manager for S3-compatible R2 operations.
"""

import aioboto3
from contextlib import asynccontextmanager
from config import settings


@asynccontextmanager
async def get_r2_client():
    """
    Async context manager for Cloudflare R2 client.

    R2 is S3-compatible, so we use aioboto3's S3 client with R2 endpoint.

    Usage:
        async with get_r2_client() as client:
            await client.put_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key='path/to/file.jpg',
                Body=file_data,
                ContentType='image/jpeg'
            )

    Yields:
        aioboto3.S3.Client: Async S3 client configured for R2
    """
    session = aioboto3.Session()
    async with session.client(
        's3',
        endpoint_url=settings.R2_ENDPOINT_URL,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name='auto'  # R2 doesn't use regions, 'auto' is convention
    ) as client:
        yield client


async def upload_receipt_pdf(receipt_number: str, pdf_bytes: bytes) -> str:
    """
    Upload receipt PDF to R2 storage and return public URL.
    
    Args:
        receipt_number: Receipt number (e.g., "RCPT-00000123")
        pdf_bytes: PDF file content as bytes
        
    Returns:
        str: Public URL to the uploaded PDF
        
    Raises:
        Exception: If upload fails or R2 not configured
    """
    if not settings.R2_BUCKET_NAME or not settings.R2_PUBLIC_URL:
        raise Exception("R2 storage not configured")
    
    # Store in receipts folder with receipt number as filename
    key = f"receipts/{receipt_number}.pdf"
    
    async with get_r2_client() as client:
        await client.put_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=key,
            Body=pdf_bytes,
            ContentType='application/pdf',
            CacheControl='public, max-age=31536000'  # Cache for 1 year
        )
    
    # Construct public URL
    public_url = f"{settings.R2_PUBLIC_URL}/{key}"
    return public_url
