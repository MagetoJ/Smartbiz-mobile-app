# 🚀 Quick Deployment Guide (europe-west1)

## ✅ What's Ready:

Your deployment is **99% complete**! The script is now updated to:
- ✅ Use **europe-west1** region
- ✅ Automatically handle secret permissions
- ✅ Fix the permission error you encountered

---

## 🔧 Quick Fix for Current Deployment:

Since you already ran the deployment and encountered the permissions error, you have two options:

### **Option 1: Grant Permissions Manually (Fastest)**

Run these two commands to fix the current deployment:

```bash
# Grant permission to SECRET_KEY
gcloud secrets add-iam-policy-binding SECRET_KEY \
    --member="serviceAccount:140767538006-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

# Grant permission to DB_PASSWORD
gcloud secrets add-iam-policy-binding DB_PASSWORD \
    --member="serviceAccount:140767538006-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

# Then check if deployment succeeded
gcloud run services describe statbricks --region europe-west1
```

### **Option 2: Clean Up and Re-run (Fresh Start)**

If you want a completely fresh deployment with the updated script:

```bash
# 1. Delete the old (failed) service
gcloud run services delete statbricks --region us-central1 --quiet

# 2. (Optional) Delete old secrets to recreate them
gcloud secrets delete SECRET_KEY --quiet
gcloud secrets delete DB_PASSWORD --quiet

# 3. Run the updated deployment script
./deploy-cloud-run.sh
```

---

## 🎯 Fresh Deployment Steps:

If you're starting fresh or after cleanup:

### **1. Verify Your Cloud SQL Instance Location**

```bash
# Check where your Cloud SQL instance is located
gcloud sql instances list

# Make sure it's in europe-west1 (Belgium)
# If it's in a different region, you may want to:
# - Create a new instance in europe-west1, OR
# - Update the script to match your SQL instance region
```

### **2. Run the Deployment**

```bash
# Simply run the script
./deploy-cloud-run.sh

# It will prompt for:
# - Project ID (your GCP project)
# - SQL instance name
# - Database password (if secrets not created yet)

# The script will automatically:
# ✅ Enable required APIs
# ✅ Create Artifact Registry in europe-west1
# ✅ Build Docker image
# ✅ Create secrets with proper permissions
# ✅ Deploy to Cloud Run
# ✅ Configure database connection
# ✅ Test health endpoint
```

### **3. Monitor Deployment**

```bash
# Watch logs in real-time
gcloud run services logs tail statbricks --region europe-west1

# Check service status
gcloud run services describe statbricks --region europe-west1

# Get service URL
gcloud run services describe statbricks \
    --region europe-west1 \
    --format="value(status.url)"
```

---

## 🌍 Important: Region Considerations

### **Your Setup:**
- **Cloud Run:** europe-west1 (Belgium)
- **Cloud SQL:** Should also be in europe-west1 for best performance

### **If Cloud SQL is in Different Region:**

**Pros:**
- Still works (Cloud Run can connect across regions)

**Cons:**
- Higher latency (~50-200ms per query)
- Cross-region network charges

**Recommendation:**
- Keep Cloud SQL and Cloud Run in same region for best performance
- If your SQL is in different region, consider:
  - Migrating to europe-west1, OR
  - Changing Cloud Run to match SQL region

---

## 💰 Cost Summary (europe-west1):

### **Europe Pricing:**

| Resource | Cost/Month | Notes |
|----------|------------|-------|
| Cloud Run | $0-5 | Free tier covers most traffic |
| Cloud SQL (f1-micro) | €7-8 (~$7-9) | Smallest production-ready |
| Artifact Registry | ~$0.10 | Storage for Docker images |
| Secrets | $0 | Free |
| **Total** | **~$7-14/month** | 💰 Very affordable |

**Note:** Europe region pricing is similar to US pricing.

---

## ✅ Post-Deployment Checklist:

After successful deployment:

- [ ] Service URL accessible
- [ ] Health check passes: `curl https://your-url/health`
- [ ] Frontend loads: Visit service URL in browser
- [ ] Login works: admin / admin123
- [ ] Database connected: Check logs for errors
- [ ] Demo data seeded: Create a test sale

---

## 🔍 Troubleshooting:

### **Issue: Secret permissions error (again)**

```bash
# Get the compute service account
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')

# Grant permissions
gcloud secrets add-iam-policy-binding SECRET_KEY \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding DB_PASSWORD \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### **Issue: Database connection failed**

```bash
# Verify Cloud SQL instance exists in europe-west1
gcloud sql instances describe YOUR_INSTANCE_NAME

# Check connection name matches
gcloud sql instances describe YOUR_INSTANCE_NAME --format="value(connectionName)"

# Should be: YOUR_PROJECT:europe-west1:YOUR_INSTANCE
```

### **Issue: Build timeout**

```bash
# Increase build timeout (if needed)
gcloud builds submit --timeout=20m --tag IMAGE_URL
```

---

## 🎯 Quick Commands Reference:

```bash
# Deploy/Update service
./deploy-cloud-run.sh

# View logs
gcloud run services logs tail statbricks --region europe-west1

# Get service URL
gcloud run services describe statbricks --region europe-west1 --format="value(status.url)"

# Update environment variable
gcloud run services update statbricks \
    --region europe-west1 \
    --set-env-vars="KEY=value"

# Scale up (always-on)
gcloud run services update statbricks \
    --region europe-west1 \
    --min-instances 1

# View service details
gcloud run services describe statbricks --region europe-west1
```

---

## 📞 Need Help?

### **Check deployment guide:**
- Full guide: `GOOGLE_CLOUD_RUN_DEPLOYMENT.md`
- Troubleshooting section included

### **View service status:**
```bash
# Console URL
https://console.cloud.google.com/run/detail/europe-west1/statbricks
```

---

**You're ready to deploy!** 🚀

Run: `./deploy-cloud-run.sh`
