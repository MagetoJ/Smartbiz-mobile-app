#!/bin/bash

# StatBricks Multi-Tenant Database Reset Script
# This script drops and recreates the database with the new multi-tenant schema

echo "🔄 Resetting StatBricks database with multi-tenant schema..."

# Database credentials (change these if different)
DB_NAME="chef_db"
DB_USER="chef_user"
DB_PASSWORD="chef_user"
DB_HOST="localhost"
DB_PORT="5432"

# Export password for psql
export PGPASSWORD=$DB_PASSWORD

echo "⚠️  WARNING: This will delete ALL existing data!"
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Operation cancelled."
    exit 1
fi

echo "🗑️  Dropping existing database..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"

echo "🆕 Creating fresh database..."
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;"

echo "✅ Database reset complete!"
echo ""
echo "📦 Next steps:"
echo "1. Start the backend server: cd backend && python main.py"
echo "2. The server will automatically create all tables with the new multi-tenant schema"
echo "3. A default 'demo' tenant will be created with admin/admin123"
echo ""
echo "🚀 Ready to go!"
