import 'package:equatable/equatable.dart';

class DeviceModel extends Equatable {
  const DeviceModel({
    required this.id,
    required this.name,
    required this.rssi,
    required this.lastSeen,
    this.estimatedDistanceMeters,
    this.isMock = false,
  });

  final String id;
  final String name;
  final int rssi;
  final DateTime lastSeen;
  final double? estimatedDistanceMeters;
  final bool isMock;

  DeviceModel copyWith({
    String? id,
    String? name,
    int? rssi,
    DateTime? lastSeen,
    double? estimatedDistanceMeters,
    bool? isMock,
  }) {
    return DeviceModel(
      id: id ?? this.id,
      name: name ?? this.name,
      rssi: rssi ?? this.rssi,
      lastSeen: lastSeen ?? this.lastSeen,
      estimatedDistanceMeters:
          estimatedDistanceMeters ?? this.estimatedDistanceMeters,
      isMock: isMock ?? this.isMock,
    );
  }

  @override
  List<Object?> get props => [
        id,
        name,
        rssi,
        lastSeen,
        estimatedDistanceMeters,
        isMock,
      ];
}
