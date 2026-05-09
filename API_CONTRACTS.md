# Map Service — API Contracts

This document describes the HTTP API for the **stateless**, **request-driven** map microservice. Business rules for map processing come **only** from the **`POST /api/map/process`** JSON body (`config`), not from environment variables.

**Default base URL (local):** `http://localhost:3000`

---

## API index

| Method | Path | Summary |
|--------|------|---------|
| `GET` | `/health` | Liveness probe |
| `GET` | `/api/map/search` | Location search (autocomplete), query param `q` |
| `POST` | `/api/map/process` | Reverse geocode origin, distances to points, nearest point, eligibility, map link |

---

## 1. Health check

### `GET /health`

**Request:** no body.

**Response `200 OK`**

```json
{
  "status": "ok"
}
```

---

## 2. Location search (autocomplete)

### `GET /api/map/search?q=<searchText>`

Exposes **normalized** place suggestions. The browser or client **must not** call Ola directly; this route proxies via the provider client.

**Query parameters**

| Name | Required | Description |
|------|----------|-------------|
| `q` | Yes | Search text. Leading/trailing whitespace is trimmed. |

**Validation & HTTP semantics**

| Condition | Status | Body |
|-----------|--------|------|
| `q` missing, or empty after trim | **400** | `{"error":"Query parameter q is required"}` |
| `q` length **&lt; 3** after trim | **200** | `[]` |
| Success | **200** | JSON array of suggestion objects (see below) |
| Provider failure, timeout, or internal error in search path | **200** | `[]` (safe empty array; errors are logged server-side) |

**Success body — array of suggestions**

Max length is capped by **`SEARCH_MAX_RESULTS`** (default **7**, see operational config).

```json
[
  {
    "id": "ola-platform:5000206829559",
    "name": "VR Bengaluru",
    "lat": 12.996293,
    "lng": 77.69537
  }
]
```

**Item shape**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Provider `place_id`, or `reference` if `place_id` is absent |
| `name` | string | `structured_formatting.main_text`, else `description`, else joined `terms[].value`, else `id` |
| `lat` | number | From prediction `geometry.location.lat` |
| `lng` | number | From prediction `geometry.location.lng` |

Predictions **without** valid `geometry.location` coordinates are **omitted** from the array.

**Upstream (implementation note)**  
Ola **Places Autocomplete**: `GET /places/v1/autocomplete` with query parameter **`input`** (per OpenAPI in project `README.md`). Responses are normalized; **raw Ola JSON is not returned**.

**Caching (operational)**  
If provider caching is enabled, autocomplete results may be cached under key prefix **`ac:`** plus normalized query (lowercase), TTL **`SEARCH_CACHE_TTL_MS`**.

---

## 3. Process map request

### `POST /api/map/process`

**Headers:** `Content-Type: application/json`

**Purpose**

1. **Reverse geocode** the **origin**: `(lat, lng)` → `address`
2. For **each** destination in `points`, compute **route distance & duration** from origin → `(point.lat, point.lng)` (provider distance matrix basic).
3. Select **nearest** destination by smallest distance (km).
4. Apply **eligibility** using **`config`** from the same request body.
5. Build **`mapLink`** for the **nearest** point’s coordinates.

**Distance semantics**

- **Origin:** root-level `lat`, `lng`.
- **Destination:** each element of `points[]` (`lat`, `lng`).
- Each pair is **origin → point**. Duplicate `(lat,lng)` among points is **deduplicated** per request for external calls; results are reused for all matching IDs.

### Request body schema (logical)

```json
{
  "lat": "number, [-90, 90]",
  "lng": "number, [-180, 180]",
  "points": [
    {
      "id": "string (required)",
      "lat": "number, [-90, 90]",
      "lng": "number, [-180, 180]"
    }
  ],
  "config": {
    "maxDistanceKm": "number, >= 0 (required)",
    "enableEligibilityCheck": "boolean (required)"
  }
}
```

### Success `200 OK`

```json
{
  "address": "string",
  "distance": 7.28,
  "duration": 25.03,
  "nearestPoint": {
    "id": "BLR-1",
    "lat": 12.9352,
    "lng": 77.6245
  },
  "isEligible": true,
  "message": "Eligible within configured distance threshold",
  "mapLink": "https://www.google.com/maps?q=12.9352,77.6245"
}
```

| Field | Description |
|-------|-------------|
| `address` | Reverse-geocoded formatted address for **origin** |
| `distance` | Distance to **nearest** point (**km**, rounded) |
| `duration` | Duration to **nearest** point (**minutes**, rounded) |
| `nearestPoint` | Nearest destination from `points` |
| `isEligible` / `message` | If `config.enableEligibilityCheck` is `true`: eligible when `distance <= config.maxDistanceKm`. If `false`: `isEligible` is `true` and message indicates eligibility check disabled |
| `mapLink` | Default pattern `https://www.google.com/maps?q=<nearest.lat>,<nearest.lng>` (base configurable server-side only for links) |

### Errors — `POST /api/map/process`

| Status | When | Example body |
|--------|------|----------------|
| **400** | Validation failure | `{"error":"config is required"}` |
| **500** | Provider/network failure after retries | `{"error":"Map processing failed"}` |
| **500** | Provider request timeout | `{"error":"Map provider timeout"}` |

Malformed JSON on POST may hit the global handler and return **`500`** with `{"error":"Unexpected server error"}` depending on Express behavior.

---

## Example JSON files (repo)

| File | Use |
|------|-----|
| `sample-bangalore-request.json` | Valid process request |
| `sample-bangalore-no-eligibility.json` | Process with eligibility disabled |
| `sample-invalid-request.json` | Missing `config` → expect **400** |

---

## cURL examples (Windows)

### Health

```bash
curl.exe "http://localhost:3000/health"
```

### Search — success

```bash
curl.exe "http://localhost:3000/api/map/search?q=Whitefield%20Bangalore"
```

### Search — short query (empty array)

```bash
curl.exe "http://localhost:3000/api/map/search?q=Wh"
```

### Search — missing `q` (**400**)

```bash
curl.exe -i "http://localhost:3000/api/map/search"
```

### Process — valid payload

```bash
curl.exe -X POST "http://localhost:3000/api/map/process" ^
  -H "Content-Type: application/json" ^
  --data-binary "@sample-bangalore-request.json"
```

### Process — eligibility disabled

```bash
curl.exe -X POST "http://localhost:3000/api/map/process" ^
  -H "Content-Type: application/json" ^
  --data-binary "@sample-bangalore-no-eligibility.json"
```

### Process — invalid (expect **400**)

```bash
curl.exe -i -X POST "http://localhost:3000/api/map/process" ^
  -H "Content-Type: application/json" ^
  --data-binary "@sample-invalid-request.json"
```

**Tip:** Encode spaces and special characters in `q` (e.g. `%20` for space).

---

## Operational configuration (environment)

These affect **infrastructure** only (URLs, keys, timeouts, caching caps). They **do not** replace `config` on **`POST /api/map/process`**.

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP listen port (default `3000`) |
| `MAP_BASE_URL` | Ola API base URL |
| `MAP_API_KEY` | Ola `api_key` query parameter |
| `MAP_TIMEOUT_MS` | Axios timeout per provider call |
| `MAP_ROUTE_PREFERENCE` | Distance matrix `route_preference` |
| `MAP_RETRY_COUNT` | Max retries on retryable failures |
| `MAP_RETRY_DELAY_MS` | Delay between retries |
| `ENABLE_PROVIDER_CACHE` | Enable in-memory provider response cache |
| `PROVIDER_CACHE_TTL_MS` | Default TTL for coordinate-based cache entries |
| `SEARCH_CACHE_TTL_MS` | TTL for autocomplete cache (`ac:` keys) |
| `SEARCH_MAX_RESULTS` | Max suggestions returned from search |

---

## Multi-tenant & statelessness

- Map **business** rules for processing are **per request** via `body.config`.
- No tenant or user identifiers are required or stored for API semantics.
- Shared caches (if enabled) store **coordinate- or query-derived keys** and normalized/provider-derived values only—not caller identity.

---

## Tooling

| Command | Description |
|---------|-------------|
| `npm start` | Run HTTP server |
| `npm run bench` | Load-style checks against `/api/map/process` (see `scripts/benchmark.js`) |
