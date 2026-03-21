import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

enum LocationAccessState {
  ready,
  serviceDisabled,
  permissionDenied,
  permissionDeniedForever,
}

class LocationAccessStatus {
  const LocationAccessStatus(this.state, {this.message});

  final LocationAccessState state;
  final String? message;

  bool get isReady => state == LocationAccessState.ready;
}

abstract class LocationService {
  Future<Position> getCurrentPosition();
  Stream<Position> getPositionStream();
  Future<LocationAccessStatus> ensurePermission();
  Future<LocationAccessStatus> getAccessStatus();
  Future<bool> openAppSettings();
  Future<bool> openLocationSettings();
}

final locationServiceProvider = Provider<LocationService>((_) {
  return GeolocatorLocationService();
});

class GeolocatorLocationService implements LocationService {
  @override
  Future<LocationAccessStatus> ensurePermission() async {
    final currentStatus = await getAccessStatus();
    if (currentStatus.state == LocationAccessState.serviceDisabled) {
      return currentStatus;
    }

    if (currentStatus.state == LocationAccessState.ready) {
      return currentStatus;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.deniedForever) {
      return const LocationAccessStatus(
        LocationAccessState.permissionDeniedForever,
        message:
            'Location permission is permanently denied. Open app settings to enable it.',
      );
    }

    if (permission == LocationPermission.denied) {
      return const LocationAccessStatus(
        LocationAccessState.permissionDenied,
        message: 'Location permission denied. Please grant access to continue.',
      );
    }

    return const LocationAccessStatus(LocationAccessState.ready);
  }

  @override
  Future<LocationAccessStatus> getAccessStatus() async {
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) {
      return const LocationAccessStatus(
        LocationAccessState.serviceDisabled,
        message: 'Location services are disabled. Turn on device location.',
      );
    }

    final permission = await Geolocator.checkPermission();

    if (permission == LocationPermission.deniedForever) {
      return const LocationAccessStatus(
        LocationAccessState.permissionDeniedForever,
        message:
            'Location permission is permanently denied. Open app settings to enable it.',
      );
    }

    if (permission == LocationPermission.denied) {
      return const LocationAccessStatus(
        LocationAccessState.permissionDenied,
        message: 'Location permission denied. Please grant access to continue.',
      );
    }

    return const LocationAccessStatus(LocationAccessState.ready);
  }

  @override
  Future<Position> getCurrentPosition() async {
    final access = await ensurePermission();
    if (!access.isReady) {
      throw Exception(access.message ?? 'Location access is not available.');
    }

    return Geolocator.getCurrentPosition();
  }

  @override
  Stream<Position> getPositionStream() async* {
    final access = await ensurePermission();
    if (!access.isReady) {
      throw Exception(access.message ?? 'Location access is not available.');
    }

    yield* Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.best,
        distanceFilter: 5,
      ),
    );
  }

  @override
  Future<bool> openAppSettings() {
    return Geolocator.openAppSettings();
  }

  @override
  Future<bool> openLocationSettings() {
    return Geolocator.openLocationSettings();
  }
}
