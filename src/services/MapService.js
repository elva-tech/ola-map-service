const DistanceUtil = require("../utils/DistanceUtil");
const EligibilityUtil = require("../utils/EligibilityUtil");
const MapLinkUtil = require("../utils/MapLinkUtil");
const Logger = require("../utils/Logger");
const { SEARCH_MAX_RESULTS } = require("../config");

class MapService {
  constructor(mapProvider) {
    this.mapProvider = mapProvider;
  }

  async process(payload) {
    const runtimeConfig = this.#validateAndExtract(payload);

    const origin = {
      lat: Number(payload.lat),
      lng: Number(payload.lng)
    };

    const points = payload.points.map((point) => ({
      id: String(point.id),
      lat: Number(point.lat),
      lng: Number(point.lng)
    }));

    const address = await this.mapProvider.reverseGeocode(origin.lat, origin.lng);
    const nearest = await this.#getNearestPoint(origin, points);
    const eligibility = EligibilityUtil.evaluate(nearest.distanceKm, runtimeConfig);
    const mapLink = MapLinkUtil.generate(nearest.point.lat, nearest.point.lng);

    const response = {
      address,
      distance: nearest.distanceKm,
      duration: nearest.durationMinutes,
      nearestPoint: nearest.point,
      isEligible: eligibility.isEligible,
      message: eligibility.message,
      mapLink
    };

    Logger.info("Map processing completed", response);
    return response;
  }

  async searchLocations(rawQuery) {
    const query = String(rawQuery ?? "").trim();
    if (query.length < 3) {
      return [];
    }

    try {
      const places = await this.mapProvider.searchPlaces(query);
      const limited = Array.isArray(places) ? places.slice(0, SEARCH_MAX_RESULTS) : [];
      Logger.info("Location search completed", { queryLength: query.length, count: limited.length });
      return limited;
    } catch (error) {
      Logger.error("Location search failed", { message: error.message });
      return [];
    }
  }

  #validateAndExtract(payload) {
    if (!payload || typeof payload !== "object") {
      this.#throwValidation("Request body must be a valid JSON object");
    }

    if (!this.#isValidCoordinate(payload.lat, -90, 90)) {
      this.#throwValidation("Invalid latitude value");
    }

    if (!this.#isValidCoordinate(payload.lng, -180, 180)) {
      this.#throwValidation("Invalid longitude value");
    }

    if (!Array.isArray(payload.points) || payload.points.length === 0) {
      this.#throwValidation("No points provided");
    }

    if (!payload.config || typeof payload.config !== "object") {
      this.#throwValidation("config is required");
    }

    if (!Number.isFinite(Number(payload.config.maxDistanceKm)) || Number(payload.config.maxDistanceKm) < 0) {
      this.#throwValidation("config.maxDistanceKm must be a non-negative number");
    }

    if (typeof payload.config.enableEligibilityCheck !== "boolean") {
      this.#throwValidation("config.enableEligibilityCheck must be boolean");
    }

    payload.points.forEach((point, index) => {
      if (!point || typeof point !== "object") {
        this.#throwValidation(`Invalid point object at index ${index}`);
      }

      if (!point.id) {
        this.#throwValidation(`Point id is required at index ${index}`);
      }

      if (!this.#isValidCoordinate(point.lat, -90, 90)) {
        this.#throwValidation(`Invalid point latitude at index ${index}`);
      }

      if (!this.#isValidCoordinate(point.lng, -180, 180)) {
        this.#throwValidation(`Invalid point longitude at index ${index}`);
      }
    });

    return {
      maxDistanceKm: Number(payload.config.maxDistanceKm),
      enableEligibilityCheck: payload.config.enableEligibilityCheck
    };
  }

  async #getNearestPoint(origin, points) {
    const uniquePointsByCoordinates = new Map();
    points.forEach((point) => {
      const key = `${point.lat}-${point.lng}`;
      if (!uniquePointsByCoordinates.has(key)) {
        uniquePointsByCoordinates.set(key, point);
      }
    });

    const distanceByCoordinates = new Map();
    await Promise.all(
      Array.from(uniquePointsByCoordinates.values()).map(async (point) => {
        const providerDistance = await this.mapProvider.getDistance(origin, point);
        const key = `${point.lat}-${point.lng}`;
        distanceByCoordinates.set(key, providerDistance);
      })
    );

    const computed = points.map((point) => {
      const key = `${point.lat}-${point.lng}`;
      const providerDistance = distanceByCoordinates.get(key);
      const distanceKm = DistanceUtil.metersToKm(providerDistance.distanceMeters);
      const durationMinutes = DistanceUtil.secondsToMinutes(providerDistance.durationSeconds);
      return {
        point,
        distanceKm,
        durationMinutes
      };
    });

    return computed.reduce((nearest, current) =>
      current.distanceKm < nearest.distanceKm ? current : nearest
    );
  }

  #isValidCoordinate(value, min, max) {
    const num = Number(value);
    return Number.isFinite(num) && num >= min && num <= max;
  }

  #throwValidation(message) {
    const error = new Error(message);
    error.code = "VALIDATION_ERROR";
    throw error;
  }
}

module.exports = MapService;
