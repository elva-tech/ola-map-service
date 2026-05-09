class DistanceUtil {
  static metersToKm(distanceMeters) {
    return Number((Number(distanceMeters || 0) / 1000).toFixed(2));
  }

  static secondsToMinutes(durationSeconds) {
    return Number((Number(durationSeconds || 0) / 60).toFixed(2));
  }
}

module.exports = DistanceUtil;
