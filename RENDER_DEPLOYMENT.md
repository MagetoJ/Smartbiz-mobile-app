# 🚀 Render Deployment Guide

Complete guide for deploying StatBricks to Render with separated frontend and backend services.

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Detailed Setup](#detailed-setup)
5. [Environment Variables](#environment-variables)
6. [Post-Deployment](#post-deployment)
7. [Scaling & Performance](#scaling--performance)
8. [Cost Estimates](#cost-estimates)
9. [Troubleshooting](#troubleshooting)

---

## 🏗️ Architecture Overview

Your app is deployed as **3 separate services**:

```
┌─────────────────────────────────────────────────┐
│ Backend API (Python/FastAPI)                    │
│ - Docker container                              │
│ - URL: https://statbricks-api.onrender.com     │
│ - Auto-scaling: 1-10 instances                  │
└─────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────┐
│ PostgreSQL Database                             │
│ - Managed by Render                             │
│ - Shared across services                        │
└─────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────┐
│ Frontend (React + Nginx)                        │
│ - Static site with Docker                      │
│ - URL: https://statbricks.onrender.com         │
│ - Calls backend API                             │
└─────────────────────────────────────────────────┘
         ↕              ↕              ↕
    Web Users    Android App     iOS App
```

**Benefits:**
- ✅ Independent scaling (scale backend without frontend)
- ✅ Mobile apps can use backend API directly
- ✅ Frontend served by fast nginx
- ✅ Clear separation of concerns

---

## 📦 Prerequisites

1. **GitHub Account** - Your code must be in a Git repository
2. **Render Account** - Sign up at [render.com](https://render.com)
3. **Project Pushed to GitHub**

```bash
# Make sure your code is committed and pushed
git add .
git commit -m "Separate frontend and backend for Render"
git push origin main
```

---

## ⚡ Quick Start

### Option 1: Blueprint (Recommended) - Deploys everything automatically

1. Push your code to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click **"New Blueprint Instance"**
4. Connect your GitHub repository
5. Render will detect `render.yaml` and create all services
6. Wait 10-15 minutes for initial deployment
7. Update environment variables (see below)
8. Redeploy services

### Option 2: Manual Setup

Follow the [Detailed Setup](#detailed-setup) section below.

---

## 🔧 Detailed Setup

### Step 1: Create PostgreSQL Database

1. Go to Render Dashboard → **"New" → "PostgreSQL"**
2. Configure:
   - **Name:** `statbricks-db`
   - **Database:** `statbricks`
   - **User:** `statbricks`
   - **Region:** `Oregon` (or your preferred region)
   - **Plan:** Free (testing) or Basic ($7/month) or Standard ($20/month)
3. Click **"Create Database"**
4. Save the **Internal Database URL** (starts with `postgresql://`)

### Step 2: Create Backend Service

1. Go to Render Dashboard → **"New" → "Web Service"**
2. Connect your GitHub repository
3. Configure:
   - **Name:** `statbricks-api`
   - **Region:** `Oregon` (match database region)
   - **Branch:** `main`
   - **Root Directory:** Leave empty
   - **Runtime:** `Docker`
   - **Dockerfile Path:** `./backend/Dockerfile`
   - **Docker Context:** `./backend`
   - **Plan:** Starter ($7/month) or Standard ($25/month)

4. **Environment Variables:**
   ```
   DATABASE_URL → Link to statbricks-db (connectionString)
   SECRET_KEY → Auto-generate
   CORS_ORIGINS → https://statbricks-frontend.onrender.com
   ```

5. Click **"Create Web Service"**
6. Wait for deployment (~5-10 minutes)
7. Save the backend URL (e.g., `https://statbricks-api.onrender.com`)

### Step 3: Create Frontend Service

1. Go to Render Dashboard → **"New" → "Web Service"**
2. Connect your GitHub repository (same repo)
3. Configure:
   - **Name:** `statbricks-frontend`
   - **Region:** `Oregon` (same as backend)
   - **Branch:** `main`
   - **Root Directory:** Leave empty
   - **Runtime:** `Docker`
   - **Dockerfile Path:** `./frontend/Dockerfile`
   - **Docker Context:** `./frontend`
   - **Plan:** Starter ($7/month)

4. **Environment Variables:**
   ```
   VITE_API_URL → https://statbricks-api.onrender.com
   ```

5. Click **"Create Web Service"**
6. Wait for deployment (~5-10 minutes)

### Step 4: Update CORS

1. Go to backend service → **"Environment"**
2. Update `CORS_ORIGINS`:
   ```
   https://statbricks-frontend.onrender.com,https://www.statbricks-frontend.onrender.com
   ```
3. Click **"Save Changes"**
4. Backend will auto-redeploy

---

## 🔐 Environment Variables

### Backend Service Required Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `DATABASE_URL` | From database | PostgreSQL connection string |
| `SECRET_KEY` | Auto-generate | JWT secret (32+ chars) |
| `CORS_ORIGINS` | Frontend URL(s) | Comma-separated, no spaces |
| `DB_PASSWORD` | From database | Database password |

### Backend Service Optional Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `POSTMARK_API_KEY` | Your key | Email receipts |
| `R2_ACCOUNT_ID` | Your Cloudflare ID | Image storage |
| `R2_ACCESS_KEY_ID` | Your R2 key | Image storage |
| `R2_SECRET_ACCESS_KEY` | Your R2 secret | Image storage |
| `R2_BUCKET_NAME` | Your bucket | Image storage |
| `OPENAI_API_KEY` | Your key | AI classification |

### Frontend Service Required Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `VITE_API_URL` | Backend URL | Full backend URL with https:// |

---

## ✅ Post-Deployment

### 1. Verify Backend Health

```bash
curl https://statbricks-api.onrender.com/health

# Should return: {"status":"healthy","service":"api"}
```

### 2. Test Frontend

Visit: `https://statbricks-frontend.onrender.com`

- Should load the React app
- Login with: `admin` / `admin123`

### 3. Test API Connection

Open browser console on frontend, login, and check:
- No CORS errors
- API calls succeed
- Data loads properly

### 4. Initialize Database

First login will auto-create:
- Default tenant
- Admin user
- Demo data (if database is empty)

### 5. Configure Custom Domains (Optional)

**Backend:**
1. Go to backend service → **"Settings" → "Custom Domain"**
2. Add: `api.yourdomain.com`
3. Update DNS: Add CNAME pointing to Render

**Frontend:**
1. Go to frontend service → **"Settings" → "Custom Domain"**
2. Add: `yourdomain.com` and `www.yourdomain.com`
3. Update DNS: Add CNAME pointing to Render

**After adding custom domains:**
- Update `CORS_ORIGINS` in backend to include new domains
- Update `VITE_API_URL` in frontend to use `api.yourdomain.com`

---

## 📈 Scaling & Performance

### Auto-Scaling (Standard Plan)

Edit `render.yaml`:

```yaml
services:
  - type: web
    name: statbricks-api
    plan: standard  # Required for auto-scaling
    autoDeploy: true
    scaling:
      minInstances: 1
      maxInstances: 10
      targetMemoryPercent: 80
      targetCPUPercent: 80
```

### Performance Tips

1. **Enable Persistent Disks** (for uploads)
   - Backend service → Settings → Add disk
   - Mount path: `/app/uploads`

2. **Use CDN for Frontend** (optional)
   - Cloudflare or similar
   - Point to your frontend URL

3. **Database Connection Pooling**
   - Already configured in `backend/database.py`
   - Max connections: 20

4. **Health Checks**
   - Backend: `/health`
   - Frontend: `/health`
   - Both auto-configured

---

## 💰 Cost Estimates

### Starter Plan (Minimal Cost)

| Service | Plan | Cost/Month |
|---------|------|------------|
| Backend API | Starter | $7 |
| Frontend | Starter | $7 |
| Database | Starter | $7 |
| **Total** | | **$21/month** |

**Good for:** Testing, small businesses, <1000 users

### Standard Plan (Recommended for Production)

| Service | Plan | Cost/Month |
|---------|------|------------|
| Backend API | Standard | $25 |
| Frontend | Starter | $7 |
| Database | Standard | $20 |
| **Total** | | **$52/month** |

**Good for:** Production, auto-scaling, 1000-10000 users

### Pro Plan (High Traffic)

| Service | Plan | Cost/Month |
|---------|------|------------|
| Backend API | Pro + Scaling | $85+ |
| Frontend | Standard | $25 |
| Database | Pro | $90 |
| **Total** | | **$200+/month** |

**Good for:** 10000+ users, high traffic, multiple branches

---

## 🐛 Troubleshooting

### Issue: Backend won't start

**Error:** `Database connection failed`

**Solution:**
1. Check `DATABASE_URL` is set correctly
2. Verify database is running
3. Check database region matches backend region

---

### Issue: Frontend shows "Failed to fetch"

**Error:** `CORS error` or `Network error`

**Solution:**
1. Verify `VITE_API_URL` points to correct backend URL
2. Check `CORS_ORIGINS` in backend includes frontend URL
3. Ensure both URLs start with `https://`

---

### Issue: "Unhealthy" service status

**Backend Health Check Failed**

**Solution:**
1. Check logs: Dashboard → Service → Logs
2. Verify port 8000 is correct
3. Check health endpoint: `/health`

**Frontend Health Check Failed**

**Solution:**
1. Check logs for nginx errors
2. Verify port 80 is exposed
3. Test health endpoint: `/health`

---

### Issue: Slow initial requests (cold starts)

**Symptoms:** First request after inactivity is slow

**Solution:**
1. Upgrade to Standard plan (keeps 1 instance always running)
2. Or set `minInstances: 1` in render.yaml
3. Or use paid tier to reduce sleep

---

### Issue: Build timeout

**Error:** `Build exceeded time limit`

**Solution:**
1. Check internet connection during build
2. Increase timeout (Render Pro)
3. Optimize Docker layers

---

### Issue: Environment variable not updating

**Solution:**
1. After changing env vars, manually redeploy
2. Dashboard → Service → Manual Deploy
3. Check deployment logs

---

## 📱 Mobile App Configuration

Your mobile apps (Android/iOS) should connect directly to the backend:

```typescript
// React Native example
const API_URL = 'https://statbricks-api.onrender.com';

// Use this URL for all API calls
fetch(`${API_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password })
});
```

**No need to go through frontend - backend is publicly accessible!**

---

## 🔄 Continuous Deployment

Render auto-deploys when you push to GitHub:

```bash
# Make changes
git add .
git commit -m "Update feature"
git push origin main

# Render automatically:
# 1. Detects changes
# 2. Builds Docker images
# 3. Runs health checks
# 4. Deploys new version
# 5. Zero-downtime rollout
```

**Deployment notifications:**
- Email alerts
- Slack integration
- Discord webhooks

---

## 📞 Support

### Render Documentation
- [Render Docs](https://render.com/docs)
- [Docker Deployment](https://render.com/docs/docker)
- [PostgreSQL](https://render.com/docs/databases)

### Community
- [Render Community](https://community.render.com)
- [Render Status](https://status.render.com)

### Your App Logs
```bash
# View real-time logs
Dashboard → Service → Logs (or use Render CLI)
```

---

## ✨ Next Steps

1. ✅ Deploy to Render
2. ✅ Test all functionality
3. ✅ Configure custom domains
4. ✅ Set up monitoring/alerts
5. ✅ Build mobile apps
6. ✅ Launch! 🎉

---

**You're ready to deploy!** 🚀

Questions? Check the troubleshooting section or Render's documentation.
