enum SignalQuality {
  excellent,
  good,
  fair,
  weak,
}

class SignalQualityHelper {
  const SignalQualityHelper._();

  static SignalQuality fromRssi(int rssi) {
    if (rssi >= -55) return SignalQuality.excellent;
    if (rssi >= -67) return SignalQuality.good;
    if (rssi >= -75) return SignalQuality.fair;
    return SignalQuality.weak;
  }

  static String label(SignalQuality quality) {
    switch (quality) {
      case SignalQuality.excellent:
        return 'Excellent';
      case SignalQuality.good:
        return 'Good';
      case SignalQuality.fair:
        return 'Fair';
      case SignalQuality.weak:
        return 'Weak';
    }
  }
}
