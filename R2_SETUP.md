# Cloudflare R2 Image Upload Setup Guide

This guide will help you set up Cloudflare R2 for product image uploads.

## Prerequisites

- Cloudflare account
- Backend has a Python virtual environment (venv)

## 1. Install Backend Dependencies

```bash
cd backend
source venv/bin/activate  # Activate your virtual environment
pip install -r requirements.txt
```

This will install:
- `aioboto3==12.1.0` - Async S3-compatible client for R2
- `Pillow==10.1.0` - Image processing library

## 2. Create Cloudflare R2 Bucket

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to **R2** in the sidebar
3. Click **Create bucket**
4. Name: `statbricks-products` (or your preferred name)
5. Click **Create bucket**

### Enable Public Access (Option A - Easiest)

1. Go to your bucket settings
2. Click **Settings** tab
3. Under **Public access**, click **Allow Access**
4. Copy the **Public R2.dev subdomain** (e.g., `https://pub-abc123.r2.dev`)

### Custom Domain (Option B - Production)

1. Go to your bucket settings
2. Click **Settings** tab → **Custom Domains**
3. Add your domain (e.g., `cdn.statbricks.com`)
4. Follow DNS setup instructions
5. Use this custom domain as your R2_PUBLIC_URL

## 3. Generate R2 API Tokens

1. In R2 dashboard, click **Manage R2 API Tokens**
2. Click **Create API token**
3. **Token name**: `statbricks-product-images`
4. **Permissions**: Select **Object Read & Write**
5. **Bucket scope**: Select your bucket (`statbricks-products`)
6. Click **Create API Token**
7. **IMPORTANT**: Copy these values immediately (shown only once):
   - Access Key ID
   - Secret Access Key
   - Endpoint URL (format: `https://<account-id>.r2.cloudflarestorage.com`)

## 4. Configure Backend Environment

Edit `backend/.env` (create if it doesn't exist):

```bash
# Cloudflare R2 Configuration
R2_ENDPOINT_URL=https://abc123def456.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key-here
R2_SECRET_ACCESS_KEY=your-secret-access-key-here
R2_BUCKET_NAME=statbricks-products
R2_PUBLIC_URL=https://pub-abc123.r2.dev
```

**Replace with your actual values from steps 2 and 3!**

## 5. Configure Frontend Environment

Create/edit `frontend/.env`:

```bash
# Cloudflare R2 Configuration
VITE_R2_PUBLIC_URL=https://pub-abc123.r2.dev
```

**Use the same public URL as backend R2_PUBLIC_URL!**

## 6. Test the Setup

### Start Backend
```bash
cd backend
source venv/bin/activate
python main.py
```

Backend should start without errors on `http://localhost:8000`

### Start Frontend
```bash
cd frontend
yarn dev
```

Frontend should start on `http://localhost:5173`

### Test Image Upload

1. Open browser to `http://localhost:5173`
2. Login with your credentials
3. Navigate to **Inventory**
4. Click **Add Product**
5. Fill in product details
6. Click **Choose Image** button
7. Select a JPG/PNG/WebP image (max 5MB)
8. You should see a preview of the image
9. Click **Create Product**
10. Image should upload successfully
11. Product should display with image in both Inventory and POS pages

### Verify in Cloudflare R2

1. Go to R2 dashboard → Your bucket
2. You should see folders like:
   - `tenant_1/`
     - `product_123_1234567890.jpg` (original)
     - `product_123_1234567890_optimized.jpg` (800x800)
     - `product_123_1234567890_thumb.jpg` (300x300)

## 7. Edit Product Images

1. Go to **Inventory**
2. Click **Edit** (pencil icon) on any product
3. You should see:
   - Current product image (if exists)
   - **Choose Image** button to upload new image
   - **Change Image** button to replace existing image
   - **Delete Image** button to remove image
4. Upload/change/delete as needed
5. Click **Update Product** to save

## Troubleshooting

### "Choose Image" button doesn't work
- **Issue**: File input not triggering
- **Solution**: Already fixed in code - button uses `document.getElementById()?.click()`

### Images not displaying
- **Check 1**: Verify `VITE_R2_PUBLIC_URL` in `frontend/.env` is correct
- **Check 2**: Verify bucket has public access enabled
- **Check 3**: Open browser DevTools → Network tab, check if image URLs are correct
- **Check 4**: Try accessing image URL directly in browser

### Upload fails with "Failed to upload to cloud storage"
- **Check 1**: Verify R2 credentials in `backend/.env`
- **Check 2**: Check bucket name matches exactly
- **Check 3**: Verify API token has **Object Read & Write** permissions
- **Check 4**: Check backend logs for detailed error

### Image too large error
- **Max file size**: 5MB
- **Supported formats**: JPG, PNG, WebP
- **Solution**: Compress image before uploading or edit validation in `backend/image_utils.py`

### Missing dependencies error
- **Error**: `ModuleNotFoundError: No module named 'aioboto3'`
- **Solution**:
  ```bash
  cd backend
  source venv/bin/activate
  pip install -r requirements.txt
  ```

### CORS errors in browser
- Backend CORS is already configured for `http://localhost:5173`
- If using different port, update `backend/main.py` line 36:
  ```python
  allow_origins=["http://localhost:5173", "http://localhost:YOUR_PORT"]
  ```

## Production Deployment (Render.com)

When deploying to Render:

1. **Environment Variables**: Add in Render dashboard:
   ```
   R2_ENDPOINT_URL=https://...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET_NAME=statbricks-products
   R2_PUBLIC_URL=https://pub-abc123.r2.dev
   ```

2. **Frontend Build**: Render will use `.env` during build
   - Or set `VITE_R2_PUBLIC_URL` as Render environment variable

3. **R2 Bucket**: Use same bucket for staging/production, separate by subdomain:
   - Production: `prod.statbricks.com` → uses `tenant_X/` folders
   - Staging: `staging.statbricks.com` → uses different tenants

## Image Specifications

- **Upload formats**: JPG, PNG, WebP
- **Max file size**: 5MB
- **Min dimensions**: 100x100px
- **Max dimensions**: 4000x4000px
- **Recommended size**: 800x800px or larger

**Generated variants**:
1. **Original**: Stored as uploaded (converted to JPEG)
2. **Optimized**: 800x800px, quality 85% - for detail views
3. **Thumbnail**: 300x300px, quality 80% - for cards and lists

All images are Progressive JPEG for faster perceived loading.

## Cost Estimate (Cloudflare R2)

- **Storage**: $0.015/GB/month
- **Class A operations** (write): $4.50 per million requests
- **Class B operations** (read): $0.36 per million requests
- **Egress**: **FREE** (no bandwidth charges!)

**Example**: 1000 products with images:
- Average 3 variants × 200KB each = 600KB per product
- Total storage: 600MB = ~$0.01/month
- Very cost-effective for small-medium businesses!

## Need Help?

- Check backend logs: `cd backend && python main.py` (watch console)
- Check browser DevTools console for frontend errors
- Verify R2 credentials are correct
- Ensure bucket permissions are set correctly
