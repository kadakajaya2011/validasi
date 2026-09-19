param(
  [Parameter(Mandatory=$true)]
  [string]$ProjectRef
)

$ErrorActionPreference = "Stop"

supabase link --project-ref $ProjectRef
supabase db push
supabase functions deploy create-operator --no-verify-jwt

Write-Host "Deployment Supabase selesai."
