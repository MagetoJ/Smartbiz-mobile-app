# Platform Super Admin System - Complete Guide

## Overview

The Platform Super Admin system provides you (the platform owner) with complete control over your multi-tenant SaaS application. This is a macro-level administrative interface for monitoring all businesses, managing subscriptions, and providing support.

## 🔐 Security Features

✅ **Hidden Access** - Admin panel accessible ONLY at `/admin` (no navigation links)
✅ **Separate Authentication** - Independent login system at `/admin/login`
✅ **Secret Key Protection** - Super admin registration requires secret key
✅ **Platform-Wide Scope** - Access all tenants without restrictions
✅ **Audit Trail** - All actions logged with tenant/user context

---

## 📊 What You Can Monitor

### Platform Metrics Dashboard
- **Total Tenants**: Active and inactive counts
- **Total Users**: Across all businesses
- **Total Sales**: Revenue and transaction counts
- **Growth Tracking**: New tenants weekly/monthly
- **Subscription Distribution**: FREE, BASIC, PREMIUM plans

### Per-Tenant Analytics
- User count
- Product catalog size
- Total sales revenue
- Branch count (for multi-location businesses)
- Registration date
- Subscription status and expiration

---

## 🛠️ Administrative Capabilities

### 1. Tenant Management
- **View All Tenants**: Searchable, filterable list
- **Suspend/Activate**: Toggle tenant access instantly
- **Change Subscriptions**: Upgrade/downgrade plans
- **View Details**: Deep dive into any tenant's data

### 2. Support Features
- **Impersonate Tenant Admin**: Login as any tenant for troubleshooting
- **Direct Access**: Opens in new tab, preserving your super admin session

### 3. Monitoring Tools
- **Search**: Find tenants by name, subdomain, or email
- **Filter by Plan**: FREE, BASIC, PREMIUM
- **Filter by Status**: Active or Suspended
- **Sort by Performance**: Revenue, users, activity

---

## 🚀 Getting Started

### Step 1: Create Your Super Admin Account

Run this command (replace with your details):

```bash
curl -X POST http://localhost:8000/api/platform/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "yourname",
    "email": "your@email.com",
    "password": "your-secure-password",
    "full_name": "Your Full Name",
    "secret_key": "your-super-secret-key-change-in-production-12345"
  }'
```

**⚠️ IMPORTANT**: Update the secret key in production!
- Edit `backend/platform_admin.py` line 113
- Store in environment variable: `SUPER_ADMIN_SECRET`

### Step 2: Access the Admin Panel

1. Navigate to: `http://localhost:5173/admin/login`
2. Enter your super admin credentials
3. You'll be redirected to the platform dashboard

### Step 3: Bookmark It!

Since there are NO navigation links to the admin panel (security by obscurity), bookmark:
- `http://localhost:5173/admin/login` (login)
- `http://localhost:5173/admin` (dashboard)

---

## 📡 API Endpoints

All endpoints require super admin authentication via Bearer token.

### Authentication
- `POST /api/platform/auth/register` - Register super admin
- `POST /api/platform/auth/login` - Login

### Platform Metrics
- `GET /api/platform/metrics` - Platform-wide KPIs

### Tenant Management
- `GET /api/platform/tenants` - List all tenants (with filters)
- `GET /api/platform/tenants/{id}` - Get tenant details
- `PATCH /api/platform/tenants/{id}` - Update tenant settings
- `POST /api/platform/tenants/{id}/impersonate` - Impersonate tenant admin

### Analytics
- `GET /api/platform/analytics/growth` - Growth over time
- `GET /api/platform/analytics/top-tenants` - Best performing tenants

---

## 🎯 Common Tasks

### Suspend a Problematic Tenant
1. Go to `/admin`
2. Search for the tenant
3. Click the ❌ (Ban) icon
4. Confirm suspension
5. Tenant is immediately blocked from access

### Upgrade a Tenant's Subscription
1. Find tenant in the list
2. Note their tenant ID
3. Use API or add UI button:
```bash
curl -X PATCH http://localhost:8000/api/platform/tenants/{id} \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subscription_plan": "premium"}'
```

### Troubleshoot Tenant Issues
1. Click 👁️ (Eye) icon next to tenant
2. System generates impersonation token
3. Opens tenant's dashboard in new tab
4. You're logged in as their admin
5. Investigate and fix the issue

---

## 🔒 Production Security Checklist

### Before Deployment:

1. **Change Secret Key**
   ```python
   # backend/platform_admin.py
   SUPER_ADMIN_SECRET = os.getenv("SUPER_ADMIN_SECRET", "fallback-key")
   ```

2. **Set Environment Variable**
   ```bash
   export SUPER_ADMIN_SECRET="your-production-secret-key-here"
   ```

3. **Use Strong Passwords**
   - Super admin passwords should be 16+ characters
   - Use password manager

4. **Enable HTTPS**
   - Super admin login MUST use HTTPS in production
   - No exceptions!

5. **IP Whitelist (Optional)**
   - Add nginx/firewall rules to restrict `/api/platform/*`
   - Only allow your office/VPN IP addresses

6. **Audit Logging**
   - All super admin actions are logged
   - Review logs regularly

---

## 🎨 Frontend Components

### SuperAdminLogin (`frontend/src/pages/SuperAdminLogin.tsx`)
- Separate login interface
- Red theme (danger/admin indication)
- Stores token in `localStorage` as `super_admin_token`

### SuperAdminPanel (`frontend/src/pages/SuperAdminPanel.tsx`)
- Platform metrics dashboard
- Tenant management table
- Search and filtering
- Action buttons (impersonate, suspend/activate)

---

## 🗄️ Database Schema

### User Model Addition
```python
is_super_admin = Column(Boolean, default=False, nullable=False)
```

### Migration Applied
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;
CREATE INDEX idx_users_super_admin ON users(is_super_admin) WHERE is_super_admin = TRUE;
```

---

## 🧪 Testing the System

### 1. Register Super Admin
```bash
# Test registration
curl -X POST http://localhost:8000/api/platform/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testadmin",
    "email": "test@admin.com",
    "password": "TestPass123!",
    "full_name": "Test Admin",
    "secret_key": "your-super-secret-key-change-in-production-12345"
  }'
```

### 2. Login
```bash
# Get token
curl -X POST http://localhost:8000/api/platform/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testadmin",
    "password": "TestPass123!"
  }'
```

### 3. Fetch Metrics
```bash
# Use token from step 2
curl -X GET http://localhost:8000/api/platform/metrics \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 4. Test Frontend
1. Visit `http://localhost:5173/admin/login`
2. Login with credentials
3. Verify dashboard loads
4. Test search and filters
5. Try impersonating a tenant

---

## 🐛 Troubleshooting

### "401 Unauthorized" Error
- Check token is valid and not expired
- Ensure user has `is_super_admin = True` in database
- Verify token includes `is_super_admin` claim

### Can't Access `/admin` Route
- Make sure backend is running
- Check CORS settings
- Verify frontend routing is updated

### Impersonation Not Working
- Target tenant must have active admin user
- Check tenant is not suspended
- Verify impersonation endpoint permissions

### No Tenants Showing Up
- Check database has tenant data
- Verify token has platform-wide access
- Check API endpoint returns data

---

## 📈 Future Enhancements

Consider adding:
- **Email Notifications**: Alert on new tenant registrations
- **Revenue Reports**: Subscription income tracking
- **Usage Limits**: Enforce max users/products per plan
- **Bulk Actions**: Suspend multiple tenants at once
- **Activity Dashboard**: Real-time tenant activity feed
- **Support Tickets**: Integrated ticketing system
- **Billing Integration**: Stripe/PayPal for subscriptions

---

## 📞 Support

For issues or questions:
1. Check this guide first
2. Review API documentation
3. Check application logs
4. Contact technical support

---

## 🎉 You're All Set!

Your Platform Super Admin system is fully functional. You now have complete control over your multi-tenant SaaS application with the ability to:

✅ Monitor all tenants and platform metrics
✅ Suspend/activate any tenant
✅ Change subscription plans
✅ Impersonate tenants for support
✅ Track growth and performance
✅ Manage the entire platform from one interface

**Access your admin panel at:** `http://localhost:5173/admin/login`

**Remember:** Keep your super admin credentials secure!
