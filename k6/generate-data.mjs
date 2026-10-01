// Builds the k6 CSVs from the source files in k6/data/source.
// Usage: node k6/generate-data.mjs   (deterministic; safe to re-run)
import { readFileSync, writeFileSync } from "node:fs";

const SRC = new URL("./data/source/", import.meta.url);
const OUT = new URL("./data/", import.meta.url);
const COUNT = 100;
const BOOKING_ROWS = 5000;

// Small seeded PRNG so the output is reproducible.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rand() * a.length)];

function parseCsv(text) {
  const rows = [];
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const cells = [];
    const re = /("([^"]*)"|[^,]*)(,|$)/g;
    let m;
    while ((m = re.exec(line)) && m[0] !== "") {
      cells.push(m[2] ?? m[1]);
      if (m[3] === "") break;
    }
    rows.push(cells);
  }
  return rows;
}
const q = (s) => `"${String(s).replaceAll('"', '""')}"`;
const read = (f) => parseCsv(readFileSync(new URL(f, SRC), "utf8"));

// --- Entertainers: round-robin across every country in the source (in file
// order within each country) until we have COUNT; genre comes from the file.
const artists = read("artists.csv");
const byCountry = new Map();
for (const r of artists) byCountry.set(r[1], [...(byCountry.get(r[1]) ?? []), r]);
const queues = [...byCountry.values()];
const entertainers = [];
while (entertainers.length < COUNT && queues.some((c) => c.length)) {
  for (const c of queues) {
    if (c.length && entertainers.length < COUNT) {
      const [name, , genre] = c.shift();
      entertainers.push([name, genre]);
    }
  }
}

// --- Venues: real ones first, padded with synthetic venues up to COUNT.
const real = [...read("london_music_venues.csv"), ...read("melbourne_music_venues.csv")];
const venues = real.map(([name, cap]) => {
  const n = parseInt(cap, 10); // "2000 standing / 520 seated" -> 2000, "N/A" -> NaN
  return [name, Number.isFinite(n) && n > 0 ? n : 200];
});
for (let i = venues.length; i < COUNT; i++) {
  venues.push([`Load Test Venue ${String(i + 1).padStart(3, "0")}`, 100 + Math.floor(rand() * 1900)]);
}

// --- Booking templates: indexes into the venue/entertainer lists created in setup().
const bookings = Array.from({ length: BOOKING_ROWS }, () => {
  const days = 30 + Math.floor(rand() * 700);
  const startsAt = new Date(Date.UTC(2030, 0, 1) + days * 864e5 + 20 * 36e5).toISOString();
  return [
    Math.floor(rand() * COUNT),
    Math.floor(rand() * COUNT),
    pick([0, 20000, 35000, 50000, 75000, 120000, 250000]),
    startsAt,
  ];
});

const write = (f, header, rows) =>
  writeFileSync(new URL(f, OUT), [header, ...rows.map((r) => r.map((c) => (typeof c === "string" ? q(c) : c)).join(","))].join("\n") + "\n");
write("venues.csv", "name,capacity", venues);
write("entertainers.csv", "name,genre", entertainers);
write("bookings.csv", "venueIdx,entertainerIdx,feeCents,startsAt", bookings);
console.log(`venues=${venues.length} (${real.length} real) entertainers=${entertainers.length} bookings=${bookings.length}`);
