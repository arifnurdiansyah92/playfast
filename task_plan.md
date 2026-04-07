# Task Plan: Steam Desktop Authenticator Web UI

## Goal
Create a web UI to manage Steam accounts — store credentials, view/generate guard codes, and login with one click.

## Phases
- [x] Phase 1: Check dependencies (Flask available)
- [x] Phase 2: Build Flask backend with API endpoints
- [x] Phase 3: Build frontend UI (HTML/CSS/JS)
- [x] Phase 4: Test and verify

## Key Decisions
- Using Flask for lightweight web server
- Single-page app with modern CSS
- Passwords stored locally in accounts.json (base64 obfuscated — not encrypted, same security level as .mafile secrets already in plaintext)
- Auto-discovers .mafile files on startup

## Status
**Currently in Phase 1** - Checking dependencies
