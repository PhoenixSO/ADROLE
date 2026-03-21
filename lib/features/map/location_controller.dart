import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../services/location_service.dart';

class LocationViewState {
  const LocationViewState({
    this.position,
    this.accessStatus,
    this.error,
    this.isLoading = false,
  });

  final Position? position;
  final LocationAccessStatus? accessStatus;
  final String? error;
  final bool isLoading;

  bool get hasPosition => position != null;

  LocationViewState copyWith({
    Position? position,
    LocationAccessStatus? accessStatus,
    String? error,
    bool? isLoading,
  }) {
    return LocationViewState(
      position: position ?? this.position,
      accessStatus: accessStatus ?? this.accessStatus,
      error: error,
      isLoading: isLoading ?? this.isLoading,
    );
  }

  factory LocationViewState.initial() => const LocationViewState(
        isLoading: true,
      );
}

class LocationController extends StateNotifier<LocationViewState> {
  LocationController(this._service) : super(LocationViewState.initial()) {
    _initialize();
  }

  final LocationService _service;
  StreamSubscription<Position>? _positionSub;

  Future<void> _initialize() async {
    await refresh();
  }

  Future<void> refresh() async {
    state = state.copyWith(isLoading: true, error: null);

    try {
      final status = await _service.ensurePermission();
      if (!status.isReady) {
        await _positionSub?.cancel();
        _positionSub = null;
        state = state.copyWith(
          accessStatus: status,
          isLoading: false,
          error: status.message,
        );
        return;
      }

      final firstPosition = await _service.getCurrentPosition();
      state = state.copyWith(
        position: firstPosition,
        accessStatus: status,
        isLoading: false,
        error: null,
      );

      await _positionSub?.cancel();
      _positionSub = _service.getPositionStream().listen(
        (position) {
          state = state.copyWith(
            position: position,
            accessStatus:
                const LocationAccessStatus(LocationAccessState.ready),
            error: null,
            isLoading: false,
          );
        },
        onError: (err) {
          state = state.copyWith(
            isLoading: false,
            error: err.toString(),
          );
        },
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> openAppSettings() async {
    await _service.openAppSettings();
  }

  Future<void> openLocationSettings() async {
    await _service.openLocationSettings();
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    super.dispose();
  }
}

final locationControllerProvider =
    StateNotifierProvider<LocationController, LocationViewState>((ref) {
  final service = ref.watch(locationServiceProvider);
  return LocationController(service);
});
