#!/usr/bin/env bash
set -euo pipefail

STACK="${STACK:-penciled-in}"
REGION="${AWS_REGION:-us-east-1}"

output() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

# Renders the page; puzzle packs are generated only if they don't exist yet.
echo "Building site..."
go tool templ generate
go run ./cmd/generate

BUCKET=$(output SiteBucket)
DISTRIBUTION_ID=$(output DistributionId)

# no-cache means "revalidate before use": cheap 304s, and a deploy shows up immediately.
echo "Syncing public/ to s3://$BUCKET ..."
aws s3 sync public/ "s3://$BUCKET/" --delete --cache-control "no-cache" --region "$REGION"

echo "Invalidating CloudFront cache ($DISTRIBUTION_ID)..."
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" >/dev/null

echo "Deploy complete: $(output SiteURL)"
