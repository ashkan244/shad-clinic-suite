#!/usr/bin/env bash
set -euo pipefail

echo "== Installing Docker (skips if already installed) =="
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

cd "$(dirname "$0")"

echo "== Writing .env =="
if [ ! -f .env ]; then
  JWT_SECRET="$(openssl rand -hex 32)"
  cat > .env <<ENVEOF
DATABASE_URL=postgresql://shad:shadpass2026@postgres:5432/shad_clinic?schema=public
JWT_SECRET=${JWT_SECRET}
SMS_PROVIDER=mock
SMS_API_KEY=
SMS_SENDER=
PAYMENT_PROVIDER=mock
ZARINPAL_MERCHANT_ID=
PAYMENT_CALLBACK_URL=http://176.97.218.34/payment/callback
ENVEOF
  echo "wrote .env"
else
  echo ".env already exists, skipping"
fi

echo "== Building and starting containers =="
docker compose -f docker-compose.prod.yml up -d --build

echo "== Waiting for API to be ready =="
sleep 10

echo "== Applying database schema =="
docker compose -f docker-compose.prod.yml exec -T api npx prisma db push

echo "== Seeding demo data =="
docker compose -f docker-compose.prod.yml exec -T api npm run seed || echo "seed skipped/failed (ok if already seeded)"

echo "== DONE =="
docker compose -f docker-compose.prod.yml ps
