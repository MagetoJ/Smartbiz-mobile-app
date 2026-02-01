#!/bin/bash

# Chef Database Setup Script
# This script sets up the PostgreSQL database with proper permissions

echo "🍳 Chef Database Setup"
echo "====================="
echo ""

# Check if running as root/sudo
if [ "$EUID" -eq 0 ]; then
    PSQL_CMD="sudo -u postgres psql"
else
    echo "This script needs sudo access to configure PostgreSQL."
    echo "Running with sudo..."
    PSQL_CMD="sudo -u postgres psql"
fi

echo "Step 1: Creating database and user..."
$PSQL_CMD <<EOF
-- Drop existing database if it exists (optional, comment out if you want to keep data)
-- DROP DATABASE IF EXISTS chef_db;
-- DROP USER IF EXISTS chef_user;

-- Create database and user
CREATE DATABASE chef_db;
CREATE USER chef_user WITH PASSWORD 'chef_user';

-- Grant database privileges
GRANT ALL PRIVILEGES ON DATABASE chef_db TO chef_user;

-- Exit to connect to chef_db
\c chef_db

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO chef_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO chef_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO chef_user;

-- Grant privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO chef_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO chef_user;

-- Grant CREATE privilege on types (needed for ENUMs)
GRANT CREATE ON SCHEMA public TO chef_user;

EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database setup completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. cd backend"
    echo "2. source venv/bin/activate"
    echo "3. python main.py  (this will create tables and default admin user)"
    echo "4. python seed_data.py  (optional: add sample menu items)"
    echo ""
    echo "Default credentials:"
    echo "  Username: admin"
    echo "  Password: admin123"
else
    echo ""
    echo "❌ Database setup failed. Please check the error messages above."
    exit 1
fi
