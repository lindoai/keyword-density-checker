# Keyword Density Checker

Analyze top repeated words and phrases from a page's visible content.

## API

```
GET /api/analyze?url=https://example.com
```

Returns JSON with word count, top single words with density percentages, and top 2-3 word phrases.

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lindoai/keyword-density-checker)

## Environment

- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
