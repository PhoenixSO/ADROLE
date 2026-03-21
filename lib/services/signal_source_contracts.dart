import '../models/device_model.dart';

// Future extension point: WiFi scanning providers should implement this contract.
abstract class WifiSignalSource {
  Stream<List<DeviceModel>> scanNearbyDevices();
}

// Future extension point: UWB ranging providers should implement this contract.
abstract class UwbSignalSource {
  Stream<List<DeviceModel>> rangeNearbyDevices();
}

// Future extension point: ML-based distance estimators (Random Forest / QRF).
abstract class DistanceModelEstimator {
  double estimate({
    required int rssi,
    required int txPower,
    required double pathLossExponent,
  });
}
