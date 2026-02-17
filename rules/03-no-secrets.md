# No Secrets

You MUST NOT expose secrets in logs, responses, or artifacts.

## Hard Rules

- MUST NOT log API keys, tokens, or credentials
- MUST NOT include secrets in error messages or stack traces
- MUST NOT embed secrets in URLs that may be logged
- MUST NOT return secrets in API responses (even in error details)
- MUST NOT store secrets in client-accessible locations
- MUST use environment variables for all sensitive configuration

## Enforcement Checklist

- [ ] No API keys in console.log or console.error output
- [ ] Error responses sanitized before returning to client
- [ ] URLs with query params do not contain secrets
- [ ] Response metadata contains no credential fragments
- [ ] All secrets loaded from process.env, never hardcoded
