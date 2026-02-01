# Frontend Dockerfile (React + Nginx)
# Multi-stage build for optimized production deployment

# ============================================
# Stage 1: Build React Application
# ============================================
FROM node:20-alpine AS builder

# Build arguments for Vite environment variables
ARG VITE_API_URL
ARG VITE_R2_PUBLIC_URL

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build for production with environment variables
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_R2_PUBLIC_URL=${VITE_R2_PUBLIC_URL}
RUN yarn build

# ============================================
# Stage 2: Production Nginx Server
# ============================================
FROM nginx:1.25-alpine

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built React app from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy environment variable injection script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port 80 (Render will map this internally)
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

# Use custom entrypoint to inject env vars at runtime
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
