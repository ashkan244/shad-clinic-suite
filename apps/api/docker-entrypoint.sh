#!/bin/sh
# Applies Prisma migrations, then starts the API.
# Databases created earlier with `prisma db push` (or restored from such a dump)
# have tables but no migration history; Prisma refuses those with P3005. In that
# case the baseline migration is marked as already applied and the rest run normally.
set -e
SCHEMA=apps/api/prisma/schema.prisma
BASELINE=20260930000000_init

if ! out=$(npx prisma migrate deploy --schema="$SCHEMA" 2>&1); then
  echo "$out"
  if echo "$out" | grep -q P3005; then
    echo "Existing schema without migration history: baselining $BASELINE"
    npx prisma migrate resolve --schema="$SCHEMA" --applied "$BASELINE"
    npx prisma migrate deploy --schema="$SCHEMA"
  else
    exit 1
  fi
else
  echo "$out"
fi

exec node apps/api/dist/main.js
