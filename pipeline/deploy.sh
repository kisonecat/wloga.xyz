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

# Sync with delete to remove old files, but preserve cache headers
aws s3 sync "$OUTPUT_DIR" "$BUCKET" \
    --delete \
    --cache-control "max-age=3600" \
    $DRY_RUN

# Set longer cache for hashed assets (they have content hashes in filenames)
aws s3 cp "$BUCKET/assets/" "$BUCKET/assets/" \
    --recursive \
    --cache-control "max-age=31536000, immutable" \
    --metadata-directive REPLACE \
    $DRY_RUN

echo "Done!"
