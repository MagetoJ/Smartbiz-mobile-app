# Security & Sensitive Files

## Protected Files (Excluded from Git)

This document lists sensitive files that are **NOT** included in the GitHub repository for security reasons.

### Environment Files
- `backend/.env` - Contains actual database credentials, secret keys, and API keys
- `.env.local` - Local environment overrides
- `.env.production` - Production environment variables

### Database Files
- `*.db` - SQLite database files
- `*.sqlite` - SQLite database files

### Dependencies
- `node_modules/` - Frontend dependencies (can be reinstalled via `yarn install`)
- `venv/`, `env/`, `ENV/` - Python virtual environments (can be recreated)
- `__pycache__/` - Python bytecode cache
- `*.pyc`, `*.pyo` - Compiled Python files

### Build Artifacts
- `frontend/dist/` - Frontend production build
- `frontend/build/` - Frontend build output
- `dist/`, `build/` - General build directories

### IDE & OS Files
- `.vscode/` - VS Code settings
- `.idea/` - IntelliJ IDEA settings
- `.DS_Store` - macOS folder attributes
- `Thumbs.db` - Windows thumbnail cache

### Logs
- `*.log` - All log files
- `npm-debug.log*` - NPM debug logs
- `yarn-debug.log*` - Yarn debug logs
- `yarn-error.log*` - Yarn error logs

## Setup Instructions

### For New Developers

1. **Clone the repository:**
   ```bash
   git clone https://github.com/danielmaangi/statbricks.git
   cd statbricks
   ```

2. **Set up environment variables:**
   ```bash
   cp backend/.env.template backend/.env
   ```
   
3. **Update the `.env` file with your local credentials:**
   - Change `DATABASE_URL` to your PostgreSQL connection string
   - Generate a strong `SECRET_KEY` (use `openssl rand -hex 32`)
   - Update other settings as needed

4. **Install dependencies:**
   ```bash
   # Backend
   cd backend
   pip install -r requirements.txt
   
   # Frontend
   cd ../frontend
   yarn install
   ```

5. **Set up the database:**
   ```bash
   ./setup_database.sh
   ```

## Important Notes

- ⚠️ **Never commit `.env` files** - They contain sensitive credentials
- ✅ **Only commit `.env.template` files** - These show the structure without real values
- 🔒 **Change default credentials in production** - The template values are for development only
- 🔑 **Use strong, unique SECRET_KEY values** - Generate new keys for each environment

## Current Git Status

**Repository:** https://github.com/danielmaangi/statbricks.git  
**Last Push:** January 7, 2026  
**Files Committed:** 48 files  
**Protected Files:** All sensitive data excluded via `.gitignore`
