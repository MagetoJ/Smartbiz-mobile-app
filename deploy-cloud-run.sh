#!/bin/bash

# ========================================
# Google Cloud Run Deployment Script
# ========================================

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  StatBricks Cloud Run Deployment${NC}"
echo -e "${BLUE}========================================${NC}\n"

# ========================================
# Configuration (EDIT THESE VALUES)
# ========================================

# Check if configuration is set
if [ -z "$PROJECT_ID" ]; then
    echo -e "${YELLOW}Please set your configuration:${NC}"
    read -p "Enter your GCP Project ID: " PROJECT_ID
fi

if [ -z "$SQL_INSTANCE_NAME" ]; then
    read -p "Enter your Cloud SQL instance name: " SQL_INSTANCE_NAME
fi

if [ -z "$REGION" ]; then
    REGION="europe-west1"
    echo -e "Using default region: ${GREEN}$REGION${NC}"
fi

SERVICE_NAME="statbricks"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/statbricks/app:latest"
SQL_CONNECTION_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE_NAME}"

# ========================================
# Step 1: Verify gcloud setup
# ========================================

echo -e "\n${BLUE}Step 1: Verifying gcloud setup...${NC}"
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}ERROR: gcloud CLI not found. Please install it first.${NC}"
    echo "Visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

gcloud config set project $PROJECT_ID
echo -e "${GREEN}✓ Project set to: $PROJECT_ID${NC}"

# ========================================
# Step 2: Enable required APIs
# ========================================

echo -e "\n${BLUE}Step 2: Enabling required APIs...${NC}"
gcloud services enable \
    run.googleapis.com \
    sql-component.googleapis.com \
    sqladmin.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com

echo -e "${GREEN}✓ APIs enabled${NC}"

# ========================================
# Step 3: Create Artifact Registry (if not exists)
# ========================================

echo -e "\n${BLUE}Step 3: Setting up Artifact Registry...${NC}"
if ! gcloud artifacts repositories describe statbricks --location=$REGION &> /dev/null; then
    gcloud artifacts repositories create statbricks \
        --repository-format=docker \
        --location=$REGION \
        --description="StatBricks Docker images"
    echo -e "${GREEN}✓ Artifact Registry created${NC}"
else
    echo -e "${YELLOW}✓ Artifact Registry already exists${NC}"
fi

# ========================================
# Step 4: Build and push Docker image
# ========================================

echo -e "\n${BLUE}Step 4: Building and pushing Docker image...${NC}"
echo "This may take 5-10 minutes..."

gcloud builds submit --tag $IMAGE

echo -e "${GREEN}✓ Image built and pushed${NC}"

# ========================================
# Step 5: Deploy to Cloud Run
# ========================================

echo -e "\n${BLUE}Step 5: Deploying to Cloud Run...${NC}"

# Prompt for database password and create DATABASE_URL secret
if ! gcloud secrets describe DATABASE_URL &> /dev/null; then
    echo -e "${YELLOW}DATABASE_URL secret not found.${NC}"
    read -p "Enter database username (default: statbricks_user): " DB_USER
    DB_USER=${DB_USER:-statbricks_user}
    read -sp "Enter database password: " DB_PASSWORD
    echo
    read -p "Enter database name (default: statbricks_db): " DB_NAME
    DB_NAME=${DB_NAME:-statbricks_db}
    
    # Construct complete DATABASE_URL with password
    DATABASE_URL="postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${SQL_CONNECTION_NAME}"
    
    echo -n "$DATABASE_URL" | gcloud secrets create DATABASE_URL --data-file=-
    echo -e "${GREEN}✓ DATABASE_URL secret created with password${NC}"
    
    # Also create DB_PASSWORD secret for backward compatibility
    if ! gcloud secrets describe DB_PASSWORD &> /dev/null; then
        echo -n "$DB_PASSWORD" | gcloud secrets create DB_PASSWORD --data-file=-
    fi
fi

# Prompt for SECRET_KEY if doesn't exist
if ! gcloud secrets describe SECRET_KEY &> /dev/null; then
    echo -e "${YELLOW}SECRET_KEY not found.${NC}"
    echo "Generating random SECRET_KEY..."
    SECRET_KEY=$(openssl rand -hex 32)
    echo -n "$SECRET_KEY" | gcloud secrets create SECRET_KEY --data-file=-
    echo -e "${GREEN}✓ SECRET_KEY created${NC}"
fi

# Grant secret access to Cloud Run service account
echo -e "\n${BLUE}Configuring secret permissions...${NC}"

# Get the default compute service account
SERVICE_ACCOUNT="${PROJECT_ID//:/-}@appspot.gserviceaccount.com"
COMPUTE_SA="$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')-compute@developer.gserviceaccount.com"

# Grant access to SECRET_KEY
gcloud secrets add-iam-policy-binding SECRET_KEY \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --condition=None 2>/dev/null || echo -e "${YELLOW}Secret permission may already exist${NC}"

# Grant access to DB_PASSWORD
gcloud secrets add-iam-policy-binding DB_PASSWORD \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --condition=None 2>/dev/null || echo -e "${YELLOW}Secret permission may already exist${NC}"

# Grant access to DATABASE_URL
gcloud secrets add-iam-policy-binding DATABASE_URL \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --condition=None 2>/dev/null || echo -e "${YELLOW}Secret permission may already exist${NC}"

echo -e "${GREEN}✓ Secret permissions configured${NC}"

# Prompt for R2 credentials if not in secrets
if ! gcloud secrets describe R2_ACCESS_KEY_ID &> /dev/null; then
    echo -e "${YELLOW}R2 credentials not found. Please enter your Cloudflare R2 details:${NC}"
    read -p "R2 Endpoint URL (e.g., https://your-account.r2.cloudflarestorage.com): " R2_ENDPOINT
    read -p "R2 Access Key ID: " R2_ACCESS
    read -sp "R2 Secret Access Key: " R2_SECRET
    echo
    read -p "R2 Bucket Name: " R2_BUCKET
    read -p "R2 Public URL (optional, press Enter to skip): " R2_PUBLIC
    
    # Create R2 secrets
    echo -n "$R2_ACCESS" | gcloud secrets create R2_ACCESS_KEY_ID --data-file=-
    echo -n "$R2_SECRET" | gcloud secrets create R2_SECRET_ACCESS_KEY --data-file=-
    
    # Grant permissions
    gcloud secrets add-iam-policy-binding R2_ACCESS_KEY_ID \
        --member="serviceAccount:${COMPUTE_SA}" \
        --role="roles/secretmanager.secretAccessor" \
        --condition=None 2>/dev/null || true
    
    gcloud secrets add-iam-policy-binding R2_SECRET_ACCESS_KEY \
        --member="serviceAccount:${COMPUTE_SA}" \
        --role="roles/secretmanager.secretAccessor" \
        --condition=None 2>/dev/null || true
    
    echo -e "${GREEN}✓ R2 secrets created${NC}"
fi

# Get R2 config for deployment (if not prompted, use defaults or skip)
if [ -z "$R2_ENDPOINT" ]; then
    R2_ENDPOINT=${R2_ENDPOINT_URL:-"https://your-account.r2.cloudflarestorage.com"}
fi
if [ -z "$R2_BUCKET" ]; then
    R2_BUCKET=${R2_BUCKET_NAME:-"statbricks-products"}
fi
if [ -z "$R2_PUBLIC" ]; then
    R2_PUBLIC=${R2_PUBLIC_URL:-""}
fi

# Deploy
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
    --set-env-vars="APP_NAME=StatBricks" \
    --set-env-vars="DEBUG=False" \
    --set-env-vars="SEED_DEMO_DATA=true" \
    --set-env-vars="ALGORITHM=HS256" \
    --set-env-vars="ACCESS_TOKEN_EXPIRE_MINUTES=480" \
    --set-env-vars="R2_ENDPOINT_URL=${R2_ENDPOINT}" \
    --set-env-vars="R2_BUCKET_NAME=${R2_BUCKET}" \
    --set-env-vars="R2_PUBLIC_URL=${R2_PUBLIC}" \
    --set-secrets="DATABASE_URL=DATABASE_URL:latest" \
    --set-secrets="SECRET_KEY=SECRET_KEY:latest" \
    --set-secrets="R2_ACCESS_KEY_ID=R2_ACCESS_KEY_ID:latest" \
    --set-secrets="R2_SECRET_ACCESS_KEY=R2_SECRET_ACCESS_KEY:latest"

echo -e "${GREEN}✓ Deployment complete${NC}"

# ========================================
# Step 6: Grant Cloud SQL permissions
# ========================================

echo -e "\n${BLUE}Step 6: Configuring Cloud SQL permissions...${NC}"

SERVICE_ACCOUNT=$(gcloud run services describe ${SERVICE_NAME} \
    --region ${REGION} \
    --format="value(spec.template.spec.serviceAccountName)")

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/cloudsql.client" \
    --condition=None

echo -e "${GREEN}✓ Cloud SQL permissions configured${NC}"

# ========================================
# Success!
# ========================================

SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
    --region ${REGION} \
    --format="value(status.url)")

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Successful! 🚀${NC}"
echo -e "${GREEN}========================================${NC}\n"

echo -e "${BLUE}Service URL:${NC} ${GREEN}${SERVICE_URL}${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Visit your app: $SERVICE_URL"
echo "2. Login with: admin / admin123"
echo "3. View logs: gcloud run services logs tail $SERVICE_NAME --region $REGION"
echo "4. View in console: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME"

echo -e "\n${BLUE}Testing health endpoint...${NC}"
if curl -s "${SERVICE_URL}/health" | grep -q "healthy"; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${RED}⚠ Health check failed - check logs${NC}"
fi

echo -e "\n${GREEN}Done!${NC}\n"
