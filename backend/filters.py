import numpy as np

class MovingAverageFilter:
    def __init__(self, window_size: int = 5):
        self.window_size = window_size
        self.values = []

    def update(self, new_value: float) -> float:
        self.values.append(new_value)
        if len(self.values) > self.window_size:
            self.values.pop(0)
        return sum(self.values) / len(self.values)

class KalmanFilter2D:
    """
    Simple 2D Kalman Filter for smoothing (x, y) coordinates.
    State vector: [x, y, vx, vy]
    """
    def __init__(self, dt: float = 1.0):
        self.dt = dt

        # State: x, y, vx, vy
        self.x = np.zeros((4, 1))

        self.F = np.eye(4)

        # Measurement matrix (we only observe x and y)
        self.H = np.array([
            [1, 0, 0, 0],
            [0, 1, 0, 0]
        ])

        # Covariance matrix
        self.P = np.eye(4) * 1000

        # Measurement noise covariance
        self.R = np.eye(2) * 5.0

    def _update_transition(self, dt: float):
        self.dt = max(0.05, min(2.0, dt))
        self.F = np.array([
            [1, 0, self.dt, 0],
            [0, 1, 0, self.dt],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
        ])
        q = 0.12
        dt2 = self.dt * self.dt
        dt3 = dt2 * self.dt
        self.Q = np.array([
            [q * dt3 / 3, 0, q * dt2 / 2, 0],
            [0, q * dt3 / 3, 0, q * dt2 / 2],
            [q * dt2 / 2, 0, q * self.dt, 0],
            [0, q * dt2 / 2, 0, q * self.dt],
        ])

    def predict(self, dt: float | None = None):
        """Predict the next state."""
        if dt is not None:
            self._update_transition(dt)
        self.x = np.dot(self.F, self.x)
        self.P = np.dot(np.dot(self.F, self.P), self.F.T) + self.Q
        return self.x[0, 0], self.x[1, 0]

    def update(self, z):
        """
        Update state based on measurement z = [x, y].
        """
        z = np.array([[z[0]], [z[1]]])
        
        # Innovation/measurement residual
        y = z - np.dot(self.H, self.x)
        
        # Innovation covariance
        S = np.dot(np.dot(self.H, self.P), self.H.T) + self.R
        
        # Optimal Kalman gain
        K = np.dot(np.dot(self.P, self.H.T), np.linalg.inv(S))
        
        # Updated state estimate
        self.x = self.x + np.dot(K, y)
        
        # Updated covariance estimate
        I = np.eye(self.P.shape[0])
        self.P = np.dot((I - np.dot(K, self.H)), self.P)
        
        return self.x[0, 0], self.x[1, 0]
