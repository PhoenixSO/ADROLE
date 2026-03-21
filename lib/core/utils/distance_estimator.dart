import 'dart:math';

import '../constants/app_constants.dart';

class DistanceEstimator {
  const DistanceEstimator._();

  // Estimates distance in meters from RSSI using a log-distance path loss model.
  static double estimateMeters({
    required int rssi,
    int txPower = AppConstants.defaultTxPower,
    double n = AppConstants.defaultPathLossExponent,
  }) {
    final exponent = (txPower - rssi) / (10 * n);
    return pow(10, exponent).toDouble();
  }
}
