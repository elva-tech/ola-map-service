const express = require("express");

function buildMapRoutes(mapController) {
  const router = express.Router();
  router.post("/process", mapController.process);
  router.get("/search", mapController.search);
  return router;
}

module.exports = buildMapRoutes;
