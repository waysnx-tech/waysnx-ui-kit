#!/bin/bash

# WaysNX UI Kit CI Security Check
#
# Scans for credible hardcoded credentials and private files in tracked repository content.
# Failures are blocking. Designed to detect actual credential values, not merely variable names.
#
# Checks:
# - Private credential files (.env, .env.local, .env.*.local, .npmrc) tracked in git
# - Hardcoded bearer tokens (Authorization: Bearer <token>)
# - Hardcoded API keys and secret key assignments with actual values
#
# Exclusions (to avoid false positives):
# - node_modules, .git, lock files
# - Documentation/example strings
# - Comments that merely mention credential concepts
# - Known test fixtures (documented below)

set -e

EXIT_CODE=0

# Known test fixtures that are intentional and safe
# These are test vectors, demo secrets, or example passwords used in documentation/tests
# They are NOT repository credentials
declare -a KNOWN_TEST_FIXTURES=(
  "packages/ui-security/scripts/totp.regression.mjs:RFC_SECRET"  # RFC 6238 test vector
  "storybook/stories/security/AuthenticatorQRCode.stories.tsx:secret"  # Demo TOTP secret
  "storybook/stories/security/PasswordRequirements.stories.tsx:password"  # Example passwords
)

echo "=== Security Checks ==="
echo ""

# 1. Check for .npmrc files with actual credentials (not just presence)
echo "Scanning for .npmrc files with credentials..."
NPMRC_WITH_CREDS=false

# Check if any tracked .npmrc contains credential patterns: _auth, _authToken, NPM_TOKEN, etc.
if git ls-files --cached 2>/dev/null | grep -E '\.npmrc$'; then
  # Found .npmrc file(s), now check content for credentials
  while IFS= read -r npmrc_file; do
    if git show ":$npmrc_file" 2>/dev/null | grep -iE '(_auth|_authToken|NPM_TOKEN|npm_token)' > /dev/null; then
      echo "✗ BLOCKED: .npmrc file contains credentials: $npmrc_file"
      NPMRC_WITH_CREDS=true
      EXIT_CODE=1
    fi
  done < <(git ls-files --cached 2>/dev/null | grep -E '\.npmrc$')
  
  if [ "$NPMRC_WITH_CREDS" = false ]; then
    echo "✓ .npmrc files found but contain no credentials"
  fi
else
  echo "✓ No .npmrc files tracked"
fi

# Check for .env, .env.local, .env.*.local files (always block, they should never be tracked)
echo ""
echo "Scanning for .env files (development configuration)..."
ENV_FILES_FOUND=false

if git ls-files --cached 2>/dev/null | grep -E '(^|/)\.env($|\.local$|\..*\.local$)' | grep -v node_modules; then
  echo "✗ BLOCKED: Development .env files found in git index (.env, .env.local, .env.*.local)"
  ENV_FILES_FOUND=true
  EXIT_CODE=1
else
  echo "✓ No .env files tracked"
fi

# 2. Check for hardcoded bearer tokens with actual token-shaped values
echo ""
echo "Scanning for hardcoded bearer tokens..."
BEARER_FOUND=false

if git grep -iE "authorization\s*[:=]\s*['\"]?Bearer\s+[A-Za-z0-9_\-\.]{20,}" -- ':!node_modules' ':!.git' ':!*.lock' ':!*.md' 2>/dev/null; then
  echo "✗ BLOCKED: Potential bearer token found"
  BEARER_FOUND=true
  EXIT_CODE=1
else
  echo "✓ No hardcoded bearer tokens found"
fi

# 3. Check for hardcoded API keys and secrets with actual values
# BUT: exclude known test fixtures that are intentional and documented
echo ""
echo "Scanning for hardcoded API keys and secrets..."
SECRET_FOUND=false

# Look for patterns like: api_key = "actual_value", not just variable names in comments/docs
# This pattern looks for assignment operators with quoted/unquoted values that look like keys
SECRET_MATCHES=$(git grep -iE "(api_key|apikey|secret_key|secret|password)\s*[:=]\s*['\"][A-Za-z0-9_\-]{10,}['\"]" -- ':!node_modules' ':!.git' ':!*.lock' ':!*.md' 2>/dev/null | grep -v "// " | grep -v "# " | grep -v "example" | grep -v "EXAMPLE" || true)

if [ -n "$SECRET_MATCHES" ]; then
  # Found potential secrets. Check if they're in known test fixtures
  FILTERED_MATCHES="$SECRET_MATCHES"
  
  # Remove known fixtures from the matches
  if echo "$SECRET_MATCHES" | grep -q "packages/ui-security/scripts/totp.regression.mjs"; then
    # RFC 6238 test vector - intentional, safe
    FILTERED_MATCHES=$(echo "$FILTERED_MATCHES" | grep -v "packages/ui-security/scripts/totp.regression.mjs" || true)
  fi
  
  if echo "$SECRET_MATCHES" | grep -q "storybook/stories/security/AuthenticatorQRCode.stories.tsx"; then
    # Demo TOTP secret - intentional, safe
    FILTERED_MATCHES=$(echo "$FILTERED_MATCHES" | grep -v "storybook/stories/security/AuthenticatorQRCode.stories.tsx" || true)
  fi
  
  if echo "$SECRET_MATCHES" | grep -q "storybook/stories/security/PasswordRequirements.stories.tsx"; then
    # Example passwords in documentation - intentional, safe
    FILTERED_MATCHES=$(echo "$FILTERED_MATCHES" | grep -v "storybook/stories/security/PasswordRequirements.stories.tsx" || true)
  fi
  
  # If anything remains after filtering, it's a real issue
  if [ -n "$FILTERED_MATCHES" ]; then
    echo "✗ BLOCKED: Potential hardcoded secret found"
    echo "$FILTERED_MATCHES"
    SECRET_FOUND=true
    EXIT_CODE=1
  else
    echo "✓ No hardcoded secrets found (known test fixtures excluded)"
  fi
else
  echo "✓ No hardcoded API keys or secrets found"
fi

echo ""
echo "=== Security Check Complete ==="

if [ $EXIT_CODE -ne 0 ]; then
  echo "✗ Security check failed. Commit blocked."
  exit 1
fi

echo "✓ All security checks passed"
exit 0
