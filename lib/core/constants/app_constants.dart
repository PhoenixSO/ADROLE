class AppConstants {
  static const String appName = 'ADROLE SmartTracker';

  // RSSI distance model defaults. These can be calibrated later per environment.
  static const int defaultTxPower = -59;
  static const double defaultPathLossExponent = 2.0;

  static const Duration scanTimeout = Duration(seconds: 0);
  static const Duration mockScanTick = Duration(seconds: 1);
}
