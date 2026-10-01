#!/usr/bin/env bash
# Runs the load test and saves, under ./results:
#   summary-<ts>.json  k6 summary (metrics, thresholds, app_heap_used_mb / app_rss_mb)
#   stats-<ts>.csv     container CPU/memory sampled every 2s via `docker stats`
# Usage: k6/run.sh [extra k6 args, e.g. -e RATE_SCALE=0.05]
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p results && chmod 777 results   # k6 container runs as a non-root user
ts="$(date +%Y%m%d-%H%M%S)"
stats="results/stats-$ts.csv"

echo "time,container,mem_usage,mem_percent,cpu_percent" > "$stats"
(
  while true; do
    now="$(date +%H:%M:%S)"
    # Only this compose project's containers (app, postgres), not everything on the host.
    ids="$(docker compose ps -q)"
    [ -n "$ids" ] && docker stats --no-stream --format "$now,{{.Name}},{{.MemUsage}},{{.MemPerc}},{{.CPUPerc}}" $ids >> "$stats" || true
    sleep 2
  done
) &
sampler=$!
trap 'kill "$sampler" 2>/dev/null || true' EXIT

docker compose run --rm k6 run "$@" --summary-export="/results/summary-$ts.json" /k6/load.js
echo "Summary: results/summary-$ts.json"
echo "Container stats: $stats"
