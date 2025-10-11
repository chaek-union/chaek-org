# 책 (Chaek)

오픈소스 대학 교재 플랫폼

## Setup

```bash
# 1. Copy environment variables
cp .env.example .env

# 2. Edit .env with your GitHub OAuth credentials

# 3. Start with Docker Compose (includes PostgreSQL)
docker compose up -d
```

## Development

### Local Development
```bash
npm install
npm run dev
```

### Docker Development (with hot reload)
```bash
docker compose -f compose.dev.yml up
```

Source code changes will be reflected in real-time.

## GitHub OAuth Setup

1. Create GitHub OAuth App at https://github.com/settings/developers
2. Set callback URL: `http://localhost:5173/auth/callback/github`
3. Add credentials to `.env`

## Webhook

Set webhook URL in your `chaek-union` repositories:
- URL: `https://your-domain.com/api/webhook`
- Event: Push

## License

MIT
