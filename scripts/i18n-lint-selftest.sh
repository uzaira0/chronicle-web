#!/usr/bin/env bash
# Proves the ast-grep i18n rules fire exactly where lint/i18n/cases says they must.
set -euo pipefail
cd "$(dirname "$0")/.."
exec python3 scripts/i18n-lint-cases.py lint/i18n/cases
