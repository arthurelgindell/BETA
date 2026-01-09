# Security Rules

## CRITICAL - Never Commit
- API keys, tokens, secrets
- .env files with real values
- Private keys or certificates
- Database credentials
- OAuth client secrets
- JWT signing keys

## Input Validation
- Sanitize all user input
- Use parameterized queries for SQL (never string concatenation)
- Validate file paths to prevent traversal attacks
- Escape HTML output to prevent XSS
- Validate and sanitize URL parameters
- Use allowlists over denylists

## Authentication & Authorization
- Never store passwords in plain text
- Use bcrypt/argon2 for password hashing
- Implement proper session management
- Use HTTPS everywhere
- Implement rate limiting
- Use secure cookie flags (HttpOnly, Secure, SameSite)

## Dependencies
- Review new dependencies before adding
- Check for known vulnerabilities (npm audit)
- Prefer well-maintained packages
- Pin dependency versions in production
- Regular dependency updates

## API Security
- Validate all request bodies
- Implement proper CORS configuration
- Use API rate limiting
- Log security-relevant events
- Implement proper error handling (no stack traces in production)

## Data Protection
- Encrypt sensitive data at rest
- Use TLS for data in transit
- Implement proper access controls
- Follow principle of least privilege
- Regular security audits
