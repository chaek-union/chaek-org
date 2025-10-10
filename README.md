# 책 (Chaek)

오픈소스 대학 교재 플랫폼

## Setup

```bash
npm install
npm run dev
```

## Production

```bash
docker compose up -d
```

## Webhook

GitHub webhook을 설정하여 `chaek-union` 조직의 HonKit 저장소를 자동으로 빌드합니다.

**Webhook URL**: `https://your-domain.com/api/webhook`
