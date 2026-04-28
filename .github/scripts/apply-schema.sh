#!/bin/bash
# Expects env vars: PLM_DB_HOST, PLM_DB_PORT, PLM_DB_NAME, PLM_DB_USER, PLM_DB_PASS

set +e

echo "════════════════════════════════════════════════"
echo "APPLY DB SCHEMA"
echo "════════════════════════════════════════════════"

if ! command -v psql > /dev/null 2>&1; then
  echo "Installing postgresql-client..."
  sudo apt-get update -qq
  sudo apt-get install -y postgresql-client > /dev/null 2>&1
fi

cd /home/ubuntu/source/PLhamasa

if [ ! -f backend/docs/schema.sql ]; then
  echo "⚠ schema.sql not found, skipping"
  exit 0
fi

echo "Applying schema to ${PLM_DB_USER}@${PLM_DB_HOST}:${PLM_DB_PORT}/${PLM_DB_NAME}..."

SCHEMA_OUTPUT=$(PGPASSWORD="$PLM_DB_PASS" psql \
  -h "$PLM_DB_HOST" \
  -p "$PLM_DB_PORT" \
  -U "$PLM_DB_USER" \
  -d "$PLM_DB_NAME" \
  -v ON_ERROR_STOP=0 \
  -f backend/docs/schema.sql 2>&1)

echo "$SCHEMA_OUTPUT" | tail -50 | sed 's/^/  /'

if echo "$SCHEMA_OUTPUT" | grep -q "FATAL:.*authentication failed"; then
  echo ""
  echo "❌ AUTH FAILED — cek GitHub Secret PLM_DB_PASS"
  exit 1
fi

if echo "$SCHEMA_OUTPUT" | grep -q "could not connect"; then
  echo ""
  echo "❌ CANNOT CONNECT — cek PLM_DB_HOST/PLM_DB_PORT"
  exit 1
fi

FATAL=$(echo "$SCHEMA_OUTPUT" | grep -c "^psql:.*ERROR:" || true)
if [ "$FATAL" -gt 0 ]; then
  echo ""
  echo "⚠ Ada $FATAL ERROR di SQL (non-fatal)"
fi

echo ""
echo "Restart backend..."
pm2 restart PLhamasa-backend --update-env > /dev/null
sleep 2

echo ""
echo "Sanity check tabel users:"
PGPASSWORD="$PLM_DB_PASS" psql \
  -h "$PLM_DB_HOST" -p "$PLM_DB_PORT" \
  -U "$PLM_DB_USER" -d "$PLM_DB_NAME" \
  -c "SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position;" \
  2>&1 | sed 's/^/  /'

echo ""
echo "Sanity check users:"
PGPASSWORD="$PLM_DB_PASS" psql \
  -h "$PLM_DB_HOST" -p "$PLM_DB_PORT" \
  -U "$PLM_DB_USER" -d "$PLM_DB_NAME" \
  -c "SELECT id, username, role FROM users WHERE deleted_at IS NULL;" \
  2>&1 | sed 's/^/  /'

echo ""
echo "✓ Schema apply done"
