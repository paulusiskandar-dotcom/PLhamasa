#!/bin/bash
set -e

echo "════════════════════════════════════════════════"
echo "DEPLOY CODE"
echo "════════════════════════════════════════════════"

cd /home/ubuntu/source/PLhamasa

echo ""
echo "[1/4] Git pull..."
echo "────────────────────────────────────────────────"
git fetch origin main
BEFORE_SHA=$(git rev-parse HEAD)
git reset --hard origin/main
AFTER_SHA=$(git rev-parse HEAD)
echo "  Before: $BEFORE_SHA"
echo "  After:  $AFTER_SHA"
if [ "$BEFORE_SHA" != "$AFTER_SHA" ]; then
  echo "  Changed files:"
  git diff --name-only $BEFORE_SHA $AFTER_SHA | sed 's/^/    /'
fi

echo ""
echo "[2/4] Backend deps..."
echo "────────────────────────────────────────────────"
cd backend
npm install --production 2>&1 | tail -5

echo ""
echo "[3/4] Frontend deps..."
echo "────────────────────────────────────────────────"
cd ../frontend
npm install --production 2>&1 | tail -5

echo ""
echo "[4/4] Restart PM2..."
echo "────────────────────────────────────────────────"
pm2 restart PLhamasa-backend --update-env
pm2 restart PLhamasa-frontend --update-env
sleep 3
pm2 list | grep PLhamasa | sed 's/^/  /'
