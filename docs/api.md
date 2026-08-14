# API

The canonical OpenAPI 3.1 document is served at `/openapi.json`.

## Controlled flow

```bash
RUN=$(curl -s -X POST http://localhost:3000/api/runs \
  -H 'content-type: application/json' \
  -d '{"fixture":"evidence-researcher","activeConsent":true}')
```

- `POST /api/runs` — creates a fresh controlled run. Active consent must be literal `true`.
- `GET /api/runs/{id}` — state, events, and the report when complete.
- `GET /api/runs/{id}/events` — Server-Sent Events (`data: <event-json>`).
- `DELETE /api/runs/{id}` — requests cancellation of a non-terminal run.
- `GET /api/runs/{id}/bundle` — downloadable evidence JSON; returns `409` until ready.
- `GET /api/health` and `/api/ready` — liveness and dependency/fallback status.

The run store is process-local, so all endpoints for a run must reach the same instance. Do not enable load-balanced multi-instance routing without the durable adapter described in the architecture.
