class RssiSmoother {
  RssiSmoother({this.alpha = 0.25});

  final double alpha;
  double? _smoothed;

  // Applies a simple EMA filter to stabilize noisy RSSI updates.
  int apply(int currentRssi) {
    if (_smoothed == null) {
      _smoothed = currentRssi.toDouble();
      return currentRssi;
    }

    _smoothed = alpha * currentRssi + (1 - alpha) * _smoothed!;
    return _smoothed!.round();
  }
}
