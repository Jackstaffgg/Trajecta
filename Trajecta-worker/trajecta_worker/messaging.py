from __future__ import annotations

import json
import os
from typing import Any

from .config import (
    DEFAULT_REQUEST_EXCHANGE,
    DEFAULT_REQUEST_QUEUE,
    DEFAULT_REQUEST_ROUTING_KEY,
    DEFAULT_RESULTS_EXCHANGE,
    DEFAULT_RESULTS_QUEUE,
    DEFAULT_RESULTS_ROUTING_KEY,
)
from .models import AnalysisRequest, AnalysisResult, AnalysisStatus
from .service import build_result_payload, process_request_message


def load_json_message(body: bytes | str) -> dict[str, Any]:
    if isinstance(body, bytes):
        body = body.decode("utf-8")
    return json.loads(body)


def publish_result(channel: Any, result: AnalysisResult, properties: Any | None = None) -> None:
    body = json.dumps(build_result_payload(result), ensure_ascii=False).encode("utf-8")
    channel.basic_publish(
        exchange=os.getenv("RESULTS_EXCHANGE", DEFAULT_RESULTS_EXCHANGE),
        routing_key=os.getenv("RESULTS_ROUTING_KEY", DEFAULT_RESULTS_ROUTING_KEY),
        body=body,
        properties=properties,
    )


def start_worker(dt: float) -> None:
    try:
        import pika
    except ImportError as exc:
        raise RuntimeError("pika is required for RabbitMQ worker mode.") from exc

    rabbit_url = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/%2F")
    params = pika.URLParameters(rabbit_url)
    connection = pika.BlockingConnection(params)
    channel = connection.channel()

    request_queue = os.getenv("REQUEST_QUEUE", DEFAULT_REQUEST_QUEUE)
    results_queue = os.getenv("RESULTS_QUEUE", DEFAULT_RESULTS_QUEUE)
    request_exchange = os.getenv("REQUEST_EXCHANGE", DEFAULT_REQUEST_EXCHANGE)
    request_routing_key = os.getenv("REQUEST_ROUTING_KEY", DEFAULT_REQUEST_ROUTING_KEY)
    results_exchange = os.getenv("RESULTS_EXCHANGE", DEFAULT_RESULTS_EXCHANGE)
    results_routing_key = os.getenv("RESULTS_ROUTING_KEY", DEFAULT_RESULTS_ROUTING_KEY)

    channel.exchange_declare(exchange=request_exchange, exchange_type="direct", durable=True)
    channel.exchange_declare(exchange=results_exchange, exchange_type="direct", durable=True)
    channel.queue_declare(queue=request_queue, durable=True)
    channel.queue_declare(queue=results_queue, durable=True)
    channel.queue_bind(queue=request_queue, exchange=request_exchange, routing_key=request_routing_key)
    channel.queue_bind(queue=results_queue, exchange=results_exchange, routing_key=results_routing_key)

    json_properties = pika.BasicProperties(content_type="application/json", delivery_mode=2)

    def on_message(ch: Any, method: Any, properties: Any, body: bytes) -> None:
        try:
            message = load_json_message(body)
            request = AnalysisRequest(
                taskId=int(message["taskId"]),
            )
            result = process_request_message(request, dt=dt)
            publish_result(ch, result, properties=json_properties)
            ch.basic_ack(delivery_tag=method.delivery_tag)
        except Exception as exc:
            task_id = -1
            try:
                message = load_json_message(body)
                task_id = int(message.get("taskId", -1))
            except Exception:
                pass

            fallback = AnalysisResult(taskId=task_id, status=AnalysisStatus.FAILED, errorMessage=str(exc))
            try:
                if fallback.taskId >= 0:
                    publish_result(ch, fallback, properties=json_properties)
            finally:
                ch.basic_ack(delivery_tag=method.delivery_tag)

    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=request_queue, on_message_callback=on_message)
    print(f"Worker started. Listening queue={request_queue}, dt={dt} (prefetch={3})")
    channel.start_consuming()
