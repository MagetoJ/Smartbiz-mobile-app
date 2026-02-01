#!/bin/sh
# Runtime environment variable injection for React app
# This script replaces __ENV__ placeholders in the built JS files with actual env vars

set -e

echo "🚀 Starting frontend container..."
echo "📝 Injecting runtime environment variables..."

# Default values if not provided
API_URL=${VITE_API_URL:-"http://localhost:8000"}

echo "   API_URL: $API_URL"

# Create runtime config file that the app can fetch
cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__RUNTIME_CONFIG__ = {
  API_URL: "$API_URL"
};
EOF

echo "✅ Environment variables injected successfully!"
echo "🌐 Starting nginx..."

# Execute the original command (nginx)
exec "$@"
