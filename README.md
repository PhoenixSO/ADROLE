# ADROLE - SmartTracker

ADROLE is a Flutter SmartTracker app with:
- Tracker mode (simulated broadcast identity)
- Finder mode (BLE scanning + mock scan fallback)
- Map mode (OpenStreetMap + live location)

## Quick Start

1. Install Flutter SDK and add it to PATH.
2. From this folder, generate platform folders if missing:
   ```bash
   flutter create --project-name adrole --org com.adrole .
   ```
3. Restore dependencies:
   ```bash
   flutter pub get
   ```
4. Run app:
   ```bash
   flutter run -d android
   flutter run -d chrome
   flutter run -d windows
   ```

## Notes

- Android uses real BLE scanning through `flutter_blue_plus`.
- Web/Desktop use simulated BLE data by default for Finder mode.
- Map is implemented with OpenStreetMap via `flutter_map`.
- Finder list includes RSSI quality bands, last seen age, and pull-to-refresh.
- Tracker ID persists across restarts using `shared_preferences`.
- Firebase-ready tracking repository wiring is behind the `enableFirebaseTracking`
   flag in `lib/core/constants/feature_flags.dart`.
