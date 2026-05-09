const config = require("../config");

class MapLinkUtil {
  static generate(lat, lng) {
    return `${config.MAP_LINK_BASE_URL}${lat},${lng}`;
  }
}

module.exports = MapLinkUtil;
