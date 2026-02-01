# Deployment & Data Safety Guide

## 🛡️ Customer Data Protection

Your application is designed with **multiple safety layers** to protect customer data during deployments and redeployments.

---

## ✅ Safety Guarantees

### 1. **Schema Migrations Are Safe**
- ✅ Uses `CREATE TABLE IF NOT EXISTS` - never drops tables
- ✅ Uses `ADD COLUMN IF NOT EXISTS` - idempotent
- ✅ Only adds missing schema elements
- ✅ Never deletes or modifies existing data

### 2. **Startup Initialization Is Safe**
- ✅ Only creates demo tenant if it doesn't exist
- ✅ Only creates admin user if they don't exist
- ✅ Uses existence checks before creating anything
- ✅ Demo data seeding has multiple safety checks

### 3. **Demo Data Seeding Is Intelligent**
- ✅ **Only seeds if database is empty**
- ✅ Checks for existing tenants, sales, and products
- ✅ Controlled via `SEED_DEMO_DATA` environment variable
- ✅ Safe to run multiple times - never overwrites

---

## 🚀 Deployment Workflow

### First Deployment (Empty Database)

```bash
# 1. Set environment variables
SEED_DEMO_DATA=true  # Enable demo data

# 2. Start application
uvicorn main:app --host 0.0.0.0 --port 8000

# What happens automatically:
# ✓ Database schema created
# ✓ Demo tenant created (subdomain: "demo")
# ✓ Admin user created (username: admin, password: admin123)
# ✓ Demo data seeded (categories, units, sample products)
```

**Result:**
- Database is fully set up with demo data
- Ready to use immediately
- Login: `admin` / `admin123`

---

### Subsequent Deployments (With Customer Data)

```bash
# Same startup command
uvicorn main:app --host 0.0.0.0 --port 8000

# What happens automatically:
# ✓ Schema migrations run (adds any new columns/tables)
# ✓ Checks if demo tenant exists (skips creation if exists)
# ✓ Checks if database is empty (skips demo data if not empty)
# ✗ NO DATA IS DELETED OR OVERWRITTEN
```

**Result:**
- All customer data preserved
- Schema updated to latest version
- No demo data added (database not empty)

---

## 🎛️ Environment Variables

### Database Configuration
```bash
DATABASE_URL=postgresql+asyncpg://user:password@host/database
```

### Demo Data Control
```bash
# Enable automatic demo data seeding (default)
SEED_DEMO_DATA=true

# Disable automatic demo data seeding (production)
SEED_DEMO_DATA=false
```

**Recommendation:**
- **Development:** `SEED_DEMO_DATA=true`
- **Production:** `SEED_DEMO_DATA=false` (optional, but recommended)

---

## 📊 Data Safety Checks

### Auto-Seeding Safety Logic

```python
async def is_database_empty(db: AsyncSession) -> bool:
    """
    Returns True only if:
    - No tenants exist (or only demo tenant)
    - No sales exist
    - No products exist
    """
    # Multiple safety checks ensure no customer data is overwritten
```

### What Prevents Data Loss?

1. **Tenant Count Check**
   ```python
   if tenant_count > 1:
       return False  # Customer has created tenants
   ```

2. **Sales Check**
   ```python
   if sales_count > 0:
       return False  # Customer has sales data
   ```

3. **Product Check**
   ```python
   if product_count > 0:
       return False  # Customer has product data
   ```

**All three must pass for seeding to occur!**

---

## 📁 File Structure

### Seeding Files

| File | Purpose | When to Use |
|------|---------|-------------|
| `seed_demo_data.py` | **Automatic** safe seeding system | ✅ Runs on startup if database empty |
| `seed_data.py` | **Manual** seeding (deprecated) | ⚠️  Manual testing only |
| `seed_multi_tenant_data.py` | Multi-tenant test data | 🧪 Testing multi-tenant features |

### Migration Files

| File | Purpose |
|------|---------|
| `database.py` | Database connection & initialization |
| `migrations/schema_migrations.py` | Auto-migration system |
| `migrations/*.py` | Specific migration scripts |

---

## 🔒 Production Best Practices

### 1. Environment Configuration

Create a production `.env` file:

```bash
# Production .env
DATABASE_URL=postgresql+asyncpg://prod_user:secure_password@prod_host/prod_db
SECRET_KEY=your-super-secure-secret-key-change-this
DEBUG=False
SEED_DEMO_DATA=false  # Disable auto-seeding in production
```

### 2. Database Backups

**Before any deployment:**
```bash
# PostgreSQL backup
pg_dump -U user -d database > backup_$(date +%Y%m%d_%H%M%S).sql

# Or automated with cron:
0 2 * * * pg_dump -U user -d database > /backups/daily_$(date +%Y%m%d).sql
```

### 3. Deployment Checklist

- [ ] Backup database
- [ ] Set `SEED_DEMO_DATA=false` in production
- [ ] Update `.env` with production credentials
- [ ] Test migration on staging environment first
- [ ] Monitor startup logs for any errors
- [ ] Verify customer data integrity post-deployment

---

## 🧪 Testing Deployments

### Test Redeployment Safety

```bash
# 1. Create test database with sample data
psql -U user -c "CREATE DATABASE test_redeploy;"

# 2. Start app (first time)
SEED_DEMO_DATA=true uvicorn main:app

# 3. Add some data via UI
# - Create a product
# - Make a sale
# - Add a user

# 4. Restart app (simulate redeploy)
uvicorn main:app

# 5. Verify:
# ✓ Your test data still exists
# ✓ No demo data was added
# ✓ Schema is current
```

---

## 🆘 Troubleshooting

### Problem: Demo data not appearing on first deploy

**Solution:**
```bash
# Check environment variable
echo $SEED_DEMO_DATA  # Should be "true"

# Check logs
# Look for: "Database is empty - seeding demo data..."
```

### Problem: Demo data appearing in production

**Cause:** Database was empty when deployed

**Solution:**
```bash
# Prevent in future:
SEED_DEMO_DATA=false

# If already seeded, delete demo tenant via UI or:
# (Not recommended - just hide/deactivate it)
```

### Problem: Migration failed

**Solution:**
```bash
# Check logs for specific error
# Most common: database connection issue

# Verify database access:
psql -U user -d database -c "SELECT 1;"

# Check DATABASE_URL in .env
```

---

## 📝 Manual Seeding (Advanced)

### When to Use Manual Seeding

- Testing specific scenarios
- Development environments
- Resetting demo data

### How to Run

```bash
# From backend directory
cd backend

# Run manual seed script
python seed_data.py

# Or use the reusable module
python -c "
from seed_demo_data import seed_demo_tenant_data
import asyncio
# ... your custom seeding logic
"
```

---

## 🎯 Summary

### ✅ What's Safe

- ✅ Deploying to empty database
- ✅ Redeploying with customer data
- ✅ Schema migrations
- ✅ Restarting the application
- ✅ Running migrations multiple times

### ⚠️ What to Be Careful About

- ⚠️  Running manual seed scripts in production
- ⚠️  Using `reset_database.sh` (DESTRUCTIVE)
- ⚠️  Manually modifying database schema
- ⚠️  Using `drop_all_tables.sql` (DESTRUCTIVE)

### ❌ Never Do This

- ❌ Run `reset_database.sh` in production
- ❌ Delete database files manually
- ❌ Modify schema without migrations
- ❌ Deploy without testing migrations first

---

## 📞 Support

For issues or questions:
1. Check logs: `tail -f app.log`
2. Review this documentation
3. Check GitHub issues
4. Contact development team

---

**Last Updated:** January 17, 2026  
**Version:** 2.0.0
