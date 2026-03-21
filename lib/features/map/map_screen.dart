import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import 'location_controller.dart';

class MapScreen extends ConsumerWidget {
  const MapScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(locationControllerProvider);
    final controller = ref.read(locationControllerProvider.notifier);

    return Scaffold(
      appBar: AppBar(title: const Text('Map Mode')),
      body: state.isLoading
          ? const Center(child: CircularProgressIndicator())
          : state.hasPosition
              ? _buildMap(state)
              : _LocationRecoveryPanel(
                  message: state.error ??
                      'Location access is required to show your map position.',
                  onRetry: controller.refresh,
                  onOpenAppSettings: controller.openAppSettings,
                  onOpenLocationSettings: controller.openLocationSettings,
                ),
    );
  }

  Widget _buildMap(LocationViewState state) {
    final position = state.position!;
    final user = LatLng(position.latitude, position.longitude);
    final trackerPlaceholder = LatLng(
      position.latitude + 0.001,
      position.longitude + 0.001,
    );

    return FlutterMap(
      options: MapOptions(
        initialCenter: user,
        initialZoom: 16,
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.adrole.smarttracker',
        ),
        MarkerLayer(
          markers: [
            Marker(
              point: user,
              width: 120,
              height: 60,
              child: const _MapMarker(
                icon: Icons.person_pin_circle,
                label: 'You',
                color: Colors.blue,
              ),
            ),
            Marker(
              point: trackerPlaceholder,
              width: 140,
              height: 60,
              child: const _MapMarker(
                icon: Icons.my_location,
                label: 'Tracker (Placeholder)',
                color: Colors.red,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _LocationRecoveryPanel extends StatelessWidget {
  const _LocationRecoveryPanel({
    required this.message,
    required this.onRetry,
    required this.onOpenAppSettings,
    required this.onOpenLocationSettings,
  });

  final String message;
  final Future<void> Function() onRetry;
  final Future<void> Function() onOpenAppSettings;
  final Future<void> Function() onOpenLocationSettings;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              message,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: onOpenLocationSettings,
              child: const Text('Open Location Settings'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: onOpenAppSettings,
              child: const Text('Open App Settings'),
            ),
          ],
        ),
      ),
    );
  }
}

class _MapMarker extends StatelessWidget {
  const _MapMarker({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 4),
          Text(label, style: const TextStyle(fontSize: 12)),
        ],
      ),
    );
  }
}
