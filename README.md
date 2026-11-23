[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE.md)

# grocery-orchestrator

Process-centric service of the Grocery List Manager. The frontend talks only to it; it
validates the user's token through `grocery-sso-service` and composes the other services
(backend, categorizer, Telegram adapter) to complete a request. It is stateless and never
touches the database.

## Status

Done: authentication, lists, categorize and Telegram share. The orchestrator composes the SSO
service, the backend, the categorizer and the Telegram adapter.

## Endpoints

All under `/api/v1` need a bearer token. Bodies are validated by the backend, whose
`400`, `404` and `409` answers are passed through unchanged (a list of another user is `404`).

| Method | Path | Composes |
|---|---|---|
| GET | `/health` | none (no token) |
| GET | `/api/v1/me` | SSO identity of the token, plus `telegram_chat_id` from the backend |
| PUT | `/api/v1/me/telegram` | backend: saves `{ "chat_id": "123456789" }` (the id the bot sent) |
| DELETE | `/api/v1/me/telegram` | backend: unlinks Telegram |
| GET | `/api/v1/lists?limit=&offset=` | backend |
| POST | `/api/v1/lists` | backend, body `{ "list_name": "..." }` |
| GET | `/api/v1/lists/{listId}` | backend: the list and **all** its items, read in parallel |
| PATCH / DELETE | `/api/v1/lists/{listId}` | backend |
| POST | `/api/v1/lists/{listId}/items` | backend, body `{ "item_name", "category"?, "quantity"? }` |
| PATCH / DELETE | `/api/v1/lists/{listId}/items/{itemId}` | backend |
| POST | `/api/v1/lists/{listId}/categorize` | backend, categorizer, backend (see below) |
| GET | `/api/v1/departments` | categorizer: the 8 departments for the manual dropdown |
| POST | `/api/v1/lists/{listId}/share/telegram` | backend, categorizer, Telegram adapter (see below) |

### Categorize

The Categorize button. The orchestrator reads all the items of the list, sends **only those
with no category** to the categorizer `/categorize` (batches of 200, answers matched by
position), then saves each answer with a `PATCH` on the item (5 in parallel). Items that
already have a category, guessed before or set by the user, are never touched, so pressing the
button again only handles the items added since.

```json
{ "data": {
    "items": [ ...all the items of the list, updated... ],
    "summary": { "categorized": 2, "skipped": 1, "failed": [
        { "item_id": 1, "item_name": "milk", "category": "Dairy", "error": "..." } ] } } }
```

If the categorizer fails nothing is written (`503`/`502`). The backend has no multi-item
transaction, so a failed save does not undo the others: it is listed in `failed` and the
answer is still `200`; pressing the button again retries it. Names longer than 200 characters
are truncated only for the classification.

### Share on Telegram

Reads in parallel the user's profile (`telegram_chat_id`), the list and all its items; builds
the text with the categorizer `/summary` (grouped by the **saved** category, no guessing:
items without one, or with a category that is not one of the 8 departments, go under
`Other`); replaces the generic title with the list name; sends it with the Telegram adapter.

```json
{ "data": { "list_id": 7, "messages_sent": 1, "total_items": 2,
            "departments": [ { "department": "Dairy", "item_count": 1 } ] } }
```

| Status | Meaning |
|---|---|
| `409` | Telegram not linked: the user must send `/start` to the bot and save the chat id |
| `422` | Empty list, or chat not reachable (wrong id, Start never pressed, bot blocked) |
| `503` | Adapter, categorizer or Telegram unavailable, or bot token missing |

Linking: the user sends `/start` to the bot, which answers with the chat id; the frontend saves
it with `PUT /api/v1/me/telegram`. **Pending:** `db-backend` does not accept
`telegram_chat_id` in `PATCH /auth/me` yet, so saving answers `400` until it does.

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
| `TELEGRAM_ADAPTER_URL` | `http://localhost:8005` | `grocery-telegram-adapter` |
| `REQUEST_TIMEOUT_MS` | `5000` | Timeout of each downstream call |

## Development

```
make init        # enable the commit message hook
npm install
npm start        # http://localhost:8004
npm test         # node --test, downstream services are faked
```

Run one test: `node --test --test-name-pattern="<name>" test/auth.test.js`.

CI runs the tests on every push and pull request. On `master`, if they pass, the image is
published to `ghcr.io/sdegrocerylistmanager/grocery-orchestrator:latest` (and `:<commit sha>`), for
`linux/amd64` and `linux/arm64`.

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
