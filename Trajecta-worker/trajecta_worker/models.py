from dataclasses import dataclass


class AnalysisStatus:
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


@dataclass(slots=True)
class AnalysisRequest:
    taskId: int


@dataclass(slots=True)
class AnalysisMetrics:
    maxAltitude: float | None = None
    maxSpeed: float | None = None
    flightDuration: float | None = None
    distance: float | None = None


@dataclass(slots=True)
class AnalysisResult:
    taskId: int
    status: str
    trajectoryObjectKey: str | None = None
    trajectoryJson: str | None = None
    metrics: AnalysisMetrics | None = None
    errorMessage: str | None = None


class WorkerError(RuntimeError):
    pass
