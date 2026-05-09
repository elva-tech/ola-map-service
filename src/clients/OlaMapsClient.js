const axios = require("axios");
const MapProviderInterface = require("./MapProvider.interface");
const Logger = require("../utils/Logger");

class OlaMapsClient extends MapProviderInterface {
  constructor(options) {
    super();
    this.options = options;
    this.http = axios.create({
      baseURL: options.baseUrl,
      timeout: options.timeoutMs
    });
  }

  async reverseGeocode(lat, lng) {
    const cacheKey = `${lat}-${lng}`;
    const cached = this.#readFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await this.#requestWithRetry(() =>
      this.http.get("/places/v1/reverse-geocode", {
        params: {
          latlng: `${lat},${lng}`,
          api_key: this.options.apiKey
        }
      })
    );

    const address = data?.results?.[0]?.formatted_address || "";
    this.#writeToCache(cacheKey, address);
    return address;
  }

  async getDistance(origin, destination) {
    const cacheKey = `${origin.lat}-${origin.lng}-${destination.lat}-${destination.lng}`;
    const cached = this.#readFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await this.#requestWithRetry(() =>
      this.http.get("/routing/v1/distanceMatrix/basic", {
        params: {
          origins: `${origin.lat},${origin.lng}`,
          destinations: `${destination.lat},${destination.lng}`,
          route_preference: this.options.routePreference,
          api_key: this.options.apiKey
        }
      })
    );

    const element = data?.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") {
      throw new Error("Unable to fetch distance from map provider");
    }

    const normalized = {
      distanceMeters: element.distance,
      durationSeconds: element.duration
    };
    this.#writeToCache(cacheKey, normalized);
    return normalized;
  }

  async searchPlaces(query) {
    const normalizedQuery = String(query || "").trim();
    const cacheKey = `ac:${normalizedQuery.toLowerCase()}`;
    const cached = this.#readFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await this.#requestWithRetry(() =>
      this.http.get("/places/v1/autocomplete", {
        params: {
          input: normalizedQuery,
          api_key: this.options.apiKey
        }
      })
    );

    const predictions = Array.isArray(data?.predictions) ? data.predictions : [];
    const mapped = predictions.map((prediction) => this.#normalizeAutocompletePrediction(prediction)).filter(Boolean);

    this.#writeToCache(cacheKey, mapped, this.options.searchCacheTtlMs);
    return mapped;
  }

  #normalizeAutocompletePrediction(prediction) {
    if (!prediction || typeof prediction !== "object") {
      return null;
    }

    const lat = prediction.geometry?.location?.lat;
    const lng = prediction.geometry?.location?.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    const id = prediction.place_id || prediction.reference || "";
    if (!id) {
      return null;
    }

    const mainText = prediction.structured_formatting?.main_text;
    const description = prediction.description;
    const termsText = Array.isArray(prediction.terms)
      ? prediction.terms.map((t) => t?.value).filter(Boolean).join(", ")
      : "";

    const name = mainText || description || termsText || id;

    return {
      id,
      name,
      lat,
      lng
    };
  }

  async #requestWithRetry(requestFn) {
    let lastError = null;

    for (let attempt = 0; attempt <= this.options.retryCount; attempt += 1) {
      try {
        const response = await requestFn();
        return response.data;
      } catch (error) {
        lastError = error;
        const canRetry = attempt < this.options.retryCount;
        const isTimeout = error.code === "ECONNABORTED";
        const retryable = this.#isRetryableError(error);

        Logger.error("Ola API request failed", {
          attempt: attempt + 1,
          canRetry,
          isTimeout,
          retryable,
          message: error.message
        });

        if (!canRetry || !retryable) {
          if (isTimeout) {
            const timeoutError = new Error("Map provider request timed out");
            timeoutError.code = "MAP_TIMEOUT";
            throw timeoutError;
          }

          throw new Error("Map provider request failed");
        }

        await this.#sleep(this.options.retryDelayMs || 0);
      }
    }

    throw lastError || new Error("Map provider request failed");
  }

  #isRetryableError(error) {
    if (!error || !error.response) {
      return true;
    }

    const status = Number(error.response.status);
    return status >= 500;
  }

  #sleep(delayMs) {
    if (!delayMs) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  #readFromCache(key) {
    if (!this.options.enableProviderCache || !this.options.cache) {
      return null;
    }

    return this.options.cache.get(key);
  }

  #writeToCache(key, value, ttlMs = null) {
    if (!this.options.enableProviderCache || !this.options.cache) {
      return;
    }

    const effectiveTtl = ttlMs ?? this.options.cacheTtlMs;
    this.options.cache.set(key, value, effectiveTtl);
  }
}

module.exports = OlaMapsClient;
