import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../../services/tracking_repository_provider.dart';

class TrackerState {
  const TrackerState({
    required this.trackerId,
    required this.isBroadcasting,
  });

  final String trackerId;
  final bool isBroadcasting;

  TrackerState copyWith({
    String? trackerId,
    bool? isBroadcasting,
  }) {
    return TrackerState(
      trackerId: trackerId ?? this.trackerId,
      isBroadcasting: isBroadcasting ?? this.isBroadcasting,
    );
  }
}

class TrackerController extends StateNotifier<TrackerState> {
  TrackerController(this._ref)
      : super(
          TrackerState(
            trackerId: const Uuid().v4(),
            isBroadcasting: false,
          ),
        ) {
    _hydrateTrackerId();
  }

  static const _trackerIdKey = 'tracker_id';
  final Ref _ref;

  Future<void> _hydrateTrackerId() async {
    final prefs = await SharedPreferences.getInstance();
    final persistedId = prefs.getString(_trackerIdKey);

    if (persistedId == null || persistedId.isEmpty) {
      await prefs.setString(_trackerIdKey, state.trackerId);
      return;
    }

    state = state.copyWith(trackerId: persistedId);
  }

  Future<void> _persistTrackerId(String trackerId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_trackerIdKey, trackerId);
  }

  // Regenerates a unique tracker identity for pairing or session reset flows.
  Future<void> regenerateId() async {
    final trackerId = const Uuid().v4();
    state = state.copyWith(trackerId: trackerId);
    await _persistTrackerId(trackerId);
  }

  // Toggles simulated broadcast state while real advertising support is added.
  void toggleBroadcasting() {
    // Triggers repository provider selection via feature flags (no-op unless enabled).
    _ref.read(trackingRepositoryProvider);
    state = state.copyWith(isBroadcasting: !state.isBroadcasting);
  }
}

final trackerProvider =
    StateNotifierProvider<TrackerController, TrackerState>((ref) {
  return TrackerController(ref);
});
