#!/usr/bin/env bash
# Secret scanning with a pinned Gitleaks image.
#
#   secret-scan.sh selftest  – prove the scanner flags a known artificial leak
#   secret-scan.sh repo      – scan the full git history of the repository
#
# Gitleaks is pinned to 8.30.0 on purpose; do not move to 8.30.1 before the
# known regression in that release is verified as fixed.
set -euo pipefail

readonly GITLEAKS_IMAGE="ghcr.io/gitleaks/gitleaks:v8.30.0@sha256:691af3c7c5a48b16f187ce3446d5f194838f91238f27270ed36eef6359a574d9"
readonly LEAK_EXIT_CODE=42

# The canary is derived at runtime from a fixed, clearly labelled seed, so no
# token-shaped value is ever committed. It is deterministic (same value on every
# run) and high-entropy (hex), which keeps it clear of Gitleaks' global
# stopword allowlist that silently drops values such as "abcdefghijklmnopqrstuvwxyz".
readonly CANARY_SEED="lanbort-gitleaks-selftest-v1"
readonly CANARY_PREFIX="ghp_"
readonly CANARY_RULE="github-pat"

gitleaks() {
  docker run --rm "$@"
}

selftest() {
  local workdir report status rules
  workdir="$(mktemp -d)"
  trap 'rm -rf "$workdir"' RETURN

  local body
  body="$(printf '%s' "$CANARY_SEED" | sha256sum | cut -c1-36)"
  printf 'token = "%s%s"\n' "$CANARY_PREFIX" "$body" > "$workdir/canary.txt"

  set +e
  report="$(gitleaks -v "$workdir:/scan:ro" "$GITLEAKS_IMAGE" detect \
    --no-git --source /scan/canary.txt --no-banner --redact \
    --report-format json --report-path - --exit-code "$LEAK_EXIT_CODE")"
  status=$?
  set -e

  if [[ "$status" -ne "$LEAK_EXIT_CODE" ]]; then
    echo "::error::Gitleaks self-test failed: expected exit code $LEAK_EXIT_CODE (leak found), got $status." >&2
    exit 1
  fi

  rules="$(jq -r '[.[].RuleID] | unique | join(",")' <<< "$report")"
  if ! jq -e --arg rule "$CANARY_RULE" 'any(.[]; .RuleID == $rule)' <<< "$report" > /dev/null; then
    echo "::error::Gitleaks self-test failed: canary was not classified as $CANARY_RULE (got: ${rules:-none})." >&2
    exit 1
  fi

  echo "Gitleaks self-test passed: canary detected by rule $CANARY_RULE."
}

scan_repo() {
  gitleaks -v "$PWD:/repo:ro" "$GITLEAKS_IMAGE" detect \
    --source /repo --no-banner --redact --exit-code 1
}

case "${1:-}" in
  selftest) selftest ;;
  repo) scan_repo ;;
  *)
    echo "usage: $0 {selftest|repo}" >&2
    exit 2
    ;;
esac
