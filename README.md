[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE.md)

# grocery-orchestrator

Process-centric service of the Grocery List Manager. The frontend talks only to it; it
validates the user's token through `grocery-sso-service` and composes the other services
(backend, categorizer, Telegram adapter) to complete a request. It is stateless and never
touches the database.

## Status

Done: authentication and the list flow. Not implemented yet: categorize and Telegram share.

## Endpoints

All under `/api/v1` need a bearer token. Bodies are validated by the backend, whose
`400`, `404` and `409` answers are passed through unchanged (a list of another user is `404`).

| Method | Path | Composes |
|---|---|---|
| GET | `/health` | none (no token) |
| GET | `/api/v1/me` | SSO: the identity of the token |
| GET | `/api/v1/lists?limit=&offset=` | backend |
| POST | `/api/v1/lists` | backend, body `{ "list_name": "..." }` |
| GET | `/api/v1/lists/{listId}` | backend: the list and **all** its items, read in parallel |
| PATCH / DELETE | `/api/v1/lists/{listId}` | backend |
| POST | `/api/v1/lists/{listId}/items` | backend, body `{ "item_name", "category"?, "quantity"? }` |
| PATCH / DELETE | `/api/v1/lists/{listId}/items/{itemId}` | backend |

Ids must be positive integers, otherwise `400` before calling the backend. Downstream
failures: service unreachable or timed out `503`; unexpected answer, or the backend refusing a
token the SSO accepted (usually a wrong `AUTHENTIK_ISSUER` in the backend), `502`.

The backend API is used only in `src/clients/backendClient.js` (today `db-backend`); when the
real Grocery Backend is ready, that file is the one to adapt.

## Authentication

Every `/api/v1` route needs `Authorization: Bearer <JWT>`. The token is checked with
`GET /auth/verify` of `grocery-sso-service`; the `sub` claim becomes `req.user.id` and the
token is forwarded unchanged to downstream services.

Known limit: `/auth/verify` accepts only Authentik (RS256) tokens, so the HS256 tokens issued
by the local login of `db-backend` are rejected here.

Known issue to verify with the real stack: `list_items.category` references `categories(name)`
and that table is not seeded yet, so saving a category from the categorizer fails until the
eight departments (`GET /departments` of the categorizer) are added to the database.

## Configuration

Copy `.env.example` to `.env`.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8004` | Listening port |
| `SSO_URL` | `http://localhost:8002` | `grocery-sso-service` |
| `BACKEND_URL` | `http://localhost:8080` | Backend (`db-backend` for now) |
| `CATEGORIZER_URL` | `http://localhost:8003` | `grocery-categorizer` |
| `REQUEST_TIMEOUT_MS` | `5000` | Timeout of each downstream call |

## Development

```
make init        # enable the commit message hook
npm install
npm start        # http://localhost:8004
npm test         # node --test, downstream services are faked
```

Run one test: `node --test --test-name-pattern="<name>" test/auth.test.js`.

## Authors
- Palmieri Filippo @FilizZPalm
- Radice Lorenzo @radix54

## License
Copyright (C) 2026  Palmieri Filippo, Radice Lorenzo

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
