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

Try it:

```bash
curl -s localhost:8080/v1/bookings -X POST -H "content-type: application/json" \
  -d '{"venueId":"the-espy","entertainerId":"ent-1","entertainerName":"The Amplifiers","feeCents":45000,"startsAt":"2026-11-05T20:00:00+11:00"}'

curl -s localhost:8080/v1/venues/the-espy/bookings
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
  eventbase.ts      memory event base (with documented workaround)
  booking/
    command.ts      writes: book a booking, cancel a booking
    model.ts        read model built from events
    query.ts        reads: booking by id, venue upcoming bookings
tests/
  booking.test.ts   tests via ShimmieTestStack
```
