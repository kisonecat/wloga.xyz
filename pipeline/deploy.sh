#!/usr/bin/env nix-shell
#!nix-shell -i bash -p awscli2
#
# Deploy output/ to S3 bucket wloga.xyz
#
# Usage:
#     ./deploy.sh [--dry-run]
#
# Requires AWS credentials to be configured (~/.aws/credentials or environment variables)

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/output"
BUCKET="s3://wloga.xyz"

if [[ ! -d "$OUTPUT_DIR" ]]; then
    echo "Error: output/ directory not found. Run 'npm run build' in frontend/ first."
    exit 1
fi

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN="--dryrun"
    echo "Dry run mode - no changes will be made"
fi

echo "Deploying $OUTPUT_DIR to $BUCKET..."

# Sync HTML files
echo "Uploading HTML files..."
aws s3 sync "$OUTPUT_DIR" "$BUCKET" \
    --exclude "*" \
    --include "*.html" \
    --content-type "text/html; charset=utf-8" \
    --cache-control "max-age=3600" \
    $DRY_RUN

# Sync CSS files
echo "Uploading CSS files..."
aws s3 sync "$OUTPUT_DIR" "$BUCKET" \
    --exclude "*" \
    --include "*.css" \
    --content-type "text/css; charset=utf-8" \
    --cache-control "max-age=31536000, immutable" \
    $DRY_RUN

# Sync JavaScript files
echo "Uploading JavaScript files..."
aws s3 sync "$OUTPUT_DIR" "$BUCKET" \
    --exclude "*" \
    --include "*.js" \
    --content-type "application/javascript; charset=utf-8" \
    --cache-control "max-age=31536000, immutable" \
    $DRY_RUN

# Sync JSON files
echo "Uploading JSON files..."
aws s3 sync "$OUTPUT_DIR" "$BUCKET" \
    --exclude "*" \
    --include "*.json" \
    --content-type "application/json; charset=utf-8" \
    --cache-control "max-age=3600" \
    $DRY_RUN

# Sync any other files (images, etc.)
echo "Uploading other files..."
aws s3 sync "$OUTPUT_DIR" "$BUCKET" \
    --exclude "*.html" \
    --exclude "*.css" \
    --exclude "*.js" \
    --exclude "*.json" \
    --cache-control "max-age=86400" \
    $DRY_RUN

# Delete files that no longer exist locally
echo "Cleaning up old files..."
aws s3 sync "$OUTPUT_DIR" "$BUCKET" \
    --delete \
    $DRY_RUN

echo "Creating invalidation..."
aws cloudfront create-invalidation --distribution-id E1CD1ZG7BI85AF --paths "/*"

echo "Done!"
