# Wordbook

Self-hosted PWA dictionary (EN↔RU) with offline support, built for daily language learning.

## Features

- **PWA** — installable on phone/desktop, works offline
- **IndexedDB** — offline word storage and sync queue
- **LibreTranslate** — self-hosted translation (Argos models)
- **PostgreSQL** — word storage with trigram search (`pg_trgm`)
- **Cloudflare Tunnel** — public HTTPS access without port forwarding
- **TLS** — Let's Encrypt via certbot + DuckDNS
- **Telegram alerts** — health-check notifications
- **API Key auth** — simple header-based authentication

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS, PWA (Service Worker + Manifest), IndexedDB |
| Backend | Node.js, Express, PostgreSQL |
| Translation | LibreTranslate (self-hosted) |
| Reverse Proxy | Nginx |
| TLS | Certbot + DuckDNS (DNS-01) |
| Tunnel | Cloudflare Tunnel (cloudflared) |
| Database | PostgreSQL 16 with `pg_trgm` extension |

## Quick Start

```bash
# 1. Clone
git clone https://github.com/khalikov-ibragim/wordbook.git
cd wordbook

# 2. Configure
cp .env.example .env
# Edit .env with your values

# 3. Run
docker compose up -d

# 4. Access
# Local: http://localhost
# Public: https://your-domain.duckdns.org (after TLS setup)
```

## Environment Variables

See `.env.example` for all required variables. Key ones:

| Variable | Description |
|----------|-------------|
| `POSTGRES_DB` | Database name |
| `POSTGRES_USER` | Database user |
| `POSTGRES_PASSWORD` | Database password |
| `API_KEY` | API authentication key (generate with `openssl rand -hex 24`) |
| `DUCKDNS_TOKEN` | DuckDNS token for dynamic DNS |

## Documentation

- `docs/INFRA.md` — infrastructure architecture, port table, security rationale
- `docs/LOGIC.md` — application logic and data flow
- `docs/SERVER_SETUP.md` — step-by-step server deployment guide

## License

Data from [OpenRussian.org](https://openrussian.org/) — CC BY-SA 4.0 (attribution required).
