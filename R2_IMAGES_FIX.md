# R2 Images Not Showing - FIX GUIDE

## 🔍 Problem Identified

Images upload successfully to Cloudflare R2, but **don't display** on the frontend because the frontend service is missing the `VITE_R2_PUBLIC_URL` environment variable.

### How It Works:

1. ✅ **Backend uploads to R2** → Stores path like `products/tenant_1/product_123_timestamp.jpg`
2. ✅ **Backend saves path to database** → Stores R2 object key
3. ✅ **Frontend fetches product** → Gets R2 path from API
4. ❌ **Frontend can't display** → Missing `VITE_R2_PUBLIC_URL` to construct full URL
5. 📦 **Shows placeholder** → Because `getImageUrl()` returns `null`

### The Code:

**ProductImage.tsx & BusinessLogo.tsx:**
```typescript
const r2BaseUrl = import.meta.env.VITE_R2_PUBLIC_URL || '';
if (!r2BaseUrl) return null; // ← Returns null, shows placeholder!
```

---

## ✅ SOLUTION: Add Environment Variable to Render

### Step 1: Get Your R2 Public URL

Your R2 public URL should look like:
```
https://pub-xxxxxxxxxxxxxxxxxxxxx.r2.dev
```

Or if you have a custom domain:
```
https://cdn.yourdomain.com
```

### Step 2: Add to Render Dashboard

1. Go to **Render Dashboard**: https://dashboard.render.com
2. Select your **frontend service** (`statbricks-frontend`)
3. Go to **Environment** tab
4. Click **Add Environment Variable**
5. Add:
   - **Key**: `VITE_R2_PUBLIC_URL`
   - **Value**: `https://pub-xxxxxxxxxxxxxxxxxxxxx.r2.dev` (your actual R2 public URL)
6. Click **Save**
7. **Redeploy** the frontend service

### Step 3: Verify in Render.yaml

Your `render.yaml` already has this configured (just needs the value set):

```yaml
# Frontend service
envVars:
  - key: VITE_R2_PUBLIC_URL
    sync: false  # ✅ This means: Set manually in dashboard
```

---

## 🧪 How to Test

After redeployment:

1. **Upload a new product image** or **business logo**
2. **Refresh the page**
3. **Images should now appear** ✅

### Check Browser Console:

Open DevTools → Network tab:
- ✅ **Before fix**: Image requests to `/api/uploads/...` (404)
- ✅ **After fix**: Image requests to `https://pub-xxx.r2.dev/products/...` (200)

---

## 📋 Checklist

- [ ] Get R2 public URL from Cloudflare dashboard
- [ ] Add `VITE_R2_PUBLIC_URL` to Render frontend service
- [ ] Redeploy frontend service
- [ ] Test image upload
- [ ] Verify images display correctly

---

## 🔧 Troubleshooting

### Still Not Working?

**1. Check R2 Public Access**
- Go to Cloudflare R2 dashboard
- Select your bucket
- Go to **Settings** → **Public Access**
- Ensure **Public URL** is enabled

**2. Check CORS Settings**
In Cloudflare R2:
- Go to bucket → **Settings** → **CORS Policy**
- Add this policy:
```json
[
  {
    "AllowedOrigins": [
      "https://statbricks-frontend.onrender.com",
      "https://your-custom-domain.com"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

**3. Check Environment Variable**
SSH into Render or check logs:
```bash
echo $VITE_R2_PUBLIC_URL
```
Should output your R2 URL.

**4. Hard Refresh**
Clear browser cache:
- Chrome/Edge: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- Firefox: `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)

---

## 📚 Additional Info

### Why VITE_ Prefix?

Vite only exposes environment variables that start with `VITE_` to the browser. This is a security feature to prevent accidentally exposing server secrets.

### Image URL Structure:

**Backend saves:**
```
products/tenant_1/product_123_1234567890.jpg
```

**Frontend constructs:**
```
https://pub-xxx.r2.dev/products/tenant_1/product_123_1234567890_thumb.jpg
```

Variants:
- `_thumb.jpg` → 300x300px (for POS cards)
- `_optimized.jpg` → 800x800px (for detail views)
- `.jpg` → Original (full resolution)

---

## ✅ Expected Result

After fix:
- ✅ Product images visible in POS
- ✅ Product images visible in Inventory
- ✅ Business logo visible in header
- ✅ Images persist after server restart
- ✅ Images load fast from R2 CDN
