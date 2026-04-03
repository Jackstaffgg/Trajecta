from __future__ import annotations

import argparse

from .config import DEFAULT_DT
from .messaging import start_worker
from .service import run_local_convert


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="ArduPilot DataFlash worker for RabbitMQ and local conversion mode.")
    parser.add_argument("--dt", type=float, default=DEFAULT_DT, help="Uniform timeline step in seconds")
    parser.add_argument("--input", "-i", help="Local .bin file for offline conversion")
    parser.add_argument("--output", "-o", help="Local JSON output path for offline conversion")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print local JSON output")
    parser.add_argument("--gzip", action="store_true", help="Also write compressed .json.gz in local mode")
    parser.add_argument("--worker", action="store_true", help="Run as RabbitMQ consumer worker")
    return parser


def main() -> None:
    args = build_parser().parse_args()

    if args.input and args.output:
        run_local_convert(
            args.input,
            args.output,
            dt=args.dt,
            pretty=args.pretty,
            compress_gzip=args.gzip,
        )
        return

    if args.worker or not args.input:
        start_worker(dt=args.dt)
        return

    raise RuntimeError("Provide --input and --output for local mode or use --worker for RabbitMQ mode.")
