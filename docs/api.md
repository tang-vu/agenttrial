# API

The canonical OpenAPI 3.1 document is served at `/openapi.json`.

## Controlled flow

```bash
RUN=$(curl -s -X POST http://localhost:3000/api/runs \
  -H 'content-type: application/json' \
  -d '{"fixture":"evidence-researcher","activeConsent":true}')
```

- `POST /api/runs` — creates a fresh controlled run. Active consent must be literal `true`.
- `POST /api/runs` with `{"targetUrl":"https://…","mode":"passive"}` — bounded public discovery.
- `GET /api/runs/{id}` — state, events, and the report when complete.
- `GET /api/runs/{id}/events` — Server-Sent Events (`data: <event-json>`).
- `DELETE /api/runs/{id}` — requires the one-time `x-agenttrial-cancel-token` capability returned at creation.
- `GET /api/runs/{id}/bundle` — downloadable evidence JSON; returns `409` until ready.
- `GET /api/health` and `/api/ready` — liveness and dependency/fallback status.

With `DATABASE_URL`, runs are persisted and claimed by the durable worker queue. Without it, the credential-free development mode runs in one process.
