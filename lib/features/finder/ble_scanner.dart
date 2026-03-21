import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/utils/distance_estimator.dart';
import '../../core/utils/rssi_smoother.dart';
import '../../models/device_model.dart';
import '../../services/ble_service.dart';

class FinderState {
  const FinderState({
    required this.devices,
    required this.isScanning,
    required this.isAdapterReady,
    this.error,
  });

  final List<DeviceModel> devices;
  final bool isScanning;
  final bool isAdapterReady;
  final String? error;

  FinderState copyWith({
    List<DeviceModel>? devices,
    bool? isScanning,
    bool? isAdapterReady,
    String? error,
  }) {
    return FinderState(
      devices: devices ?? this.devices,
      isScanning: isScanning ?? this.isScanning,
      isAdapterReady: isAdapterReady ?? this.isAdapterReady,
      error: error,
    );
  }

  factory FinderState.initial() => const FinderState(
        devices: <DeviceModel>[],
        isScanning: false,
        isAdapterReady: true,
      );
}

class BleScannerController extends StateNotifier<FinderState> {
  BleScannerController(this._bleService) : super(FinderState.initial()) {
    _scanSub = _bleService.scanResults.listen(_onScanResults, onError: (err) {
      state = state.copyWith(error: err.toString());
    });
  }

  final BleService _bleService;
  final Map<String, RssiSmoother> _smoothers = <String, RssiSmoother>{};
  StreamSubscription<List<DeviceModel>>? _scanSub;
  StreamSubscription<bool>? _adapterSub;

  Future<void> initialize() async {
    final ready = await _bleService.isAdapterReady();
    state = state.copyWith(isAdapterReady: ready);
  }

  void _bindAdapterStatus() {
    _adapterSub = _bleService.adapterReadyStream.listen((ready) {
      state = state.copyWith(isAdapterReady: ready);
    });
  }

  Future<void> startScan() async {
    try {
      final ready = await _bleService.isAdapterReady();
      if (!ready) {
        state = state.copyWith(
          isAdapterReady: false,
          error: 'Bluetooth is off. Enable Bluetooth to scan.',
        );
        return;
      }

      await _bleService.startScan();
      state = state.copyWith(isScanning: true, error: null);
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> stopScan() async {
    try {
      await _bleService.stopScan();
      state = state.copyWith(isScanning: false);
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> requestEnableBluetooth() async {
    try {
      await _bleService.requestAdapterEnable();
      final ready = await _bleService.isAdapterReady();
      state = state.copyWith(
        isAdapterReady: ready,
        error: ready ? null : state.error,
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> refreshDevices() async {
    if (!state.isAdapterReady) {
      await initialize();
      return;
    }

    if (state.isScanning) {
      await stopScan();
    }

    await startScan();
  }

  void _onScanResults(List<DeviceModel> rawDevices) {
    final transformed = rawDevices.map((device) {
      final smoother = _smoothers.putIfAbsent(device.id, () => RssiSmoother());
      final smoothedRssi = smoother.apply(device.rssi);
      final meters = DistanceEstimator.estimateMeters(rssi: smoothedRssi);

      return device.copyWith(
        rssi: smoothedRssi,
        estimatedDistanceMeters: meters,
      );
    }).toList()
      ..sort((a, b) {
        final ad = a.estimatedDistanceMeters ?? 9999;
        final bd = b.estimatedDistanceMeters ?? 9999;
        return ad.compareTo(bd);
      });

    state = state.copyWith(devices: transformed, error: null);
  }

  @override
  void dispose() {
    _adapterSub?.cancel();
    _scanSub?.cancel();
    super.dispose();
  }
}

final bleScannerProvider =
    StateNotifierProvider<BleScannerController, FinderState>((ref) {
  final service = ref.watch(bleServiceProvider);
  final controller = BleScannerController(service)
    ..initialize()
    .._bindAdapterStatus();
  return controller;
});
