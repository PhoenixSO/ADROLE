import math
import random
from typing import Dict, List, Tuple

from utils import rssi_to_distance

class QuantumRefiner:
    def __init__(self):
        # These settings keep optimization fast enough for real-time ingestion.
        self.initial_temp = 2.4
        self.cooling = 0.90
        self.iterations = 36

    def _objective(
        self,
        x: float,
        y: float,
        wifi_measurements: List[Tuple[str, float]],
        router_positions: Dict[str, Tuple[float, float, float]],
    ) -> float:
        terms = 0
        error = 0.0
        for source_id, rssi in wifi_measurements:
            if source_id not in router_positions:
                continue
            rx, ry, _ = router_positions[source_id]
            observed_dist = rssi_to_distance(rssi, tx_power=-59, env_factor=2.8)
            model_dist = math.hypot(x - rx, y - ry)
            residual = model_dist - observed_dist
            error += residual * residual
            terms += 1
        if terms == 0:
            return 0.0
        return error / terms

    def refine(
        self,
        x: float,
        y: float,
        confidence: float,
        wifi_measurements: List[Tuple[str, float]] | None = None,
        router_positions: Dict[str, Tuple[float, float, float]] | None = None,
    ) -> tuple[float, float, float]:
        """
        Quantum-inspired refinement using simulated annealing on WiFi residual error.
        The probabilistic acceptance rule imitates tunneling-like exploration.
        """
        if not wifi_measurements or not router_positions:
            return x, y, confidence

        cur_x, cur_y = float(x), float(y)
        cur_e = self._objective(cur_x, cur_y, wifi_measurements, router_positions)
        best_x, best_y, best_e = cur_x, cur_y, cur_e
        temp = self.initial_temp

        # Stable pseudo-randomness per packet coordinate neighborhood.
        rng = random.Random(int((x * 13.0 + y * 17.0) * 1000.0) & 0xFFFFFFFF)

        for _ in range(self.iterations):
            step = 0.18 + 1.5 * temp
            cand_x = cur_x + rng.uniform(-step, step)
            cand_y = cur_y + rng.uniform(-step, step)
            cand_e = self._objective(cand_x, cand_y, wifi_measurements, router_positions)

            delta = cand_e - cur_e
            if delta <= 0:
                accept = True
            else:
                accept_prob = math.exp(-delta / max(temp, 1e-6))
                accept = rng.random() < accept_prob

            if accept:
                cur_x, cur_y, cur_e = cand_x, cand_y, cand_e
                if cand_e < best_e:
                    best_x, best_y, best_e = cand_x, cand_y, cand_e

            temp *= self.cooling

        improvement = max(0.0, cur_e - best_e)
        conf_boost = min(0.08, improvement * 0.08)
        q_confidence = max(0.0, min(1.0, confidence + conf_boost))
        return best_x, best_y, q_confidence
