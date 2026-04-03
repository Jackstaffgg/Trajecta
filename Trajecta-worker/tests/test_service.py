from unittest import TestCase
from unittest.mock import patch

from trajecta_worker.models import AnalysisRequest, AnalysisStatus
from trajecta_worker.service import build_result_payload, process_request_message


class ServiceTests(TestCase):
    def test_build_result_payload_with_metrics(self) -> None:
        request = AnalysisRequest(taskId=7)
        with patch("trajecta_worker.service.download_raw_for_task", return_value=("tmp.bin", False)), patch(
            "trajecta_worker.service.parse_log", return_value={}
        ), patch(
            "trajecta_worker.service.build_output",
            return_value={
                "metrics": {
                    "maxAltitude": 120.5,
                    "maxSpeed": 18.2,
                    "flightDuration": 53.0,
                    "distance": 400.0,
                }
            },
        ):
            result = process_request_message(request, dt=0.1)

        payload = build_result_payload(result)
        self.assertEqual(payload["taskId"], 7)
        self.assertEqual(payload["status"], AnalysisStatus.COMPLETED)
        self.assertIsNone(payload.get("trajectoryObjectKey"))
        self.assertIn("trajectoryJson", payload)
        self.assertIn("metrics", payload)
        self.assertEqual(payload["metrics"]["maxAltitude"], 120.5)

    def test_process_request_message_success_and_cleanup(self) -> None:
        request = AnalysisRequest(taskId=42)
        output_payload = {"metrics": {"maxAltitude": 10.0, "maxSpeed": 2.0, "flightDuration": 1.0, "distance": 3.0}}

        with patch("trajecta_worker.service.download_raw_for_task", return_value=("C:/tmp/in.bin", True)), patch(
            "trajecta_worker.service.parse_log", return_value={"dummy": "data"}
        ), patch("trajecta_worker.service.build_output", return_value=output_payload), patch(
            "trajecta_worker.service.os.remove"
        ) as remove_mock:
            result = process_request_message(request, dt=0.1)

        self.assertEqual(result.status, AnalysisStatus.COMPLETED)
        self.assertIsNotNone(result.trajectoryJson)
        remove_mock.assert_called_once_with("C:/tmp/in.bin")

    def test_process_request_message_failure_returns_failed(self) -> None:
        request = AnalysisRequest(taskId=99)

        with patch("trajecta_worker.service.download_raw_for_task", side_effect=RuntimeError("download failed")):
            result = process_request_message(request, dt=0.1)

        self.assertEqual(result.status, AnalysisStatus.FAILED)
        self.assertIn("download failed", result.errorMessage or "")
