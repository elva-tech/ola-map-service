const Logger = require("../utils/Logger");

class MapController {
  constructor(mapService) {
    this.mapService = mapService;
    this.process = this.process.bind(this);
    this.search = this.search.bind(this);
  }

  async process(req, res) {
    try {
      const result = await this.mapService.process(req.body);
      return res.status(200).json(result);
    } catch (error) {
      if (error.code === "VALIDATION_ERROR") {
        Logger.error("Map request validation failed", { message: error.message });
        return res.status(400).json({
          error: error.message
        });
      }

      if (error.code === "MAP_TIMEOUT") {
        Logger.error("Map provider timeout", { message: error.message });
        return res.status(500).json({
          error: "Map provider timeout"
        });
      }

      Logger.error("Map request failed", { message: error.message });
      return res.status(500).json({
        error: "Map processing failed"
      });
    }
  }

  async search(req, res) {
    const rawQ = req.query.q;
    if (rawQ === undefined || rawQ === null || String(rawQ).trim() === "") {
      Logger.error("Location search validation failed", { message: "Missing query parameter q" });
      return res.status(400).json({
        error: "Query parameter q is required"
      });
    }

    try {
      const results = await this.mapService.searchLocations(rawQ);
      return res.status(200).json(results);
    } catch (error) {
      Logger.error("Location search unexpected error", { message: error.message });
      return res.status(200).json([]);
    }
  }
}

module.exports = MapController;
