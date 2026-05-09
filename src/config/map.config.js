const mapConfig = {
  BASE_URL: process.env.MAP_BASE_URL || "https://api.olamaps.io",
  API_KEY: process.env.MAP_API_KEY || "",
  TIMEOUT_MS: Number(process.env.MAP_TIMEOUT_MS || 5000),
  PROVIDER_NAME: process.env.MAP_PROVIDER_NAME || "ola",
  ROUTE_PREFERENCE: process.env.MAP_ROUTE_PREFERENCE || "fastest",
  MAP_LINK_BASE_URL: process.env.MAP_LINK_BASE_URL || "https://www.google.com/maps?q=",
  RETRY_COUNT: Number(process.env.MAP_RETRY_COUNT || 2),
  RETRY_DELAY_MS: Number(process.env.MAP_RETRY_DELAY_MS || 150),
  ENABLE_PROVIDER_CACHE: String(process.env.ENABLE_PROVIDER_CACHE || "true") === "true",
  PROVIDER_CACHE_TTL_MS: Number(process.env.PROVIDER_CACHE_TTL_MS || 300000),
  SEARCH_CACHE_TTL_MS: Number(process.env.SEARCH_CACHE_TTL_MS || 180000),
  SEARCH_MAX_RESULTS: Number(process.env.SEARCH_MAX_RESULTS || 7)
};

module.exports = mapConfig;
