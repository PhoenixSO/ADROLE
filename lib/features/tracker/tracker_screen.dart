import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'tracker_service.dart';

class TrackerScreen extends ConsumerWidget {
  const TrackerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(trackerProvider);
    final notifier = ref.read(trackerProvider.notifier);

    return Scaffold(
      appBar: AppBar(title: const Text('Tracker Mode')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Tracker ID',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    SelectableText(state.trackerId),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: notifier.regenerateId,
              icon: const Icon(Icons.refresh),
              label: const Text('Generate New ID'),
            ),
            const SizedBox(height: 16),
            SwitchListTile.adaptive(
              value: state.isBroadcasting,
              onChanged: (_) => notifier.toggleBroadcasting(),
              title: const Text('Broadcast as Tracker (Simulated)'),
              subtitle: Text(
                state.isBroadcasting ? 'Broadcasting' : 'Stopped',
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Note: On many platforms, direct BLE advertising is limited. '
              'This mode currently simulates broadcast state and ID assignment.',
            ),
          ],
        ),
      ),
    );
  }
}
