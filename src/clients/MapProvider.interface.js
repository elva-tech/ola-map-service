class MapProviderInterface {
  async reverseGeocode() {
    throw new Error("reverseGeocode() must be implemented");
  }

  async getDistance() {
    throw new Error("getDistance() must be implemented");
  }

  async searchPlaces() {
    throw new Error("searchPlaces() must be implemented");
  }
}

module.exports = MapProviderInterface;
