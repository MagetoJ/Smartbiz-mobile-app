# Database Migrations

This directory contains database migration scripts for the StatBricks application.

## Automatic Schema Migrations

The `schema_migrations.py` script automatically runs when the backend starts and ensures that:

1. **All tables exist** - Creates any missing tables defined in models.py
2. **All columns exist** - Adds any missing columns to existing tables
3. **All foreign keys exist** - Adds any missing foreign key constraints

### How It Works

The automatic migration system:
- Compares SQLAlchemy models (models.py) with the actual database schema
- Detects missing tables, columns, and foreign key constraints
- Safely adds them using `ADD COLUMN IF NOT EXISTS` and similar SQL commands
- Is idempotent - safe to run multiple times
- Runs automatically on every backend startup via `init_db()` in database.py

### Running Migrations Manually

You can also run migrations manually:

```bash
cd backend
source venv/bin/activate
python migrations/schema_migrations.py
```

This is useful for:
- Testing migrations before deploying
- Verifying schema changes
- Debugging migration issues

## Data Migration Scripts

This directory also contains data migration scripts for backfilling or repairing data:

### backfill_sale_branch_id.py
Backfills the `branch_id` field for existing sales records.

```bash
cd backend
source venv/bin/activate
python migrations/backfill_sale_branch_id.py
```

### repair_missing_branch_stock.py
Ensures all branches have BranchStock records for all parent products.

```bash
cd backend
source venv/bin/activate
python migrations/repair_missing_branch_stock.py
```

### validate_branch_stock.py
Validates branch stock integrity (if exists).

```bash
cd backend
source venv/bin/activate
python migrations/validate_branch_stock.py
```

## Adding New Columns or Tables

When you add new columns or tables to your models:

1. Update the model in `backend/models.py`
2. Start the backend server - the migration system will automatically detect and add the new schema elements
3. No manual migration needed!

Example:
```python
# In models.py, add a new column
class Product(Base):
    __tablename__ = "products"
    # ... existing columns ...
    new_field = Column(String(100), nullable=True)  # New column
```

On next startup, you'll see:
```
📝 Table 'products' is missing columns: {'new_field'}
✅ Added column products.new_field
```

## Migration Logs

The migration system logs all changes:
- ✅ Success messages for added columns/constraints
- ⚠️  Warnings for non-critical issues
- ❌ Errors for failures

All logs are visible during backend startup.

## Best Practices

1. **Always test locally first** - Run migrations on your local database before production
2. **Backup before major changes** - While migrations are safe, always backup production data
3. **Check logs** - Review migration logs during deployment to ensure all changes applied
4. **Nullable columns** - New columns should typically be nullable to avoid issues with existing rows
5. **Default values** - Consider adding default values for new non-nullable columns

## Troubleshooting

### Column already exists error
The migration system uses `ADD COLUMN IF NOT EXISTS`, so this shouldn't happen. If it does, the column may have been manually added.

### Foreign key constraint error
If adding a foreign key fails, it's usually because:
- Referenced data doesn't exist (orphaned records)
- Data type mismatch between columns
- Target table/column doesn't exist

Check the error message and clean up data if needed.

### Migration runs but column not added
Check that:
1. The column is properly defined in models.py
2. The model is imported in schema_migrations.py
3. No database permission issues
4. Database connection is working

## Future Enhancements

For production use, consider:
- Adding Alembic for version-controlled migrations
- Adding migration rollback capability
- Adding dry-run mode to preview changes
- Adding migration history tracking
