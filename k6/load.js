import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";
import { SharedArray } from "k6/data";
import { Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:8080/v1";
// RATE_SCALE=0.05 gives a quick smoke run; 1 is the full ~134k-iteration test.
const SCALE = Number(__ENV.RATE_SCALE || 1);

// Minimal parser: our generated CSVs have a header, optional "quoted" cells, no embedded newlines.
function csv(path) {
  const [head, ...lines] = open(path).trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((line) => {
    const cells = (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map((c) =>
      c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'),
    );
    return Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
  });
}
const venues = new SharedArray("venues", () => csv("./data/venues.csv"));
const entertainers = new SharedArray("entertainers", () => csv("./data/entertainers.csv"));
const bookingRows = new SharedArray("bookings", () => csv("./data/bookings.csv"));

// ~134k iterations, ~65% writes => ~87k events. Baseline with three bursts.
const stage = (rate, seconds) => ({ target: Math.round(rate * SCALE), duration: `${seconds}s` });
const stages = [
  stage(50, 30), stage(50, 60),
  stage(600, 10), stage(600, 60), stage(50, 10), stage(50, 60),
  stage(800, 5), stage(800, 45), stage(50, 10), stage(50, 60),
  stage(1000, 5), stage(1000, 30), stage(50, 10), stage(50, 30),
];
const totalSeconds = stages.reduce((s, st) => s + parseInt(st.duration, 10), 0);

// App memory, polled from GET /debug/memory (needs DEBUG_ENDPOINTS=true on the app).
// The summary reports min/avg/max/p95 of each; max is the peak.
const heapUsed = new Trend("app_heap_used_mb");
const rss = new Trend("app_rss_mb");

export const options = {
  scenarios: {
    // One VU samples app memory once a second for the whole test, plus a short tail.
    memory: {
      executor: "constant-vus",
      vus: 1,
      duration: `${totalSeconds + 15}s`,
      exec: "sampleMemory",
    },
    bursty: {
      executor: "ramping-arrival-rate",
      startRate: 0,
      timeUnit: "1s",
      preAllocatedVUs: 200,
      maxVUs: 1500,
      stages,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500", "p(99)<1500"],
    "http_req_duration{kind:write}": ["p(95)<750"],
    "http_req_duration{kind:read}": ["p(95)<300"],
  },
};
// Every request in this test should be 2xx; 4xx/5xx count as failures.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }));

const JSON_HEADERS = { headers: { "Content-Type": "application/json" } };
const post = (path, body, name, kind = "write") =>
  http.post(`${BASE}${path}`, JSON.stringify(body), { ...JSON_HEADERS, tags: { name, kind } });
const get = (path, name) => http.get(`${BASE}${path}`, { tags: { name, kind: "read" } });

export function sampleMemory() {
  const res = http.get(`${BASE}/debug/memory`, { tags: { name: "GET /debug/memory", kind: "monitor" } });
  if (res.status === 200) {
    heapUsed.add(res.json("heapUsedMb"));
    rss.add(res.json("rssMb"));
  }
  sleep(1);
}

// Runs once: create venues and entertainers from the CSVs, return their ids.
export function setup() {
  const ids = (rows, path, body, key) =>
    http
      .batch(rows.map((r) => ["POST", `${BASE}${path}`, JSON.stringify(body(r)), JSON_HEADERS]))
      .map((res) => {
        if (res.status !== 201) throw new Error(`setup ${path} failed: ${res.status} ${res.body}`);
        return res.json(key);
      });
  return {
    venueIds: ids(venues, "/venues", (v) => ({ name: v.name, capacity: Number(v.capacity) }), "venueId"),
    entertainerIds: ids(entertainers, "/entertainers", (e) => ({ name: e.name, genre: e.genre }), "entertainerId"),
  };
}

// Per-VU memory of bookings this VU created, so payments/cancels/reads target real ids.
const mine = [];
let lastPayment = null;

function createBooking(d) {
  const row = bookingRows[exec.scenario.iterationInTest % bookingRows.length];
  const venueId = d.venueIds[row.venueIdx];
  const entertainerId = d.entertainerIds[row.entertainerIdx];
  const res = post("/bookings", {
    venueId, entertainerId, feeCents: Number(row.feeCents), startsAt: row.startsAt,
  }, "POST /bookings");
  if (check(res, { "booking 201": (r) => r.status === 201 })) {
    mine.push({ id: res.json("bookingId"), venueId, entertainerId, cancelled: false });
  }
}

function recordPayment() {
  // ~10% of payments are client retries of the previous one (same reference): expect 200, not a new payment.
  if (lastPayment && Math.random() < 0.1) {
    const r = post(`/bookings/${lastPayment.bookingId}/payments`, lastPayment.body, "POST /bookings/:id/payments (retry)");
    check(r, { "retry 200": (x) => x.status === 200 });
    return;
  }
  const b = mine[Math.floor(Math.random() * mine.length)];
  const body = {
    reference: `k6-${exec.vu.idInTest}-${exec.vu.iterationInScenario}-${Date.now()}`,
    amountCents: 1000 + Math.floor(Math.random() * 20000),
    paidAt: new Date().toISOString(),
  };
  const r = post(`/bookings/${b.id}/payments`, body, "POST /bookings/:id/payments");
  if (check(r, { "payment 201": (x) => x.status === 201 })) lastPayment = { bookingId: b.id, body };
}

function cancelBooking() {
  const live = mine.filter((b) => !b.cancelled);
  if (live.length === 0) return;
  const b = live[Math.floor(Math.random() * live.length)];
  const r = post(`/bookings/${b.id}/cancel`, { reason: "load test cancellation" }, "POST /bookings/:id/cancel");
  if (check(r, { "cancel 200": (x) => x.status === 200 })) b.cancelled = true;
}

// [weight, action]. Writes = 65, reads = 35.
const mix = [
  [35, (d) => createBooking(d)],
  [25, (d) => (mine.length ? recordPayment() : createBooking(d))],
  [5, (d) => (mine.length ? cancelBooking() : createBooking(d))],
  [10, (d) => { const b = pick(mine); b ? check(get(`/bookings/${b.id}`, "GET /bookings/:id"), { "200": (r) => r.status === 200 }) : createBooking(d); }],
  [8, (d) => check(get(`/venues/${pick(d.venueIds)}/bookings`, "GET /venues/:id/bookings"), { "200": (r) => r.status === 200 })],
  [12, (d) => check(get(`/entertainers/${pick(d.entertainerIds)}/earnings`, "GET /entertainers/:id/earnings"), { "200": (r) => r.status === 200 })],
  [3, (d) => check(get(`/venues/${pick(d.venueIds)}`, "GET /venues/:id"), { "200": (r) => r.status === 200 })],
  [2, (d) => check(get(`/entertainers/${pick(d.entertainerIds)}`, "GET /entertainers/:id"), { "200": (r) => r.status === 200 })],
];
const total = mix.reduce((s, [w]) => s + w, 0);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export default function (d) {
  let n = Math.random() * total;
  for (const [w, fn] of mix) {
    if ((n -= w) < 0) return fn(d);
  }
}
