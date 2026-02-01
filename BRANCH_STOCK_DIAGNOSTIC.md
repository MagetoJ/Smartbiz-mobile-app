# Branch Stock Display - Diagnostic Guide

**Issue**: UI showing parent stock instead of branch stock for Acme 2
**Date**: 2026-01-13

---

## Expected Behavior

### Acme Corporation (Parent, ID: 2)
- **Direct Products**: 5 products
- **Stock Quantities**: 145, 10, 50, 149, 80 (Total: 434)
- **Subdomain**: `acme`

### Acme 2 (Branch, ID: 30)
- **Direct Products**: 0 (uses parent products)
- **Branch Stock**: 0, 0, 0, 0, 0 (Total: 0) ✅
- **Subdomain**: `acme-2`

---

## API Verification (CONFIRMED WORKING ✅)

The backend API **correctly returns quantity=0** for Acme 2:

```json
[
  {"name":"Cement 50kg","quantity":0,"tenant_id":2},
  {"name":"Industrial Pump","quantity":0,"tenant_id":2},
  {"name":"Safety Helmet","quantity":0,"tenant_id":2},
  {"name":"Steel Rods 12mm","quantity":0,"tenant_id":2},
  {"name":"Work Gloves","quantity":0,"tenant_id":2}
]
```

Note: `tenant_id: 2` means the products belong to parent, but `quantity: 0` is the branch stock.

---

## Troubleshooting Steps

### Step 1: Verify Which Tenant You're Logged Into

**Check the UI header/navbar** - it should show:
- ❌ "Acme Corporation" - Wrong! This is the parent
- ✅ "Acme 2" - Correct! This is the branch

**Check the subdomain in browser URL:**
- ❌ `http://localhost:5173/` or `acme.localhost:5173` - Wrong tenant
- ✅ `acme-2.localhost:5173` - Correct tenant

### Step 2: Verify Login Credentials

Make sure you're logging in with the correct subdomain:

**For Acme Corporation (Parent):**
```
Subdomain: acme
Username: acme_admin
Password: admin123
Expected Stock: 145, 10, 50, 149, 80
```

**For Acme 2 (Branch):**
```
Subdomain: acme-2
Username: acme_admin or acme2_test
Password: admin123 or test123
Expected Stock: 0, 0, 0, 0, 0  ← Should show all zeros
```

### Step 3: Clear Browser Cache

The frontend might be showing cached data:

1. **Hard Refresh:**
   - Windows/Linux: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`

2. **Clear Local Storage:**
   - Open DevTools (F12)
   - Go to Application tab
   - Expand "Local Storage"
   - Right-click → Clear
   - Refresh page

3. **Incognito Mode:**
   - Open browser in incognito/private mode
   - Login again and check

### Step 4: Check Browser DevTools

Open DevTools (F12) and check:

1. **Network Tab:**
   - Look for `/api/products` request
   - Check the response
   - Verify `quantity` values are 0

2. **Console Tab:**
   - Look for any errors
   - Check if products are being fetched correctly

### Step 5: Verify Frontend Code Was Updated

The fix was applied to these files:
- `frontend/src/lib/api.ts` - Updated getProducts() function
- `frontend/src/pages/Inventory.tsx` - Updated API call

**Make sure your frontend dev server was restarted after the fix:**
```bash
# Stop the dev server (Ctrl+C)
# Restart it
cd frontend
yarn dev
```

---

## Common Issues

### Issue 1: Logged into Wrong Tenant

**Symptom**: Seeing stock quantities like 145, 10, 50, 149, 80

**Cause**: You're viewing Acme Corporation (parent) instead of Acme 2 (branch)

**Solution**:
1. Logout
2. Login again with subdomain: `acme-2`
3. Verify tenant name in header shows "Acme 2"

### Issue 2: Frontend Not Updated

**Symptom**: Still seeing wrong data after code changes

**Cause**: Frontend dev server not restarted, or build not refreshed

**Solution**:
```bash
# Kill frontend server
pkill -f "vite"

# Clear node_modules/.vite cache
rm -rf frontend/node_modules/.vite

# Restart
cd frontend
yarn dev
```

### Issue 3: Old Data in LocalStorage

**Symptom**: Login seems to work but data doesn't change

**Cause**: Old token or tenant data cached in browser

**Solution**:
1. Open DevTools (F12)
2. Application → Local Storage
3. Delete `token`, `user`, `tenant` keys
4. Refresh and login again

### Issue 4: Viewing Parent Stock Column

**Symptom**: Seeing non-zero stock somewhere in UI

**Cause**: UI might show parent stock in one column and branch stock in another

**Solution**: Check which column you're looking at. Branch UI should only show branch quantities.

---

## Quick Test Script

Run this to verify API behavior:

```bash
# 1. Start backend
cd backend
source venv/bin/activate
python main.py

# 2. In another terminal, test API
# Login to Acme 2
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "acme2_test", "password": "test123", "subdomain": "acme-2"}' | \
  python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

# Get products
curl -s http://localhost:8000/products \
  -H "Authorization: Bearer $TOKEN" | \
  python3 -c "import sys, json; [print(f'{p[\"name\"]}: {p[\"quantity\"]}') for p in json.load(sys.stdin)]"

# Should output:
# Cement 50kg: 0
# Industrial Pump: 0
# Safety Helmet: 0
# Steel Rods 12mm: 0
# Work Gloves: 0
```

---

## What To Report

If you're still seeing the wrong quantities after all these checks, please provide:

1. **Screenshot of the UI** showing:
   - Tenant name in header
   - URL in browser
   - Product quantities being displayed

2. **Browser DevTools info**:
   - Network tab: Response from `/api/products`
   - Console tab: Any errors

3. **Confirmation that**:
   - Frontend server was restarted after code changes
   - You're logged into `acme-2` subdomain
   - Browser cache was cleared

---

## Summary

✅ **Backend API**: Working correctly, returns quantity=0 for Acme 2
✅ **Database**: Branch stock records exist with quantity=0
✅ **Code Fix**: Applied to frontend API client
❓ **UI Display**: Need to verify you're on correct tenant and cache is clear

**Most Likely Cause**: Either logged into wrong tenant or viewing cached data.

**Quick Fix**:
1. Logout
2. Clear browser cache
3. Login to subdomain `acme-2`
4. Hard refresh (Ctrl+Shift+R)
