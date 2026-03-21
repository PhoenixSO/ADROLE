import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/utils/signal_quality.dart';
import 'ble_scanner.dart';

final _finderTickerProvider = StreamProvider<int>((_) {
  return Stream<int>.periodic(const Duration(seconds: 1), (i) => i);
});

class FinderScreen extends ConsumerWidget {
  const FinderScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(bleScannerProvider);
    final notifier = ref.read(bleScannerProvider.notifier);
    ref.watch(_finderTickerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Finder Mode')),
      body: Column(
        children: [
          if (!state.isAdapterReady)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Card(
                color: Theme.of(context).colorScheme.errorContainer,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Bluetooth is turned off',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Enable Bluetooth to discover nearby trackers.',
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          FilledButton.tonal(
                            onPressed: notifier.requestEnableBluetooth,
                            child: const Text('Enable Bluetooth'),
                          ),
                          OutlinedButton(
                            onPressed: notifier.initialize,
                            child: const Text('Refresh Status'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: state.isScanning || !state.isAdapterReady
                        ? null
                        : notifier.startScan,
                    icon: const Icon(Icons.bluetooth_searching),
                    label: const Text('Start Scan'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: state.isScanning ? notifier.stopScan : null,
                    icon: const Icon(Icons.stop_circle_outlined),
                    label: const Text('Stop Scan'),
                  ),
                ),
              ],
            ),
          ),
          if (state.error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                state.error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: notifier.refreshDevices,
              child: state.devices.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [
                        SizedBox(height: 180),
                        Center(
                          child: Text('No devices found yet. Pull to refresh.'),
                        ),
                      ],
                    )
                  : ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(),
                      itemCount: state.devices.length,
                      itemBuilder: (context, index) {
                        final device = state.devices[index];
                        final distance =
                            device.estimatedDistanceMeters?.toStringAsFixed(2) ??
                                '--';
                        final quality =
                            SignalQualityHelper.fromRssi(device.rssi);
                        final qualityLabel = SignalQualityHelper.label(quality);

                        return Card(
                          margin: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          child: ListTile(
                            leading: const Icon(Icons.sensors),
                            title: Text(device.name),
                            subtitle: Text(
                              'ID: ${device.id}\n'
                              'RSSI: ${device.rssi} dBm ($qualityLabel)\n'
                              'Estimated: $distance m\n'
                              'Last seen: ${_lastSeenAge(device.lastSeen)}',
                            ),
                            trailing: device.isMock
                                ? const Chip(label: Text('Mock'))
                                : const Chip(label: Text('Live')),
                          ),
                        );
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }

  String _lastSeenAge(DateTime lastSeen) {
    final diff = DateTime.now().difference(lastSeen);
    if (diff.inSeconds < 5) {
      return 'just now';
    }

    if (diff.inMinutes < 1) {
      return '${diff.inSeconds}s ago';
    }

    if (diff.inHours < 1) {
      return '${diff.inMinutes}m ago';
    }

    return '${diff.inHours}h ago';
  }
}
