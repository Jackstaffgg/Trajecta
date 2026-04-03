from unittest import TestCase

import numpy as np

from trajecta_worker.timeline import align_discrete_mode, build_output, compute_metrics


class TimelineTests(TestCase):
    def test_align_discrete_mode_forward_fill(self) -> None:
        timeline = np.array([0.0, 1.0, 2.0, 3.0], dtype=float)
        mode_data = {"t": [1.0, 3.0], "mode": ["GUIDED", "AUTO"]}

        aligned = align_discrete_mode(mode_data, timeline)

        self.assertEqual(aligned.tolist(), ["UNKNOWN", "GUIDED", "GUIDED", "AUTO"])

    def test_compute_metrics_basic(self) -> None:
        frames = [
            {
                "t": 0.0,
                "pos": {"lat": 55.0, "lon": 37.0, "alt": 100.0},
                "vel": 5.0,
                "imu": {"accel": [0.0, 0.0, 9.8]},
            },
            {
                "t": 10.0,
                "pos": {"lat": 55.0001, "lon": 37.0001, "alt": 110.0},
                "vel": 8.0,
                "imu": {"accel": [1.0, 2.0, 3.0]},
            },
        ]

        metrics = compute_metrics(frames)

        self.assertEqual(metrics.maxAltitude, 110.0)
        self.assertEqual(metrics.maxSpeed, 8.0)
        self.assertEqual(metrics.flightDuration, 10.0)
        self.assertIsNotNone(metrics.distance)
        self.assertGreater(metrics.distance or 0.0, 0.0)

    def test_build_output_sorts_events(self) -> None:
        data = {
            "gps": {"t": [1.0], "lat": [55.0], "lon": [37.0], "alt": [100.0], "speed": [7.0]},
            "att": {"t": [1.0], "roll": [0.0], "pitch": [0.0], "yaw": [179.0]},
            "ctun": {"t": [1.0], "throttle": [0.5], "alt": [100.0], "dalt": [0.0]},
            "imu": {"t": [1.0], "accx": [0.0], "accy": [0.0], "accz": [1.0], "gyrx": [0.0], "gyry": [0.0], "gyrz": [0.0]},
            "vibe": {"t": [1.0], "x": [0.1], "y": [0.2], "z": [0.3]},
            "pid": {"t": [1.0], "roll": [0.1], "pitch": [0.2], "yaw": [0.3]},
            "baro": {"t": [1.0], "alt": [99.5]},
            "gpa": {"t": [1.0], "acc": [0.8]},
            "mode": {"t": [1.0], "mode": ["AUTO"]},
            "stat_rows": [],
            "pm_rows": [],
            "events": [
                {"t": 2.0, "type": "DISARM"},
                {"t": 1.0, "type": "ARM"},
            ],
            "params": {"TEST": 1},
        }

        output = build_output(data, dt=0.1)

        self.assertEqual(output["meta"]["dt"], 0.1)
        self.assertGreaterEqual(len(output["frames"]), 1)
        self.assertEqual(output["events"][0]["type"], "ARM")
        self.assertEqual(output["events"][1]["type"], "DISARM")
