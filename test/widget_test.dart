import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:adrole/main.dart';

void main() {
  testWidgets('App shell shows navigation tabs', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: SmartTrackerApp()),
    );

    expect(find.text('Tracker'), findsOneWidget);
    expect(find.text('Finder'), findsOneWidget);
    expect(find.text('Map'), findsOneWidget);
  });
}
