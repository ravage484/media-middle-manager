# Security policy

Media Middle Manager manages your media stack: it stores API keys for your media services and can change them, including deleting files and removing requests and torrents, so security reports are taken seriously. The project is in early testing and is not yet recommended for production use.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's private reporting instead:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability**.

Include what you found, how to reproduce it, and the version (shown in `package.json`, or the release tag). You can expect an acknowledgement within a few days. If private reporting is not available, open an issue that says only that you have a security report, with no details, and a way to contact you will be arranged.

## Supported versions

Only the latest release receives fixes.

## What the app protects, and what it does not

See the [Security section of the README](README.md#security) for the full list. In short:

- Every API call needs a signed-in session; passwords are hashed with scrypt, sessions are `HttpOnly` and `SameSite=Strict`, and failed logins are throttled and logged.
- API keys are encrypted at rest (AES-256-GCM). The server must decrypt them to use them, so this protects the database file and backups, not a compromised running server.
- The app speaks plain HTTP. If anything outside your LAN can reach it, put it behind a reverse proxy that terminates HTTPS.
- Until the first account is created, whoever reaches the page first can create it. Set `MMM_ADMIN_USER` and `MMM_ADMIN_PASSWORD` to avoid that window.

## Out of scope

- Attacks that need access to the server's files or an already signed-in session.
- Findings in development-only tooling (the Vite dev server) that does not run in production.
