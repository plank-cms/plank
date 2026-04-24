# Plank CMS

A self-hosted headless CMS you can deploy in minutes. Built on Node.js and PostgreSQL — runs entirely on your infrastructure.

## Quick start

```bash
npx @am25/plank-cms init .
npm start
```

The admin panel will be available at `http://localhost:5500/admin`.

## What it is

Plank is a headless CMS that runs as a standalone Express server and exposes a REST API for consuming content from any frontend. Content types and fields are defined visually from the admin panel — no code changes, no restarts.

The API is token-authenticated. Tokens are managed from the admin panel and can be scoped to read-only or full access.

## Architecture

- **Server** — Express 5, REST API, JWT auth, role-based access control
- **Database** — PostgreSQL via `pg` (no ORM). Each content type maps to a real table; schema changes run as live `ALTER TABLE` statements
- **Admin panel** — React + Vite, served as static files by the same Express process in production
- **Media** — provider pattern with support for local storage, AWS S3, and Cloudflare R2

## Requirements

- Node.js 20+
- PostgreSQL 18

## License

[MIT](LICENSE) — AM25, S.A.S. DE C.V.
