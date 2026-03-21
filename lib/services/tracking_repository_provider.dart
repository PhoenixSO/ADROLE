import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../core/constants/feature_flags.dart';
import 'tracking_repository.dart';

final trackingRepositoryProvider = Provider<TrackingRepository>((_) {
  if (FeatureFlags.enableFirebaseTracking) {
    return FirebaseTrackingRepositoryStub();
  }

  return NoopTrackingRepository();
});

class NoopTrackingRepository implements TrackingRepository {
  @override
  Future<void> publishTrackerPosition({
    required String trackerId,
    required Position position,
  }) async {
    // Intentionally no-op until backend tracking is enabled.
  }

  @override
  Stream<Position> subscribeTrackerPosition(String trackerId) {
    return const Stream<Position>.empty();
  }
}

class FirebaseTrackingRepositoryStub implements TrackingRepository {
  @override
  Future<void> publishTrackerPosition({
    required String trackerId,
    required Position position,
  }) async {
    throw UnimplementedError(
      'Firebase repository is flagged on, but Firebase integration is not wired yet.',
    );
  }

  @override
  Stream<Position> subscribeTrackerPosition(String trackerId) {
    throw UnimplementedError(
      'Firebase repository is flagged on, but Firebase integration is not wired yet.',
    );
  }
}
