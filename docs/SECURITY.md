# Security notes (Phase 6.4)

## Controls in place

- Helmet security headers
- CORS allowlist (env `CORS_ORIGINS`)
- Global + auth-route rate limits
- JWT access tokens (15m) + rotating refresh cookies with reuse detection
- Account lockout after 3 failed logins
- bcrypt password hashing (cost 12)
- Zod validation on request bodies
- Payload size caps (1 MB JSON)
- HPP + mongo sanitize on body/params
- Soft deletes only for user-created records
- Contact phone projection gated + activity-logged

## Threat notes

| Threat | Mitigation |
| --- | --- |
| Credential stuffing | Auth rate limit + lockout |
| Refresh token theft | Rotation + family revoke |
| NoSQL injection | Zod + sanitize |
| Oversized upload | Multer limits + sharp/MIME gates |
| XSS via stored content | Clients must escape; API stores plain text |
| Admin privilege escalation | Permission checks on every `/admin` route; super cannot be stripped |

## Remaining ops work

- Enable bot checks (CAPTCHA) on login/contact reveal in production if abuse appears
- Virus scan for uploads (ClamAV) if hosting untrusted binaries beyond CV PDFs
- Rotate JWT secrets via deployment secrets manager
