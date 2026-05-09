require("dotenv").config();

const express = require("express");
const config = require("./config");
const OlaMapsClient = require("./clients/OlaMapsClient");
const MapService = require("./services/MapService");
const MapController = require("./controllers/MapController");
const buildMapRoutes = require("./routes/map.routes");
const CacheUtil = require("./utils/CacheUtil");
const Logger = require("./utils/Logger");

const app = express();
app.use(express.json());

const providerCache = new CacheUtil(config.PROVIDER_CACHE_TTL_MS);
const mapProvider = new OlaMapsClient({
  baseUrl: config.BASE_URL,
  apiKey: config.API_KEY,
  timeoutMs: config.TIMEOUT_MS,
  retryCount: config.RETRY_COUNT,
  retryDelayMs: config.RETRY_DELAY_MS,
  routePreference: config.ROUTE_PREFERENCE,
  enableProviderCache: config.ENABLE_PROVIDER_CACHE,
  cacheTtlMs: config.PROVIDER_CACHE_TTL_MS,
  searchCacheTtlMs: config.SEARCH_CACHE_TTL_MS,
  cache: providerCache
});
const mapService = new MapService(mapProvider);
const mapController = new MapController(mapService);

app.use("/api/map", buildMapRoutes(mapController));

app.get("/", (req, res) => {
  res.status(200).json({
    service: "ola-map-service",
    provider: config.PROVIDER_NAME,
    docs: "See API_CONTRACTS.md in the repository",
    endpoints: {
      health: "GET /health",
      process: "POST /api/map/process",
      search: "GET /api/map/search?q=<text>"
    }
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use((err, req, res, next) => {
  Logger.error("Unhandled error", { message: err.message });
  res.status(500).json({ error: "Unexpected server error" });
});

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  Logger.info("Map service started", {
    port,
    provider: config.PROVIDER_NAME
  });
});

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    Logger.error("Port is already in use", { port });
  } else {
    Logger.error("Server startup failed", { message: error.message });
  }

  process.exit(1);
});
