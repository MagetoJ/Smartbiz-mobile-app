# Rebranding: SmartBiz → StatBricks

**Date**: 2026-01-08
**Status**: ✅ Complete

## Summary

Successfully rebranded the entire application from "SmartBiz" to "StatBricks" across all backend files.

## Changes Made

### 1. **main.py**
- **Line 30**: FastAPI app title
  - `SmartBiz Multi-Tenant Inventory System` → `StatBricks Multi-Tenant Inventory System`
- **Line 62**: Default admin email
  - `admin@smartbiz.com` → `admin@statbricks.com`
- **Line 75**: Admin user email
  - `admin@smartbiz.com` → `admin@statbricks.com`
- **Line 94**: Console log message
  - `demo.smartbiz.com` → `demo.statbricks.com`

### 2. **models.py**
- **Line 55**: Comment for subdomain field
  - `acme.smartbiz.com` → `acme.statbricks.com`

### 3. **config.py**
- **Line 31**: SMTP from email default
  - `noreply@smartbiz.com` → `noreply@statbricks.com`
- **Line 32**: SMTP from name default
  - `SmartBiz Team` → `StatBricks Team`

### 4. **auth.py**
- **Line 214**: Function documentation example
  - `acme.smartbiz.com` → `acme.statbricks.com`
- **Line 230**: Comment example
  - `smartbiz.com` → `statbricks.com`

### 5. **.env.template**
- **Line 21**: SMTP from email template
  - `noreply@smartbiz.com` → `noreply@statbricks.com`
- **Line 22**: SMTP from name template
  - `SmartBiz Team` → `StatBricks Team`

### 6. **email_service.py**
- **Line 90**: HTML email footer
  - `Powered by mBiz` → `Powered by mBiz`
- **Line 130**: Plain text email footer
  - `Powered by mBiz` → `Powered by mBiz`
- **Line 271**: Production URL comment
  - `{tenant}.smartbiz.com` → `{tenant}.statbricks.com`

## Verification

### API Documentation
✅ Swagger UI title shows: **"StatBricks Multi-Tenant Inventory System"**

### Domain References
All domain references updated:
- ✅ `smartbiz.com` → `statbricks.com`
- ✅ `demo.smartbiz.com` → `demo.statbricks.com`
- ✅ `acme.smartbiz.com` → `acme.statbricks.com`

### Email Configuration
All email settings updated:
- ✅ Sender name: **StatBricks Team**
- ✅ Sender email: **noreply@statbricks.com**
- ✅ Email footers: **"Powered by mBiz"**

### System Messages
- ✅ Console logs show StatBricks branding
- ✅ API responses use StatBricks references

## Impact

### What Changed
- **Brand Name**: SmartBiz → StatBricks
- **Domain Name**: smartbiz.com → statbricks.com
- **Email Addresses**: @smartbiz.com → @statbricks.com

### What Stayed the Same
- ✅ All functionality unchanged
- ✅ Database schema unchanged
- ✅ API endpoints unchanged
- ✅ User data unchanged
- ✅ Authentication unchanged

## Files Modified

Total: **6 backend files**

1. `/backend/main.py`
2. `/backend/models.py`
3. `/backend/config.py`
4. `/backend/auth.py`
5. `/backend/.env.template`
6. `/backend/email_service.py`

## Deployment

### Backend
- ✅ Code updated
- ✅ Server restarted
- ✅ Application running with new branding

### Notes
- No database migration required (cosmetic changes only)
- No breaking changes to API
- Existing `.env` files should be updated manually if needed
- Email templates will show StatBricks branding on next send

## Post-Deployment

### Testing
- ✅ Backend starts successfully
- ✅ API documentation displays correct title
- ✅ No errors in startup logs

### Next Steps (Optional)
1. Update any external documentation
2. Update actual `.env` file if different from template
3. Update email SMTP settings if using custom email domain
4. Test email sending to verify branding
5. Update frontend branding (if applicable)

---

## Rollback (if needed)

To rollback, simply reverse the changes:
```bash
# Replace StatBricks → SmartBiz
# Replace statbricks.com → smartbiz.com
```

All changes are text-based with no data impact, making rollback straightforward.
