import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/constants/app_constants.dart';
import '../models/device_model.dart';

abstract class BleService {
  Stream<List<DeviceModel>> get scanResults;
  bool get isScanning;
  Stream<bool> get adapterReadyStream;

  Future<void> startScan();
  Future<void> stopScan();
  Future<bool> isAdapterReady();
  Future<void> requestAdapterEnable();
  void dispose();
}

final bleServiceProvider = Provider<BleService>((ref) {
  if (_supportsNativeBle) {
    final service = MobileBleService();
    ref.onDispose(service.dispose);
    return service;
  }

  final service = MockBleService();
  ref.onDispose(service.dispose);
  return service;
});

bool get _supportsNativeBle {
  if (kIsWeb) return false;
  return defaultTargetPlatform == TargetPlatform.android ||
      defaultTargetPlatform == TargetPlatform.iOS;
}

class MobileBleService implements BleService {
  final _controller = StreamController<List<DeviceModel>>.broadcast();
  final _adapterController = StreamController<bool>.broadcast();
  StreamSubscription<List<ScanResult>>? _scanSub;
  StreamSubscription<BluetoothAdapterState>? _adapterSub;
  bool _isScanning = false;

  MobileBleService() {
    _adapterSub = FlutterBluePlus.adapterState.listen((state) {
      _adapterController.add(state == BluetoothAdapterState.on);
    });
  }

  @override
  Stream<List<DeviceModel>> get scanResults => _controller.stream;

  @override
  Stream<bool> get adapterReadyStream => _adapterController.stream;

  @override
  bool get isScanning => _isScanning;

  @override
  Future<void> startScan() async {
    if (_isScanning) return;

    final isReady = await isAdapterReady();
    if (!isReady) {
      throw Exception(
        'Bluetooth is off. Turn on Bluetooth and try scanning again.',
      );
    }

    _isScanning = true;
    _scanSub ??= FlutterBluePlus.scanResults.listen((results) {
      final devices = results
          .map(
            (r) => DeviceModel(
              id: r.device.remoteId.str,
              name: r.device.platformName.isNotEmpty
                  ? r.device.platformName
                  : 'Unknown Device',
              rssi: r.rssi,
              lastSeen: DateTime.now(),
              isMock: false,
            ),
          )
          .toList(growable: false);
      _controller.add(devices);
    });

    try {
      await FlutterBluePlus.startScan();
    } catch (e) {
      _isScanning = false;
      rethrow;
    }
  }

  @override
  Future<void> stopScan() async {
    if (!_isScanning) return;
    await FlutterBluePlus.stopScan();
    _isScanning = false;
  }

  @override
  Future<bool> isAdapterReady() async {
    final state = await FlutterBluePlus.adapterState.first;
    return state == BluetoothAdapterState.on;
  }

  @override
  Future<void> requestAdapterEnable() async {
    await FlutterBluePlus.turnOn();
  }

  @override
  void dispose() {
    _adapterSub?.cancel();
    _scanSub?.cancel();
    _adapterController.close();
    _controller.close();
  }
}

class MockBleService implements BleService {
  final _controller = StreamController<List<DeviceModel>>.broadcast();
  final _adapterController = StreamController<bool>.broadcast();
  final _random = Random();
  Timer? _timer;
  bool _isScanning = false;

  final List<String> _ids = List.generate(6, (i) => 'mock-device-${i + 1}');

  @override
  Stream<List<DeviceModel>> get scanResults => _controller.stream;

  @override
  Stream<bool> get adapterReadyStream => _adapterController.stream;

  @override
  bool get isScanning => _isScanning;

  @override
  Future<void> startScan() async {
    if (_isScanning) return;

    _isScanning = true;
    _adapterController.add(true);
    _emitMockData();
    _timer = Timer.periodic(AppConstants.mockScanTick, (_) => _emitMockData());
  }

  void _emitMockData() {
    final now = DateTime.now();
    final devices = _ids
        .map(
          (id) => DeviceModel(
            id: id,
            name: 'Tracker ${id.split('-').last}',
            rssi: -35 - _random.nextInt(55),
            lastSeen: now,
            isMock: true,
          ),
        )
        .toList(growable: false);
    _controller.add(devices);
  }

  @override
  Future<void> stopScan() async {
    _timer?.cancel();
    _timer = null;
    _isScanning = false;
  }

  @override
  Future<bool> isAdapterReady() async => true;

  @override
  Future<void> requestAdapterEnable() async {}

  @override
  void dispose() {
    _timer?.cancel();
    _adapterController.close();
    _controller.close();
  }
}
