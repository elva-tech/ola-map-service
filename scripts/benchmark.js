const axios = require("axios");

const BASE_URL = process.env.BENCH_BASE_URL || "http://localhost:3000";
const PATH = "/api/map/process";
const RUNS = Number(process.env.BENCH_RUNS || 8);
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY || 4);
const TIMEOUT_MS = Number(process.env.BENCH_TIMEOUT_MS || 15000);

const payload = {
  lat: 12.9716,
  lng: 77.5946,
  // Intentionally includes duplicate coordinate pairs to verify dedupe behavior.
  points: [
    { id: "BLR-1", lat: 12.9352, lng: 77.6245 },
    { id: "BLR-1-DUP", lat: 12.9352, lng: 77.6245 },
    { id: "BLR-2", lat: 13.0358, lng: 77.597 },
    { id: "BLR-2-DUP", lat: 13.0358, lng: 77.597 }
  ],
  config: {
    maxDistanceKm: 10,
    enableEligibilityCheck: true
  }
};

function quantile(sorted, q) {
  if (!sorted.length) {
    return 0;
  }
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * q)));
  return sorted[idx];
}

function formatMs(ms) {
  return `${ms.toFixed(2)} ms`;
}

async function runOnce(client, runId) {
  const start = process.hrtime.bigint();
  try {
    const response = await client.post(PATH, payload);
    const end = process.hrtime.bigint();
    const elapsedMs = Number(end - start) / 1e6;

    const body = response.data || {};
    const validShape =
      typeof body.address === "string" &&
      typeof body.distance === "number" &&
      typeof body.duration === "number" &&
      body.nearestPoint &&
      typeof body.nearestPoint.id === "string" &&
      typeof body.mapLink === "string";

    return {
      runId,
      ok: response.status === 200 && validShape,
      status: response.status,
      elapsedMs
    };
  } catch (error) {
    const end = process.hrtime.bigint();
    const elapsedMs = Number(end - start) / 1e6;
    return {
      runId,
      ok: false,
      status: error.response ? error.response.status : "NO_RESPONSE",
      elapsedMs,
      error: error.message
    };
  }
}

async function runBatch(client, startIdx, size) {
  const jobs = [];
  for (let i = 0; i < size; i += 1) {
    jobs.push(runOnce(client, startIdx + i + 1));
  }
  return Promise.all(jobs);
}

async function main() {
  const client = axios.create({
    baseURL: BASE_URL,
    timeout: TIMEOUT_MS
  });

  const warmup = await runOnce(client, 0);
  if (!warmup.ok) {
    console.error("Warm-up failed:", warmup);
    process.exit(1);
  }

  const results = [];
  for (let i = 0; i < RUNS; i += CONCURRENCY) {
    const size = Math.min(CONCURRENCY, RUNS - i);
    const batchResults = await runBatch(client, i, size);
    results.push(...batchResults);
  }

  const durations = results.map((r) => r.elapsedMs).sort((a, b) => a - b);
  const failed = results.filter((r) => !r.ok);
  const avg = durations.reduce((acc, cur) => acc + cur, 0) / durations.length;
  const p50 = quantile(durations, 0.5);
  const p95 = quantile(durations, 0.95);
  const min = durations[0];
  const max = durations[durations.length - 1];

  console.log("Benchmark Summary");
  console.log("-----------------");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Runs: ${RUNS}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Success: ${RUNS - failed.length}/${RUNS}`);
  console.log(`Min: ${formatMs(min)}`);
  console.log(`P50: ${formatMs(p50)}`);
  console.log(`P95: ${formatMs(p95)}`);
  console.log(`Max: ${formatMs(max)}`);
  console.log(`Avg: ${formatMs(avg)}`);
  console.log(`Goal (<500ms normal): ${p95 < 500 ? "PASS" : "CHECK"}`);

  if (failed.length) {
    console.log("");
    console.log("Failures");
    console.log("--------");
    failed.forEach((f) => {
      console.log(`#${f.runId}: status=${f.status} error=${f.error || "n/a"} time=${formatMs(f.elapsedMs)}`);
    });
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Benchmark crashed:", error.message);
  process.exit(1);
});
