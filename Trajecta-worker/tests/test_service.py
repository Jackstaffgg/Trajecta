from unittest import TestCase
from unittest.mock import patch

from trajecta_worker.models import AnalysisRequest, AnalysisStatus
from trajecta_worker.service import build_result_payload, process_request_message


class ServiceTests(TestCase):
    def test_build_result_payload_with_metrics(self) -> None:
        request = AnalysisRequest(taskId=7, bucket="logs", objectKey="flight.bin")
        with patch("trajecta_worker.service.download_source_object", return_value=("tmp.bin", False)), patch(
            "trajecta_worker.service.parse_log", return_value={}
        ), patch(
            "trajecta_worker.service.build_output",
            return_value={
                "metrics": {
                    "maxAltitude": 120.5,
                    "maxSpeed": 18.2,
                    "flightDuration": 53.0,
                    "distance": 400.0,
                    "climbRate": 1.1,
                    "accelMagnitudeMax": 9.8,
                }
            },
        ), patch("trajecta_worker.service.result_key_for_input", return_value="analysis/7/flight.json"), patch(
            "trajecta_worker.service.upload_result_object"
        ):
            result = process_request_message(request, dt=0.1, client=object())

        payload = build_result_payload(result)
        self.assertEqual(payload["taskId"], 7)
        self.assertEqual(payload["status"], AnalysisStatus.COMPLETED)
        self.assertEqual(payload["trajectoryObjectKey"], "analysis/7/flight.json")
        self.assertIn("metrics", payload)
        self.assertEqual(payload["metrics"]["maxAltitude"], 120.5)

    def test_process_request_message_success_and_cleanup(self) -> None:
        request = AnalysisRequest(taskId=42, bucket="bucket-a", objectKey="path/in.bin")
        client = object()
        output_payload = {"metrics": {"maxAltitude": 10.0, "maxSpeed": 2.0, "flightDuration": 1.0, "distance": 3.0}}

        with patch("trajecta_worker.service.download_source_object", return_value=("C:/tmp/in.bin", True)), patch(
            "trajecta_worker.service.parse_log", return_value={"dummy": "data"}
        ), patch("trajecta_worker.service.build_output", return_value=output_payload), patch(
            "trajecta_worker.service.result_key_for_input", return_value="analysis/42/out.json"
        ), patch("trajecta_worker.service.upload_result_object") as upload_mock, patch(
            "trajecta_worker.service.os.remove"
        ) as remove_mock:
            result = process_request_message(request, dt=0.1, client=client)

        self.assertEqual(result.status, AnalysisStatus.COMPLETED)
        self.assertEqual(result.trajectoryObjectKey, "analysis/42/out.json")
        upload_mock.assert_called_once_with(client, "bucket-a", "analysis/42/out.json", output_payload)
        remove_mock.assert_called_once_with("C:/tmp/in.bin")

    def test_process_request_message_failure_returns_failed(self) -> None:
        request = AnalysisRequest(taskId=99, bucket="logs", objectKey="bad.bin")

        with patch("trajecta_worker.service.download_source_object", side_effect=RuntimeError("download failed")):
            result = process_request_message(request, dt=0.1, client=object())

        self.assertEqual(result.status, AnalysisStatus.FAILED)
        self.assertIn("download failed", result.errorMessage or "")
