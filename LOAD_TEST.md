# Load testing

Load tests run the application against Postgres, as in production, using [Grafana k6](https://k6.io). Everything runs in Docker Compose.

## Approach

- **Environment:** `docker-compose.yml` runs the app (`DB_TYPE=postgres`), Postgres 17, and k6. k6 is under the `load` profile, so `docker compose up` doesn't start it.
- **Database config:** `DB_TYPE=memory` (default) or `postgres`. Postgres needs `DATABASE_URL`; `PG_POOL_SIZE` is optional.
- **Test data:** CSV files in `k6/data/`, generated from the source lists in `k6/data/source/` by `k6/generate-data.mjs`:
  - `venues.csv` (`name,capacity`): 100 rows. 56 real London/Melbourne venues, padded with synthetic "Load Test Venue NNN" rows. "N/A" capacities become 200.
  - `entertainers.csv` (`name,genre`): 100 rows, drawn round-robin across all countries in the source, with genres from the file.
  - `bookings.csv` (`venueIdx,entertainerIdx,feeCents,startsAt`): 5,000 templates. Venue and entertainer IDs are random UUIDs, so rows refer to them by index.
- **Setup:** k6's `setup()` creates the venues and entertainers from the CSVs once and keeps their IDs. Bookings use those IDs by index.
- **Load shape:** `ramping-arrival-rate` (fixed request rate, not fixed users). The baseline is about 50 requests/s with three bursts to 600, 800 and 1000/s. The run lasts about 7 minutes and makes roughly 134k requests.
- **Traffic mix:** about 65% writes and 35% reads, which gives about 87k events.

  | Share | Action |
  |---|---|
  | 35% | create booking |
  | 25% | record payment (10% are retries with the same reference, expecting 200) |
  | 5% | cancel booking |
  | 12% | entertainer earnings |
  | 10% | get booking |
  | 8% | list venue bookings |
  | 3% | get venue |
  | 2% | get entertainer |

  Each virtual user remembers the bookings it created, so payments, cancels and reads target real IDs.
- **Pass/fail:** any non-2xx response is a failure. Thresholds are failed requests under 1%, p95 under 500ms and p99 under 1.5s overall, write p95 under 750ms, and read p95 under 300ms. The thresholds are starting guesses.

## Running it

Requires Docker.

```bash
# Start the app and Postgres (app on http://localhost:8080)
docker compose up -d --build

# Smoke run at 5% of the rate
k6/run.sh -e RATE_SCALE=0.05

# Full run
k6/run.sh

# Reset: stop everything and wipe the database
docker compose down -v
```

`setup()` creates 200 venues and entertainers on every run, so use `down -v` between runs for a clean database.

### Regenerating the data

```bash
node k6/generate-data.mjs
```

This is deterministic. Edit the source files in `k6/data/source/` or the constants at the top of the script (`COUNT`, `BOOKING_ROWS`) to change the data.

### Results

`k6/run.sh` runs the test and writes a JSON summary to `results/summary-<timestamp>.json` (git-ignored). The same summary is still printed to the terminal. The file holds each metric's aggregates (avg, min, med, max, p90, p95, p99, counts, rates) and the threshold pass/fail results. It does not hold per-request data.

For per-request data, pass k6's raw output flag, e.g. `k6/run.sh --out json=/results/raw.json`. Expect a large file at about 134k requests.

#### Memory usage

Two sources are captured on every run:

- **App memory (from inside the process).** The app exposes `GET /v1/debug/memory`, which returns `heapUsedMb`, `heapTotalMb`, `rssMb` and `externalMb` from `process.memoryUsage()`. The route is only mounted when `DEBUG_ENDPOINTS=true`, which compose sets for the app. Don't enable it in production. A second k6 scenario (`memory`) polls it once a second for the whole test and records the custom metrics `app_heap_used_mb` and `app_rss_mb`. In the summary, `max` is the peak and `avg` and `p(95)` show the typical level. Heap used is the number to watch, because the read models live in the V8 heap and grow with every event.
- **Container memory and CPU (from outside).** `k6/run.sh` samples `docker stats` every 2 seconds for the app and Postgres containers and writes `results/stats-<timestamp>.csv` (`time,container,mem_usage,mem_percent,cpu_percent`). This is the total for each container, so it includes Postgres and anything outside the Node heap. The wrapper stops the sampler when the run ends.

The summary only has aggregates. To see how heap grows over the run, use the stats CSV (RSS growth) or the future dashboard. Compare the app's `max` heap against the event count from the database to estimate memory per event.

To run k6 without the wrapper, use `docker compose run --rm k6 run --summary-export=/results/summary.json /k6/load.js`.

### Inspecting the database and containers

```bash
# Event counts by type
docker compose exec postgres psql -U surreal -c 'select type, count(*) from eventlist group by 1'

# Container CPU and memory right now (run.sh already records this during a run)
docker stats
```

## Model benchmark (memory and query cost at large sizes)

The k6 test only reaches about 87,000 events, which is a few percent of the production log. To see what the in-memory read models cost at production size, there is a separate script that doesn't use HTTP or a database:

```bash
npm run bench:models -- --bookings 1.6M
```

It feeds the real `BookingModel`, `EarningsModel` and `PaymentModel` from a generator of events and reports, per model, the heap used and the bytes per booking. It also times the venue "upcoming bookings" query, which scans every booking, and an entertainer earnings query. Each model is measured separately (so the figures add up), after settling the heap with several garbage collections.

Options (counts accept `k`/`M`): `--bookings` (default 1M), `--payments-per-booking` (default 1), `--cancel-rate` (default 0.05), `--venues` (default 2000) and `--entertainers` (default 5000).

It stops early, and says so, when the heap reaches 85% of V8's limit (about 4.2GB here). To go further, raise the limit, for example `NODE_OPTIONS=--max-old-space-size=12000 npm run bench:models -- --bookings 4M`. Don't set it above the machine's free memory, or the operating system will kill the process.

Results on my laptop (1 payment per booking, 5% cancelled):

| Bookings | BookingModel | EarningsModel | PaymentModel | Venue scan |
|---|---|---|---|---|
| 100,000 | 64MB | 180MB | 151MB | 20ms |
| 1.6M (about today) | 1,024MB | 2,872MB | 2,412MB | 325ms |
| 16M (10×) | stopped at 5.7M bookings, 3.6GB | stopped at 2.0M, 3.6GB | stopped at 2.4M, 3.7GB | 1,110ms at 5.7M |

Per booking that is about 670 bytes, 1,880 bytes and 1,580 bytes. These are this repo's models, which are plain `Map`s. Production keeps state in in-memory SQLite, so its per-row cost will differ.

## Results of a local run

An illustration, not a full test: it wrote about 87,000 events (2-5% of today's log), against Postgres, with the app, database and k6 sharing one laptop.

| | Result |
|---|---|
| Requests | 134,600, with no failures |
| Load shape | about 50/s baseline, bursts to 600, 800 and 1,000/s |
| Latency | p95 18ms, p90 10.5ms, slowest 275ms |
| App CPU | peak about 112% (more than one core), average 31% |
| Postgres CPU | peak about 63% |
| App memory | container grew from 121MB to 287MB, V8 heap peaked at 118MB |

- **What it says:** handling requests isn't the bottleneck, and memory grows steadily with events (about 1-1.5KB per event, which fits the model benchmark above).
- **What it can't say:** how long replay takes, or how queries behave against a log of production size. Replay time needs a database seeded with millions of events.

## What to watch for

- **Dropped iterations:** if k6 reports `dropped_iterations`, the app, k6 or Docker is out of capacity. Check k6's own CPU use before blaming the app.
- **Startup replay:** the app rebuilds its in-memory read models by replaying the whole event log at startup. After a full run, run `docker compose restart app` and time how long it takes to come back.
- **Memory:** read models live in the Node process, so memory grows with the event count. Check `app_heap_used_mb` (max) in the summary and the stats CSV. If heap keeps rising after the bursts end, nothing is releasing it.
- **Payment reference race:** idempotency is check-then-record, which isn't atomic (see NOTES.md). The retry traffic is sequential per user, so it checks idempotency but doesn't trigger the concurrent duplicate-reference race.

## Future: live dashboards

Not implemented yet. The JSON summary only gives end-of-run totals. For a bursty test, the useful question is what happens over time: how latency and errors behave during each burst, and how quickly the system recovers afterwards. A live dashboard would show that, and would make it practical to compare runs (for example before and after a scaling change from DESIGN_NOTE.md).

### Target architecture

```
k6 ──metrics──> InfluxDB / Prometheus ──> Grafana
app ──metrics──> Prometheus ───────────────┘
postgres ──postgres-exporter──> Prometheus
containers ──cAdvisor──> Prometheus
```

### Steps

1. **Pick a time-series store.** Prometheus is the better long-term choice, since one store can also hold app, Postgres and container metrics. InfluxDB is quicker to wire up for k6 alone. Either works with k6's built-in outputs.
2. **Add services to `docker-compose.yml`**, under the `load` profile so a normal `docker compose up` stays light:
   - the time-series store, with a volume so data survives restarts;
   - Grafana, with provisioned data sources and dashboards (files under `grafana/provisioning/`) so it works without clicking through the UI.
3. **Send k6 metrics to it:**
   - InfluxDB: `--out influxdb=http://influxdb:8086/k6` (needs the xk6-influxdb build or a recent k6 with the output built in).
   - Prometheus: `--out experimental-prometheus-rw`, with `K6_PROMETHEUS_RW_SERVER_URL=http://prometheus:9090/api/v1/write` and Prometheus started with `--web.enable-remote-write-receiver`. Setting `K6_PROMETHEUS_RW_TREND_STATS=p(95),p(99),avg` exposes the percentiles directly.
   - Extend `k6/run.sh` to pass the output flag, and keep `--summary-export` as well.
4. **Import a k6 dashboard** (the official k6 Prometheus dashboard on grafana.com, or build one). Panels worth having:
   - request rate against the planned stage rate;
   - p95 and p99 latency, split by the `kind` tag (read or write) and by `name` (the endpoint);
   - failed request rate and the check pass rate;
   - active VUs against allocated VUs, and dropped iterations. If VUs hit the cap, or iterations are dropped, k6 is limiting the test rather than the app.
5. **Add app and database metrics so they line up with the bursts:**
   - the Node process: event loop lag, heap size and GC time (for example with `prom-client`, exposed on a `/metrics` route). This would replace the `/debug/memory` polling and the `docker stats` CSV, and gives a time series of heap instead of just the peak;
   - Postgres: connections in use against the pool size, transaction rate, lock waits and table size, using `postgres-exporter`;
   - containers: CPU and memory per service, using cAdvisor, to show whether Docker resources are the bottleneck.
6. **Mark runs so they can be compared.** Tag each run (for example `--tag testid=<git sha>-<date>`) and add a Grafana variable for it. Annotate the burst stages on the dashboard so spikes are easy to read.
7. **Keep the JSON summary** as the record for pass/fail and for comparing runs, for example in CI. The dashboard is for diagnosis, the summary for the record.

### Things to decide when implementing

- **Retention:** how long to keep run data, and whether Docker volumes are enough or results should be exported.
- **Overhead:** streaming per-request metrics adds load on k6 and on the store. Check that the dashboard doesn't change the results, for example by comparing against a run with only `--summary-export`.
- **Production parity:** the compose stack runs on one machine, so the load generator, app and database compete for the same CPU. A realistic capacity test needs k6 on a separate host, or Grafana Cloud k6.
- **Shared setup:** if other services need the same stack, move it into its own `monitoring` compose file rather than duplicating it.


