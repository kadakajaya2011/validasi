#!/usr/bin/env bash
set -euo pipefail

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI belum terpasang. Silakan pasang Supabase CLI terlebih dahulu."
  exit 1
fi

if [ "${1:-}" = "" ]; then
  echo "Pemakaian: ./deploy-supabase.sh PROJECT_REF"
  exit 1
fi

PROJECT_REF="$1"
supabase link --project-ref "$PROJECT_REF"
supabase db push
supabase functions deploy create-operator --no-verify-jwt

echo "Deployment Supabase selesai."
