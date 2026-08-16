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
- `POST /api/authorizations` — inspects an A2A 1.0 Agent Card and returns an exact, ten-minute HTTPS domain-control proof plus a private browser token.
- `POST /api/authorizations/{id}/verify` with `x-agenttrial-verification-token` — verifies the published proof, unchanged card, interface, skill, and sealed budget.
- `POST /api/runs` with `{"mode":"active","authorizationId":"…","activeConsent":true}` and the same private token — atomically consumes the authorization and runs exactly two bounded `SendMessage` calls.
- `GET /api/runs/{id}` — state, events, and the report when complete.
- `GET /api/runs/{id}/events` — Server-Sent Events (`data: <event-json>`).
- `DELETE /api/runs/{id}` — requires the one-time `x-agenttrial-cancel-token` capability returned at creation.
- `GET /api/runs/{id}/bundle` — downloadable evidence JSON; returns `409` until ready.
- `GET /api/health` and `/api/ready` — liveness and dependency/fallback status.

With `DATABASE_URL`, runs are persisted and claimed by the durable worker queue. Without it, the credential-free development mode runs in one process.

Active external v1 deliberately supports only anonymous A2A HTTP+JSON 1.0 text skills on the same HTTPS origin. It sends no credentials, cookies, redirects, files, callbacks, extensions, or destructive methods. Domain control authorizes the exact evaluation scope; it is not a legal ownership certificate.
