# Design note: what breaks at 10× and 100×

**Assumption:** surreal.live states "200,000+ Surreal events a year and counting" and the platform was established (as Muso) in 2018. I naively assume the booking rate has been constant from day 1, giving us about 1.6M bookings in the log today. 
At 100× the current rate, that is still only about one booking every 1.5 seconds, so request rate isn't the problem. The size of the history is - events are never deleted, and all of them are replayed into memory on startup.

## What breaks, in order

1. **Startup replay.** The framework streams the whole `eventlist` table and pushes every event through every model before serving anything (`replayEventsStreamed`). Replay time grows linearly with the log, so at 10× each deploy or crash is a long outage, and at 100× likely hours. I haven't timed it against a production-sized log.
2. **Heap memory.** Read models live in the Node heap forever. Benchmarking this repo's models (`npm run bench:models`), today's 1.6M bookings need about 6GB across the three models, already above Node's default ~4GB heap. At 10× the bookings model alone fills the heap at 5.7M. Production uses in-memory SQLite so per-row cost differs, but growth is equally unbounded.
3. **Scan queries block the event loop.** "Upcoming bookings for a venue" filters every booking: 325ms at 1.6M, 1.1s at 5.7M, and nothing else is served meanwhile. Indexed state avoids this.
4. **No horizontal scale.** The in-process event bus means a second instance never sees the first one's writes. The framework has a Redis pub/sub bus, and an optional sequence-number middleware (an extra database round trip per write) that I haven't seen mounted here. I'd check whether production uses it.
5. **One big `eventlist` table.** Lookups stay indexed, but every write maintains three indexes, backups and migrations get slower, and old events can't be cheaply archived.

## What I'd change

- **Snapshots first:** persist each model's state with its last sequence number and replay only the tail on startup. The framework already accepts a start sequence number. This fixes restart time at any size.
- **Move state out of the heap** into Postgres tables or Redis, so memory stops growing with history.
- **Move to a loosely coupled, event-driven architecture*,** with events as the only contract:
  - Commands validate and append events, holding only the small state they need.
  - Projectors own their read stores and can be rebuilt by replay; a new read model is a new projector.
  - Query services only read, so they scale with traffic and restart in seconds.
  - The bus must be durable and replayable (not Redis pub/sub, which can silently drop messages), with each projector tracking its own position.
  - Reads become eventually consistent. Keep the `X-Seq-Num` / `X-Seq-Num-Min` idea so a read can wait for its projector.
- **Partition `eventlist`** to archive old data, after clarifying what historical access is required.
- **Close the concurrency gap:** a unique constraint on payment (`bookingId`, `reference`), since check-then-record isn't atomic (see NOTES.md).

## Next step

Time replay against a database seeded to production size, rerun the load test against it, and repeat after each change. A local load test and model benchmarks are in [LOAD_TEST.md](./LOAD_TEST.md); they show request handling isn't the bottleneck and memory grows steadily with events, but they can't tell us replay time.
