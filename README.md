# Surreal tech test: the booking ledger

A small event-sourced service built on [ShimmieStack](https://github.com/simon-o-matic/ShimmieStack), the open-source framework Surreal runs on in production. The domain is fictional; the framework is real.

Your task is described in [BRIEF.md](./BRIEF.md). This file just gets you running.

## Setup

Node 24 - (there is a nodenv file in the root to help with this)

```bash
npm install
npm test
npm start
```

Try it (venues and entertainers must exist before they can be booked; ids are returned by the create calls):

```bash
H='content-type: application/json'
V=$(curl -s localhost:8080/v1/venues -X POST -H "$H" -d '{"name":"The Espy","capacity":300}' | jq -r .venueId)
E=$(curl -s localhost:8080/v1/entertainers -X POST -H "$H" -d '{"name":"The Amplifiers","genre":"rock"}' | jq -r .entertainerId)
B=$(curl -s localhost:8080/v1/bookings -X POST -H "$H" \
  -d "{\"venueId\":\"$V\",\"entertainerId\":\"$E\",\"feeCents\":45000,\"startsAt\":\"2026-11-05T20:00:00+11:00\"}" | jq -r .bookingId)
curl -s localhost:8080/v1/bookings/$B/payments -X POST -H "$H" \
  -d '{"reference":"dep-1","amountCents":10000,"paidAt":"2026-10-01T10:00:00Z"}'
curl -s localhost:8080/v1/entertainers/$E/earnings
```

## How this thing hangs together

ShimmieStack is a CQRS-flavoured event-sourcing framework:

- **Command processors** (`src/booking/command.ts`) take writes over HTTP, validate them, and record **events**. They never mutate state directly.
- Events land on the **event log** (in-memory here; Postgres in production) and are broadcast on an event bus.
- **Models / state listeners** (`src/booking/model.ts`) subscribe to events and fold them into in-memory state. On startup the stack **replays** the whole log through the models to rebuild state from scratch.
- **Query processors** (`src/booking/query.ts`) answer reads from the models.

`src/events.ts` defines the event types.

`src/index.ts` wires it all together.

`src/eventbase.ts` contains one small documented workaround for a cold-start bug in the framework's memory event base; it is not part of your task.

The framework's docs are thin. Reading its source in `node_modules/shimmiestack/` (or the [GitHub repo](https://github.com/simon-o-matic/ShimmieStack)) is expected and encouraged

## Layout

```
src/
  index.ts          wiring + startup
  events.ts         event type definitions (RecordModels / SubscribeModels)
  eventbase.ts      memory/postgres event base selection (with documented workaround)
  helpers.ts        validation + error response helpers
  booking/          command (book, cancel, record payment), model, query
  venue/            command, model, query
  entertainer/      command, model, query
  payment/          payment model (reference index, for idempotency)
  earnings/         earnings read model + GET /entertainers/:id/earnings
  debug.ts          memory stats; only mounted with DEBUG_ENDPOINTS=true
tests/              one suite per module, via ShimmieTestStack
```

Design decisions and caveats are in [NOTES.md](./NOTES.md); the design note is [DESIGN_NOTE.md](./DESIGN_NOTE.md).

## API collection

`bruno/` is a [Bruno](https://www.usebruno.com/) collection covering every endpoint. Open the folder in Bruno, select the `local` environment (`http://localhost:8080/v1`) and run the collection top to bottom: ids returned by the create requests are saved and reused by later ones. Against a fresh server it can also be run headless with `npx @usebruno/cli run bruno --env local`.

## Database & load testing

`DB_TYPE=memory` (default) or `DB_TYPE=postgres` with `DATABASE_URL`. `docker compose up -d --build` runs the app against Postgres on :8080. k6 scripts live in `k6/` and run with `docker compose run --rm k6 run /k6/<script>.js`.
