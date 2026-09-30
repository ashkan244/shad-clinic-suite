#!/usr/bin/env bash
# One-shot deploy for a plain VPS with Docker Compose (see docs/DEPLOY-LIARA.md for Liara).
# Usage: PUBLIC_URL=https://clinic.example.com ./deploy.sh
set -euo pipefail

echo "== Installing Docker (skips if already installed) =="
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

cd "$(dirname "$0")"

FIRST_DEPLOY=0
echo "== Writing .env =="
if [ ! -f .env ]; then
  FIRST_DEPLOY=1
  PUBLIC_URL="${PUBLIC_URL:-http://localhost}"
  SEED_PASSWORD="$(openssl rand -base64 12 | tr -d '/+=')"
  umask 077
  cat > .env <<ENVEOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
SEED_PASSWORD=${SEED_PASSWORD}
SMS_PROVIDER=mock
SMS_API_KEY=
SMS_SENDER=
PAYMENT_PROVIDER=mock
ZARINPAL_MERCHANT_ID=
ASSISTANT_PROVIDER=mock
PAYMENT_CALLBACK_URL=${PUBLIC_URL}/payment/callback
ENVEOF
  echo "wrote .env (keep it private; it is git-ignored)"
else
  echo ".env already exists, keeping it"
  # Servers set up before secrets moved to .env: their Postgres volume was
  # initialised with the old hardcoded password "shad", so reuse it.
  if ! grep -q '^POSTGRES_PASSWORD=' .env; then
    echo "POSTGRES_PASSWORD=shad" >> .env
    echo "added POSTGRES_PASSWORD=shad (legacy volume password) to .env"
  fi
  if ! grep -qE '^JWT_SECRET=.{32,}' .env; then
    sed -i '/^JWT_SECRET=/d' .env
    echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
    echo "generated a new JWT_SECRET (everyone must log in again)"
  fi
fi

echo "== Building and starting containers =="
# The API container applies Prisma migrations itself on start.
docker compose -f docker-compose.prod.yml up -d --build

if [ "$FIRST_DEPLOY" = 1 ]; then
  echo "== Waiting for API, then seeding demo data (first deploy only) =="
  sleep 15
  docker compose -f docker-compose.prod.yml exec -T api npm run seed
  echo "Seeded accounts use the SEED_PASSWORD in .env — change them after first login."
fi

echo "== DONE =="
docker compose -f docker-compose.prod.yml ps
