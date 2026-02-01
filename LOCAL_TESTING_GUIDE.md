# 🧪 Local Testing Guide

Complete guide for testing StatBricks locally on your development machine.

---

## Prerequisites

Before testing, ensure you have:
- ✅ Python 3.12+ installed
- ✅ Node.js 20+ and Yarn installed
- ✅ PostgreSQL 18+ running
- ✅ Database created (`chef_db`) with proper permissions

---

## Step 1: Start the Backend Server

### Terminal 1 - Backend

```bash
# Navigate to backend directory
cd backend

# Activate virtual environment
source venv/bin/activate
# On Windows: venv\Scripts\activate

# Install/update dependencies (if needed)
pip install -r requirements.txt

# Start the FastAPI server
python main.py
```

**Expected Output:**
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

**Backend URLs:**
- API: `http://localhost:8000`
- Interactive API docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

---

## Step 2: Start the Frontend Dev Server

### Terminal 2 - Frontend

Open a **new terminal window** (keep backend running):

```bash
# Navigate to frontend directory
cd frontend

# Install/update dependencies (if needed)
yarn install

# Start Vite development server
yarn dev
```

**Expected Output:**
```
  VITE v5.4.11  ready in 1234 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

**Frontend URL:**
- Development app: `http://localhost:5173`

---

## Step 3: Test the Application

### Login

1. Open your browser to `http://localhost:5173`
2. You should see the login page
3. Use default credentials:
   - **Username:** `admin`
   - **Password:** `admin123`
   - **Subdomain:** `demo` (or leave blank to select from list)

### Test Product URLs

#### View All Products
1. After login, navigate to **Inventory** in the sidebar
2. URL: `http://localhost:5173/inventory`
3. You should see a list of all products

#### View Specific Product
1. Click on any product in the inventory list
2. URL pattern: `http://localhost:5173/inventory` (with product details modal/panel)

#### Create New Product
1. Click **Add Product** button
2. Fill in the form (name, category, price, etc.)
3. Submit to test product creation

#### Upload Product Image
1. Select a product
2. Click on the image upload area
3. Choose an image file (JPG, PNG, WebP)
4. Verify image uploads to Cloudflare R2 (if configured)

### Test Other Features

#### Dashboard
- URL: `http://localhost:5173/dashboard`
- View sales statistics, charts, and reports

#### POS (Point of Sale)
- URL: `http://localhost:5173/pos`
- Test creating sales transactions

#### Sales History
- URL: `http://localhost:5173/sales`
- View past sales and receipts

#### Categories & Units
- URL: `http://localhost:5173/categories`
- URL: `http://localhost:5173/units`
- Manage product categories and units of measure

---

## Step 4: API Testing (Optional)

### Test API Directly with cURL

```bash
# Health check
curl http://localhost:8000/health

# Login and get token
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123",
    "subdomain": "demo"
  }'

# Get products (replace YOUR_TOKEN with the token from login)
curl http://localhost:8000/products \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test API with Swagger UI

1. Open `http://localhost:8000/docs` in your browser
2. Click **Authorize** button (top right)
3. Login to get a token:
   - Click **POST /auth/login**
   - Click **Try it out**
   - Fill in credentials
   - Click **Execute**
   - Copy the `access_token` from the response
4. Paste token in the Authorization dialog
5. Now you can test any endpoint interactively

---

## Troubleshooting

### Backend Issues

#### Database Connection Error
```
sqlalchemy.exc.OperationalError: (psycopg2.OperationalError) FATAL: database "chef_db" does not exist
```

**Solution:**
```bash
# Login to PostgreSQL
sudo -u postgres psql

# Create database
CREATE DATABASE chef_db;
CREATE USER chef_user WITH PASSWORD 'chef_user';
GRANT ALL PRIVILEGES ON DATABASE chef_db TO chef_user;
\q
```

#### Port Already in Use
```
ERROR: [Errno 48] error while attempting to bind on address ('0.0.0.0', 8000): address already in use
```

**Solution:**
```bash
# Find process using port 8000
lsof -i :8000
# Kill the process
kill -9 <PID>
# Or change port in main.py
uvicorn.run(app, host="0.0.0.0", port=8001)
```

### Frontend Issues

#### Module Not Found Error
```
Error: Cannot find module '@/lib/utils'
```

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules yarn.lock
yarn install
```

#### API Connection Refused
```
Failed to fetch: http://localhost:8000/...
```

**Solution:**
- Verify backend is running (`http://localhost:8000/health`)
- Check CORS settings in `backend/main.py`
- Clear browser cache and reload

### Browser Issues

#### Login Not Working
1. Open browser DevTools (F12)
2. Check Console tab for errors
3. Check Network tab for failed requests
4. Verify credentials are correct

#### Products Not Loading
1. Check if backend is running
2. Verify token is valid (check Network tab)
3. Check backend logs for errors
4. Try clearing localStorage: `localStorage.clear()` in browser console

---

## Environment Variables

### Backend (backend/.env)
Key variables for local testing:
```env
DATABASE_URL=postgresql+asyncpg://chef_user:chef_user@localhost/chef_db
SECRET_KEY=your-secret-key-here-change-in-production
DEBUG=True
```

### Frontend (frontend/.env)
```env
VITE_API_URL=http://localhost:8000
```

---

## Useful Commands

### Backend
```bash
# Run tests
pytest

# Check migrations
python -c "from database import init_db; import asyncio; asyncio.run(init_db())"

# Reset database (⚠️ WARNING: Deletes all data)
python reset_tables.py
```

### Frontend
```bash
# Build for production
yarn build

# Preview production build
yarn preview

# Type check
yarn tsc --noEmit

# Lint
yarn lint
```

---

## Next Steps

After local testing:
1. ✅ Push code to GitHub (ensure `.env` is ignored)
2. ✅ Deploy to Google Cloud Run (see `DEPLOYMENT_QUICKSTART.md`)
3. ✅ Test production deployment
4. ✅ Set up monitoring and logging

---

## Need Help?

- **API Documentation:** `http://localhost:8000/docs`
- **Deployment Guide:** `GOOGLE_CLOUD_RUN_DEPLOYMENT.md`
- **Security Notes:** `SECURITY.md`
- **Multi-tenant Setup:** `MULTI_TENANT_SETUP.md`

---

**Happy Testing! 🚀**
