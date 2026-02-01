# Google Cloud Run Deployment Guide

Complete step-by-step guide to deploy your StatBricks app to Google Cloud Run with PostgreSQL (Cloud SQL).

---

## 📋 Prerequisites

### What You Need:
- ✅ Google Cloud account with billing enabled
- ✅ Google Cloud SQL PostgreSQL database (you have this)
- ✅ `gcloud` CLI installed ([Install Guide](https://cloud.google.com/sdk/docs/install))
- ✅ Docker installed locally (for testing)
- ✅ Your app code (this repository)

### Initial Setup:

```bash
# 1. Install gcloud CLI (if not installed)
# Visit: https://cloud.google.com/sdk/docs/install

# 2. Login to Google Cloud
gcloud auth login

# 3. Set your project
gcloud config set project YOUR_PROJECT_ID

# 4. Enable required APIs
gcloud services enable \
    run.googleapis.com \
    sql-component.googleapis.com \
    sqladmin.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com
```

---

## 🗄️ Step 1: Configure Cloud SQL Database

### Get Your Database Connection Details

```bash
# List your Cloud SQL instances
gcloud sql instances list

# Creating a development instance
gcloud sql instances create pos \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=europe-west1 \
  --storage-size=10

gcloud sql users set-password postgres \
  --instance=pos \
  --password=YOUR_SECURE_PASSWORD

# Alternatively
gcloud sql instances create pos \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=europe-west1 \
  --root-password=YOUR_SECURE_PASSWORD

# Get connection name (format: PROJECT_ID:REGION:INSTANCE_NAME)
gcloud sql instances describe YOUR_INSTANCE_NAME --format="value(connectionName)"
```

**Example output:** `my-project:us-central1:my-postgres-db`

### Create Database & User (if not done)

```bash
# Connect to your Cloud SQL instance
gcloud sql connect YOUR_INSTANCE_NAME --user=postgres

# In PostgreSQL prompt:
CREATE DATABASE statbricks_db;
CREATE USER statbricks_user WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE statbricks_db TO statbricks_user;
\q
```

---

## 🔐 Step 2: Store Secrets in Secret Manager

Cloud Run best practice: Use Secret Manager for sensitive data.

```bash
# Create secrets for your environment variables
echo -n "your-secret-key-here" | gcloud secrets create SECRET_KEY --data-file=-
echo -n "your-postmark-token" | gcloud secrets create POSTMARK_SERVER_TOKEN --data-file=-
echo -n "your-r2-access-key" | gcloud secrets create R2_ACCESS_KEY_ID --data-file=-
echo -n "your-r2-secret-key" | gcloud secrets create R2_SECRET_ACCESS_KEY --data-file=-
echo -n "your-anthropic-key" | gcloud secrets create ANTHROPIC_API_KEY --data-file=-

# Create database password secret
echo -n "your-database-password" | gcloud secrets create DB_PASSWORD --data-file=-
```

---

## 🐳 Step 3: Build and Push Docker Image

### Option A: Build Locally and Push

```bash
# 1. Create Artifact Registry repository (one-time setup)
gcloud artifacts repositories create statbricks \
    --repository-format=docker \
    --location=us-central1 \
    --description="StatBricks Docker images"

# 2. Configure Docker authentication
gcloud auth configure-docker us-central1-docker.pkg.dev

# 3. Build Docker image
docker build -t statbricks:latest .

# 4. Tag image for Artifact Registry
docker tag statbricks:latest \
    us-central1-docker.pkg.dev/YOUR_PROJECT_ID/statbricks/app:latest

# 5. Push to Artifact Registry
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/statbricks/app:latest
```

### Option B: Build in Cloud (Recommended - Faster)

```bash
# Build and push in one command using Cloud Build
gcloud builds submit --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/statbricks/app:latest
```

---

## 🚀 Step 4: Deploy to Cloud Run

### Create deployment script

Create `deploy-cloud-run.sh`:

```bash
#!/bin/bash

# Configuration
PROJECT_ID="your-project-id"
REGION="us-central1"
SERVICE_NAME="statbricks"
IMAGE="us-central1-docker.pkg.dev/${PROJECT_ID}/statbricks/app:latest"

# Cloud SQL connection
SQL_CONNECTION_NAME="${PROJECT_ID}:${REGION}:your-instance-name"

# Deploy to Cloud Run
gcloud run deploy ${SERVICE_NAME} \
    --image ${IMAGE} \
    --platform managed \
    --region ${REGION} \
    --allow-unauthenticated \
    --min-instances 0 \
    --max-instances 10 \
    --memory 512Mi \
    --cpu 1 \
    --timeout 300 \
    --port 8080 \
    --add-cloudsql-instances ${SQL_CONNECTION_NAME} \
    --set-env-vars="DATABASE_URL=postgresql+asyncpg://statbricks_user@/statbricks_db?host=/cloudsql/${SQL_CONNECTION_NAME}" \
    --set-env-vars="APP_NAME=StatBricks" \
    --set-env-vars="DEBUG=False" \
    --set-env-vars="SEED_DEMO_DATA=false" \
    --set-env-vars="ALGORITHM=HS256" \
    --set-env-vars="ACCESS_TOKEN_EXPIRE_MINUTES=480" \
    --set-env-vars="R2_ENDPOINT_URL=https://YOUR-ACCOUNT.r2.cloudflarestorage.com" \
    --set-env-vars="R2_BUCKET_NAME=statbricks-products" \
    --set-env-vars="R2_PUBLIC_URL=https://your-bucket.r2.dev" \
    --set-env-vars="AI_MODEL=anthropic/claude-haiku-4-5-20251001" \
    --set-env-vars="AI_MAX_TOKENS=300" \
    --set-env-vars="AI_CLASSIFICATION_ENABLED=True" \
    --set-env-vars="POSTMARK_ENABLED=True" \
    --set-env-vars="POSTMARK_FROM_EMAIL=noreply@statbricks.com" \
    --set-env-vars="POSTMARK_FROM_NAME=StatBricks Team" \
    --set-env-vars="EMAIL_TEST_MODE=False" \
    --set-secrets="SECRET_KEY=SECRET_KEY:latest" \
    --set-secrets="DB_PASSWORD=DB_PASSWORD:latest" \
    --set-secrets="POSTMARK_SERVER_TOKEN=POSTMARK_SERVER_TOKEN:latest" \
    --set-secrets="R2_ACCESS_KEY_ID=R2_ACCESS_KEY_ID:latest" \
    --set-secrets="R2_SECRET_ACCESS_KEY=R2_SECRET_ACCESS_KEY:latest" \
    --set-secrets="ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest"

echo "Deployment complete!"
echo "Service URL:"
gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format="value(status.url)"
```

Make it executable and run:

```bash
chmod +x deploy-cloud-run.sh
./deploy-cloud-run.sh
```

---

## 🔧 Step 5: Configure Database Connection

### Update DATABASE_URL

The Cloud Run deployment automatically connects to Cloud SQL via Unix socket:

**Format:**
```
postgresql+asyncpg://USER@/DATABASE?host=/cloudsql/CONNECTION_NAME
```

**Example:**
```
postgresql+asyncpg://statbricks_user@/statbricks_db?host=/cloudsql/my-project:us-central1:my-postgres-db
```

### Enable Cloud SQL Admin API

```bash
gcloud services enable sqladmin.googleapis.com
```

### Grant Cloud Run Service Account Access

```bash
# Get Cloud Run service account
SERVICE_ACCOUNT=$(gcloud run services describe statbricks \
    --region us-central1 \
    --format="value(spec.template.spec.serviceAccountName)")

# Grant Cloud SQL Client role
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/cloudsql.client"
```

---

## 🌐 Step 6: Custom Domain (Optional)

### Map Custom Domain

```bash
# 1. Verify domain ownership in Google Search Console
# Visit: https://search.google.com/search-console

# 2. Map domain to Cloud Run
gcloud run domain-mappings create \
    --service statbricks \
    --domain app.yourdomain.com \
    --region us-central1

# 3. Add DNS records (shown in output)
# - CNAME or A record pointing to Cloud Run
```

### SSL Certificate

Cloud Run automatically provisions SSL certificates for custom domains (free via Let's Encrypt).

---

## 🧪 Step 7: Test Your Deployment

### Health Check

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe statbricks \
    --region us-central1 \
    --format="value(status.url)")

# Test health endpoint
curl ${SERVICE_URL}/health
# Expected: {"status":"healthy"}
```

### Test Frontend

```bash
# Open in browser
open ${SERVICE_URL}
```

### Test API

```bash
# Test login endpoint
curl -X POST ${SERVICE_URL}/auth/login \
    -H "Content-Type: application/json" \
    -d '{
        "username": "admin",
        "password": "admin123",
        "subdomain": "demo"
    }'
```

---

## 📊 Step 8: Monitor Your App

### View Logs

```bash
# Real-time logs
gcloud run services logs tail statbricks --region us-central1

# View in Cloud Console
open "https://console.cloud.google.com/run/detail/us-central1/statbricks/logs"
```

### Metrics

```bash
# Open metrics dashboard
open "https://console.cloud.google.com/run/detail/us-central1/statbricks/metrics"
```

---

## 💰 Cost Optimization

### Free Tier

Cloud Run offers generous free tier:
- **2 million requests/month**
- **360,000 GB-seconds of memory**
- **180,000 vCPU-seconds**

### Scaling Configuration

```bash
# Update to optimize costs
gcloud run services update statbricks \
    --region us-central1 \
    --min-instances 0 \  # Scale to zero when no traffic
    --max-instances 5 \  # Limit maximum instances
    --concurrency 80     # Handle more requests per instance
```

---

## 🔄 CI/CD with GitHub Actions

Create `.github/workflows/deploy-cloud-run.yml`:

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches:
      - main

env:
  PROJECT_ID: your-project-id
  SERVICE_NAME: statbricks
  REGION: us-central1

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Cloud SDK
        uses: google-github-actions/setup-gcloud@v1
        with:
          service_account_key: ${{ secrets.GCP_SA_KEY }}
          project_id: ${{ env.PROJECT_ID }}

      - name: Configure Docker
        run: gcloud auth configure-docker us-central1-docker.pkg.dev

      - name: Build and Push
        run: |
          gcloud builds submit \
            --tag us-central1-docker.pkg.dev/$PROJECT_ID/statbricks/app:$GITHUB_SHA \
            --tag us-central1-docker.pkg.dev/$PROJECT_ID/statbricks/app:latest

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy $SERVICE_NAME \
            --image us-central1-docker.pkg.dev/$PROJECT_ID/statbricks/app:latest \
            --region $REGION \
            --platform managed
```

**Setup:**
1. Create service account with Cloud Run Admin role
2. Download JSON key
3. Add to GitHub Secrets as `GCP_SA_KEY`

---

## 🆘 Troubleshooting

### Issue: ConnectionRefusedError on Startup

**Symptoms:**
- Container logs show `ConnectionRefusedError: [Errno 111] Connection refused`
- Error appears in `asyncpg` or `_create_ssl_connection` context
- Container exits with code 3
- Startup probe fails

**Root Cause:**
The Cloud SQL Auth Proxy sidecar takes a few seconds to initialize. Your application tries to connect immediately and fails before the proxy is ready.

**Solution (IMPLEMENTED):**
The codebase now includes automatic retry logic (up to 60 seconds) to wait for the database to become available. If you still see this error:

1. **Verify DATABASE_URL format is EXACTLY correct for asyncpg:**
   ```
   postgresql+asyncpg://USER:PASSWORD@/DATABASE_NAME?host=/cloudsql/CONNECTION_NAME
   ```
   
   **Critical points:**
   - Must include `+asyncpg` after `postgresql`
   - Must use `/cloudsql/` (with leading slash)
   - No `@localhost` or IP address - use Unix socket via `host=` parameter
   
   **Example:**
   ```
   postgresql+asyncpg://statbricks_user:mypassword@/statbricks_db?host=/cloudsql/my-project:us-central1:my-db
   ```

2. **Check Cloud SQL connection name matches exactly:**
   ```bash
   # Get your connection name
   gcloud sql instances describe YOUR_INSTANCE_NAME --format="value(connectionName)"
   
   # Verify it's added to Cloud Run
   gcloud run services describe statbricks --region us-central1 --format="value(spec.template.spec.containers[0].resources.limits)"
   ```

3. **Verify service account has Cloud SQL Client role:**
   ```bash
   # Get service account
   SERVICE_ACCOUNT=$(gcloud run services describe statbricks \
       --region us-central1 \
       --format="value(spec.template.spec.serviceAccountName)")
   
   # Check permissions
   gcloud projects get-iam-policy-binding YOUR_PROJECT_ID \
       --member="serviceAccount:${SERVICE_ACCOUNT}" \
       --role="roles/cloudsql.client"
   ```

4. **Check logs for retry attempts:**
   ```bash
   gcloud run services logs read statbricks --region us-central1 --limit 50
   ```
   
   You should see:
   - "Attempting to connect to database..."
   - "Database connection attempt X failed. Retrying in 5 seconds..."
   - "Database connection successful!"

### Issue: Database Connection Failed

**Check:**
```bash
# Verify Cloud SQL connection
gcloud sql instances describe YOUR_INSTANCE_NAME

# Check service account permissions
gcloud projects get-iam-policy YOUR_PROJECT_ID \
    --flatten="bindings[].members" \
    --filter="bindings.role:roles/cloudsql.client"
```

**Fix:**
```bash
# Grant Cloud SQL Client role
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
    --role="roles/cloudsql.client"
```

### Issue: Container Fails to Start

**Check logs:**
```bash
gcloud run services logs read statbricks \
    --region us-central1 \
    --limit 100
```

**Common causes:**
- Missing environment variables
- Database connection issues
- Port mismatch (must use PORT env var)
- Insufficient memory

### Issue: 502 Bad Gateway

**Solutions:**
- Increase `--timeout` (default: 300s)
- Increase `--memory` (try 1Gi)
- Check application startup time
- Verify health check endpoint works

### Issue: Secrets Not Found

**Check:**
```bash
# List secrets
gcloud secrets list

# Grant access to service account
gcloud secrets add-iam-policy-binding SECRET_NAME \
    --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
    --role="roles/secretmanager.secretAccessor"
```

---

## 📦 Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://user@/db?host=/cloudsql/...` |
| `SECRET_KEY` | JWT secret key | `your-secret-key-256-bits` |
| `PORT` | Server port (Cloud Run sets this) | `8080` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SEED_DEMO_DATA` | Seed demo data on first run | `false` |
| `DEBUG` | Enable debug mode | `False` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT expiration | `480` |

### External Services

| Variable | Description |
|----------|-------------|
| `POSTMARK_SERVER_TOKEN` | Email service API key |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret key |
| `ANTHROPIC_API_KEY` | AI classification API key |

---

## 🎯 Quick Reference Commands

```bash
# Deploy new version
gcloud builds submit --tag us-central1-docker.pkg.dev/PROJECT/statbricks/app:latest && \
gcloud run deploy statbricks --image us-central1-docker.pkg.dev/PROJECT/statbricks/app:latest --region us-central1

# View logs
gcloud run services logs tail statbricks --region us-central1

# Get service URL
gcloud run services describe statbricks --region us-central1 --format="value(status.url)"

# Update environment variable
gcloud run services update statbricks --region us-central1 --set-env-vars="KEY=value"

# Scale configuration
gcloud run services update statbricks --region us-central1 --min-instances=0 --max-instances=10

# Rollback to previous revision
gcloud run services update-traffic statbricks --region us-central1 --to-revisions=PREVIOUS_REVISION=100
```

---

## ✅ Deployment Checklist

- [ ] Google Cloud Project created and billing enabled
- [ ] Cloud SQL PostgreSQL database created
- [ ] Database user and database created
- [ ] Required APIs enabled
- [ ] Secrets stored in Secret Manager
- [ ] Docker image built and pushed to Artifact Registry
- [ ] Cloud Run service deployed
- [ ] Service account has Cloud SQL Client role
- [ ] Environment variables configured
- [ ] Custom domain mapped (if applicable)
- [ ] SSL certificate issued
- [ ] Health check passes
- [ ] Frontend loads correctly
- [ ] API endpoints working
- [ ] Database connection successful

---

## 📚 Additional Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud SQL for PostgreSQL](https://cloud.google.com/sql/docs/postgres)
- [Secret Manager](https://cloud.google.com/secret-manager/docs)
- [Artifact Registry](https://cloud.google.com/artifact-registry/docs)
- [Cloud Build](https://cloud.google.com/build/docs)

---

**Deployment Status:** Ready for production! 🚀

**Support:** For issues, check logs first, then review this guide's troubleshooting section.
