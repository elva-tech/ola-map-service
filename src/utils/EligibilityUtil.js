class EligibilityUtil {
  static evaluate(distanceKm, runtimeConfig) {
    if (!runtimeConfig.enableEligibilityCheck) {
      return {
        isEligible: true,
        message: "Eligibility check is disabled"
      };
    }

    const isEligible = distanceKm <= runtimeConfig.maxDistanceKm;
    return {
      isEligible,
      message: isEligible
        ? "Eligible within configured distance threshold"
        : "Not eligible: exceeds configured maximum distance"
    };
  }
}

module.exports = EligibilityUtil;
