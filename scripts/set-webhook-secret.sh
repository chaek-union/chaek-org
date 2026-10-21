#!/usr/bin/env bash
# Write GITHUB_WEBHOOK_SECRET from .env into every chaek-union repo webhook
# that points at chaek.org. Repos without such a webhook are left untouched.
# Usage: scripts/set-webhook-secret.sh [repo ...]   (default: all org repos)
set -euo pipefail

ORG=chaek-union
HOOK_URL=https://chaek.org/api/webhook
cd "$(dirname "$0")/.."

SECRET=$(grep '^GITHUB_WEBHOOK_SECRET=' .env | cut -d= -f2- | tr -d "\"'")
if [ ${#SECRET} -lt 32 ]; then
	echo "GITHUB_WEBHOOK_SECRET missing or too short in .env" >&2
	exit 1
fi

repos=("$@")
if [ ${#repos[@]} -eq 0 ]; then
	mapfile -t repos < <(gh repo list "$ORG" --limit 500 --json name -q '.[].name')
fi

for r in "${repos[@]}"; do
	ids=$(gh api "repos/$ORG/$r/hooks" -q ".[] | select(.config.url==\"$HOOK_URL\") | .id" 2>/dev/null || true)
	for id in $ids; do
		ct=$(gh api "repos/$ORG/$r/hooks/$id/config" -q .content_type)
		gh api -X PATCH "repos/$ORG/$r/hooks/$id/config" \
			-f url="$HOOK_URL" -f content_type="$ct" -f secret="$SECRET" >/dev/null
		echo "$r: updated hook $id"
	done
done
