"""Data models and constants for the Human-Agent OS review loop."""
from __future__ import annotations

import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List

# Routes
HUMAN_ONLY = "human_only"
AGENT_ONLY = "agent_only"
MIXED = "mixed"
ROUTES = {HUMAN_ONLY, AGENT_ONLY, MIXED}

# Outcomes (what the metric on screen reports)
AUTO_COMPLETED = "auto_completed"        # agent/mixed passed review
ESCALATED = "escalated_to_human"         # failed review after retries -> human
ROUTED_HUMAN = "human_only"              # router sent it straight to a human


@dataclass
class Issue:
    dimension: str          # correctness | completeness | risk_safety | ...
    severity: str           # low | medium | high
    detail: str
    fix_hint: str = ""


@dataclass
class Critique:
    passed: bool
    confidence: float                       # 0..1
    scores: Dict[str, float] = field(default_factory=dict)
    issues: List[Issue] = field(default_factory=list)
    verdict_reason: str = ""
    fallback: bool = False                   # produced by JSON fallback on API failure

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class TraceStep:
    step: str               # route | draft | review | reroute | escalate | human | human_confirm
    title: str
    detail: Any = None
    ts: float = field(default_factory=lambda: round(time.time(), 3))

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RunResult:
    task_id: str
    task: str
    route: str
    outcome: str
    final_output: str
    retries: int
    confidence: float
    trace: List[dict]
    metrics: Dict[str, Any]

    def to_dict(self) -> dict:
        return asdict(self)


def new_id(prefix: str = "run") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"
