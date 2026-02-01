# Automatic Database Schema Migration System

## Problem Solved

Previously, when you added new columns to SQLAlchemy models, the database schema wouldn't automatically update. This caused errors like:

```
SQLAlchemy trying to insert into column 'branch_stock_id' but column does not exist
```

The old `create_all()` method only creates missing **tables**, not missing **columns** in existing tables.

## Solution

An automatic schema migration system has been implemented that runs on every backend startup. It ensures:

1. ✅ All tables exist (creates missing tables)
2. ✅ All columns exist (adds missing columns to existing tables)
3. ✅ All foreign key constraints exist (adds missing FK constraints)

## How It Works

### On Every Backend Startup

1. The `init_db()` function in `backend/database.py` calls the migration system
2. Migration system compares your SQLAlchemy models with the actual database schema
3. Any differences are automatically fixed using safe SQL commands
4. All changes are logged for visibility

### Code Flow

```
backend/main.py
  ↓ (on startup)
backend/database.py::init_db()
  ↓
backend/migrations/schema_migrations.py::run_migrations()
  ↓
  1. Create missing tables (Base.metadata.create_all)
  2. Add missing columns (add_missing_columns)
  3. Add missing foreign keys (add_missing_foreign_keys)
```

## What Changed

### Files Modified

1. **backend/database.py**
   - Changed `init_db()` to call the migration system instead of just `create_all()`

2. **backend/migrations/schema_migrations.py** (NEW)
   - Automatic schema migration system
   - Detects and adds missing columns
   - Detects and adds missing foreign key constraints
   - Safe and idempotent (can run multiple times)

3. **backend/migrations/__init__.py** (NEW)
   - Makes migrations a proper Python package

4. **backend/migrations/README.md** (NEW)
   - Documentation for the migration system

## Example: Adding a New Column

### Before (Old Way - Broken)
```python
# 1. Add column to models.py
class Product(Base):
    new_field = Column(String(100), nullable=True)

# 2. Start backend
# ❌ ERROR: column "new_field" does not exist

# 3. Manual fix required:
# - ALTER TABLE manually
# - Or drop and recreate database
```

### After (New Way - Automatic)
```python
# 1. Add column to models.py
class Product(Base):
    new_field = Column(String(100), nullable=True)

# 2. Start backend
# ✅ Automatic migration:
# 📝 Table 'products' is missing columns: {'new_field'}
# ✅ Added column products.new_field
# ✅ Schema migration completed

# 3. Column is ready to use immediately!
```

## Verification

The system was tested by:
1. Adding the `branch_stock_id` column to the `SaleItem` model
2. Running the migration system
3. Verifying the column was created: ✅
4. Verifying the foreign key constraint was added: ✅
5. Confirming the backend starts successfully: ✅

```bash
# Verified column exists
$ psql -c "\d sale_items" | grep branch_stock_id
branch_stock_id | integer          |           |          |

# Verified foreign key exists
$ psql -c "\d sale_items" | grep fk_sale_items_branch_stock_id
"fk_sale_items_branch_stock_id" FOREIGN KEY (branch_stock_id) REFERENCES branch_stock(id)
```

## Benefits

1. **No more manual migrations** - Schema changes are automatic
2. **Safe deployments** - Idempotent migrations won't break if run multiple times
3. **Clear logging** - See exactly what changes are made
4. **Developer friendly** - Just modify models.py and restart
5. **Production ready** - Handles missing columns and constraints safely

## Running Migrations Manually

You can also run migrations manually for testing:

```bash
cd backend
source venv/bin/activate
python migrations/schema_migrations.py
```

Output example:
```
============================================================
Starting database schema migration...
============================================================
✅ All tables exist
🔍 Checking for missing database columns...
📝 Table 'sale_items' is missing columns: {'branch_stock_id'}
✅ Added column sale_items.branch_stock_id
🔍 Checking for missing foreign key constraints...
✅ Added foreign key constraint fk_sale_items_branch_stock_id
✅ Schema migration completed - columns added
============================================================
Database schema migration completed!
============================================================
```

## Important Notes

1. **New columns should be nullable** - This avoids issues with existing rows:
   ```python
   new_field = Column(String(100), nullable=True)  # ✅ Good
   new_field = Column(String(100), nullable=False)  # ⚠️  May fail on existing data
   ```

2. **Default values** - For non-nullable columns, provide defaults:
   ```python
   new_field = Column(Integer, nullable=False, default=0)  # ✅ Good
   ```

3. **Always backup** - While migrations are safe, always backup production databases before deploying

4. **Test locally first** - Run and verify migrations locally before production deployment

## Migration Safety

The migration system uses safe SQL commands:
- `CREATE TABLE IF NOT EXISTS` - Won't fail if table exists
- `ADD COLUMN IF NOT EXISTS` - Won't fail if column exists
- Constraint checks before adding - Won't duplicate foreign keys

All operations are logged, and errors don't stop the backend from starting.

## Future Enhancements

For enterprise use, consider:
- Alembic integration for version-controlled migrations
- Migration rollback capability
- Dry-run mode to preview changes
- Migration history tracking in database
- Data transformation migrations (not just schema)

## Support

For issues or questions:
1. Check migration logs during backend startup
2. Run migrations manually for detailed output
3. Verify model definitions in models.py
4. Check database permissions and connectivity

---

**Summary**: The database schema now automatically stays in sync with your models. Add columns, start the app, and everything just works! 🎉
