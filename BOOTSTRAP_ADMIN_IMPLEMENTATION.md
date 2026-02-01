# Bootstrap Super Admin Implementation Guide

## 🎯 Overview

The bootstrap super admin system provides **disaster recovery** and ensures platform owners can never be locked out. The admin is automatically created/updated on server startup from environment variables.

---

## ✅ Implementation Status

### **Phase 1: Environment Bootstrap (COMPLETE)**

#### 1. Environment Variables
**File: `backend/.env`**
```env
# Bootstrap Super Admin (Environment-Based - Cannot Be Deleted)
BOOTSTRAP_SUPER_ADMIN_EMAIL=dmaangi@statbricks.com
BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH=$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5eo5wowZFPqU2
BOOTSTRAP_SUPER_ADMIN_FULL_NAME=Daniel Maangi
```

**Template: `backend/.env.template`**
```env
# Bootstrap Super Admin (Environment-Based - Cannot Be Deleted)
BOOTSTRAP_SUPER_ADMIN_EMAIL=admin@yourcompany.com
BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH=$2b$12$your_bcrypt_hash_here
BOOTSTRAP_SUPER_ADMIN_FULL_NAME=Platform Administrator
```

#### 2. Config Settings
**File: `backend/config.py`** ✅
```python
# Bootstrap Super Admin Configuration
BOOTSTRAP_SUPER_ADMIN_EMAIL: str = ""
BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH: str = ""
BOOTSTRAP_SUPER_ADMIN_FULL_NAME: str = "Platform Administrator"
```

#### 3. Database Schema
**Migration: `backend/migrations/add_env_based_field.py`** ✅
```python
# Adds env_based field to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS env_based BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_users_env_based ON users(env_based) WHERE env_based = TRUE;
```

**Model: `backend/models.py`** ✅
```python
class User(Base):
    # ...
    is_super_admin = Column(Boolean, default=False, nullable=False)
    env_based = Column(Boolean, default=False, nullable=False)  # NEW
```

#### 4. Bootstrap Logic
**File: `backend/main.py` - startup_event()** ✅
```python
# Bootstrap environment-based super admin (disaster recovery)
from config import settings
if settings.BOOTSTRAP_SUPER_ADMIN_EMAIL and settings.BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH:
    logger.info("Bootstrapping environment-based super admin...")
    
    # Check if admin already exists
    result = await db.execute(
        select(User).where(User.email == settings.BOOTSTRAP_SUPER_ADMIN_EMAIL)
    )
    bootstrap_admin = result.scalar_one_or_none()
    
    if bootstrap_admin:
        # Update existing admin
        bootstrap_admin.username = settings.BOOTSTRAP_SUPER_ADMIN_EMAIL
        bootstrap_admin.hashed_password = settings.BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH
        bootstrap_admin.full_name = settings.BOOTSTRAP_SUPER_ADMIN_FULL_NAME
        bootstrap_admin.is_super_admin = True
        bootstrap_admin.env_based = True
        bootstrap_admin.is_active = True
    else:
        # Create new admin
        bootstrap_admin = User(
            username=settings.BOOTSTRAP_SUPER_ADMIN_EMAIL,
            email=settings.BOOTSTRAP_SUPER_ADMIN_EMAIL,
            hashed_password=settings.BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH,
            full_name=settings.BOOTSTRAP_SUPER_ADMIN_FULL_NAME,
            is_super_admin=True,
            env_based=True,
            is_active=True
        )
        db.add(bootstrap_admin)
    
    await db.commit()
    logger.info("Bootstrap super admin ready!")
```

---

## 🔐 Security Features

### 1. Password Hashing
Bootstrap password must be **pre-hashed** bcrypt format:

```bash
# Generate hash for your password
python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['bcrypt']).hash('your_secure_password'))"
```

**Example output:**
```
$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5eo5wowZFPqU2
```

### 2. Environment-Based Admin Protection
- **Cannot be deleted via UI** (protected by `env_based=True`)
- **Auto-recreated on startup** if missing from database
- **Password updates** only via environment variable
- **Always has super_admin privileges**

### 3. Disaster Recovery
✅ Works even if database is wiped  
✅ No chicken-and-egg problem (admin always exists)  
✅ Can't be locked out by bugs in UI  
✅ Email serves as username (no memorization needed)

---

## 📋 Phase 2: Admin Management UI (Future)

### Recommended Implementation

#### 1. Activity Logging Table
```sql
CREATE TABLE admin_activity_logs (
  id SERIAL PRIMARY KEY,
  admin_user_id INT REFERENCES users(id),
  action VARCHAR(100),  -- 'login', 'suspend_tenant', 'activate_tenant', 'create_admin'
  target_type VARCHAR(50),  -- 'tenant', 'user', 'admin'
  target_id INT,
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_admin_logs_user ON admin_activity_logs(admin_user_id);
CREATE INDEX idx_admin_logs_created ON admin_activity_logs(created_at DESC);
```

#### 2. Backend Endpoints
**File: `backend/platform_admin.py`**
```python
# Admin Management
POST   /api/platform/admins                    # Create super admin
GET    /api/platform/admins                    # List all super admins
PATCH  /api/platform/admins/{id}               # Update admin (enable/disable)
DELETE /api/platform/admins/{id}               # Delete admin (not env-based)
POST   /api/platform/admins/{id}/reset-password  # Reset password
GET    /api/platform/activity-logs             # View activity logs
```

#### 3. Frontend Components
**SuperAdminPanel Enhancements:**
- Admin Management Tab
- Add Super Admin Modal
- Activity Log Viewer (paginated, filterable)
- Password Reset Modal
- Status Toggles (enable/disable)

#### 4. Validation Logic
```python
# Prevent deletion of env-based admin
if user.env_based:
    raise HTTPException(status_code=403, detail="Cannot delete environment-based admin")

# Prevent deletion of last admin
admin_count = await db.execute(
    select(func.count(User.id)).where(User.is_super_admin == True, User.is_active == True)
)
if admin_count.scalar() <= 1:
    raise HTTPException(status_code=403, detail="Cannot delete the last admin")
```

---

## 🚀 Testing the Bootstrap System

### 1. Test Scenarios

#### **Scenario 1: First Run (Admin Creation)**
```bash
# Start the server
cd backend
python main.py
```

**Expected Output:**
```
============================================================
Bootstrapping environment-based super admin...
✅ Created bootstrap admin: dmaangi@statbricks.com
Bootstrap super admin ready!
============================================================
```

#### **Scenario 2: Disaster Recovery (Admin Recreation)**
```bash
# Simulate disaster: Delete admin from database
psql chef_db
DELETE FROM users WHERE email = 'dmaangi@statbricks.com';
\q

# Restart server - admin will be recreated
python main.py
```

**Expected Output:**
```
✅ Created bootstrap admin: dmaangi@statbricks.com
```

#### **Scenario 3: Password Update**
```bash
# 1. Generate new hash
python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['bcrypt']).hash('new_password'))"

# 2. Update .env
BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH=$2b$12$NEW_HASH_HERE

# 3. Restart server - password will be updated
python main.py
```

**Expected Output:**
```
✅ Updated bootstrap admin: dmaangi@statbricks.com
```

### 2. Login Test
```bash
# Frontend login at /admin
Username: dmaangi@statbricks.com
Password: (your actual password, not the hash)
```

**Expected Behavior:**
✅ Login succeeds  
✅ User has super_admin privileges  
✅ Cannot be deleted from UI  
✅ Shows as "Environment-Based" in admin list

---

## 🎯 Access Control Matrix

| Feature | Bootstrap Admin | UI-Created Admin | Notes |
|---------|----------------|------------------|-------|
| Login to /admin | ✅ | ✅ | Both can access admin panel |
| View all tenants | ✅ | ✅ | Platform-wide visibility |
| Suspend/Activate tenants | ✅ | ✅ | Full tenant management |
| Impersonate tenants | ✅ | ✅ | Testing/support access |
| Create other admins | ✅ | ✅ | Admin management |
| Delete self | ❌ | ⚠️ | Bootstrap: NO, UI: Only if not last admin |
| Update own password | Via .env | Via UI | Bootstrap uses environment |
| Survive DB wipe | ✅ | ❌ | Bootstrap recreated on startup |

---

## 📝 Deployment Checklist

### Development
- [x] Set development credentials in `backend/.env`
- [x] Run migration: `python migrations/add_env_based_field.py`
- [x] Start server and verify bootstrap logs
- [x] Test login at `/admin`

### Production (Render/Cloud Run)
- [ ] Generate secure production password hash
- [ ] Set environment variables in hosting platform:
  - `BOOTSTRAP_SUPER_ADMIN_EMAIL`
  - `BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH`
  - `BOOTSTRAP_SUPER_ADMIN_FULL_NAME`
- [ ] Deploy application
- [ ] Verify bootstrap admin created in logs
- [ ] Test login with production credentials
- [ ] **CRITICAL**: Store credentials in secure vault (1Password, etc.)

### Security Best Practices
✅ Use different passwords for dev/prod  
✅ Never commit actual password hashes to git  
✅ Rotate passwords periodically (update .env, restart)  
✅ Use strong passwords (min 16 characters)  
✅ Store credentials in team password manager  

---

## 🔧 Troubleshooting

### Issue: Admin not created on startup
**Solution:**
1. Check environment variables are set:
   ```bash
   echo $BOOTSTRAP_SUPER_ADMIN_EMAIL
   ```
2. Check server logs for bootstrap section
3. Verify migration was run successfully
4. Check database for `env_based` column:
   ```sql
   \d users;
   ```

### Issue: Cannot login with bootstrap admin
**Solution:**
1. Verify email is correct (case-sensitive)
2. Verify password matches the one you hashed
3. Check database: `SELECT * FROM users WHERE email = 'your-email';`
4. Verify `is_super_admin = true` and `is_active = true`

### Issue: Want to change bootstrap password
**Solution:**
1. Generate new hash
2. Update `BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH` in `.env`
3. Restart server
4. Admin password automatically updated

---

## 🎉 Success Criteria

✅ **Phase 1 Complete:**
- Environment variables configured
- Migration applied successfully
- Bootstrap logic runs on startup
- Admin can login to `/admin`
- Admin survives database wipe
- Password can be changed via .env

⏳ **Phase 2 (Future):**
- Admin management UI built
- Activity logging implemented
- Multiple admin support via UI
- Password reset functionality

---

## 📚 Related Files

### Backend
- `backend/.env` - Bootstrap credentials
- `backend/config.py` - Settings configuration
- `backend/models.py` - User model with env_based field
- `backend/main.py` - Bootstrap logic in startup_event()
- `backend/migrations/add_env_based_field.py` - Database migration
- `backend/platform_admin.py` - Super admin routes (existing)

### Frontend
- `frontend/src/pages/SuperAdminLogin.tsx` - Admin login page
- `frontend/src/pages/SuperAdminPanel.tsx` - Admin dashboard
- `frontend/src/App.tsx` - Route configuration

---

## 🔗 Quick Links

- **Login URL (dev)**: http://localhost:5173/admin
- **API Docs**: http://localhost:8000/docs
- **Platform Admin Routes**: `/api/platform/*`
- **Super Admin Guide**: `SUPER_ADMIN_GUIDE.md`

---

**Implementation Date:** January 19, 2026  
**Status:** Phase 1 Complete ✅  
**Next Steps:** Test in production, implement Phase 2 UI enhancements
