import 'package:geolocator/geolocator.dart';

// Optional backend seam for Firebase or any real-time datastore.
abstract class TrackingRepository {
  Future<void> publishTrackerPosition({
    required String trackerId,
    required Position position,
  });

  Stream<Position> subscribeTrackerPosition(String trackerId);
}
