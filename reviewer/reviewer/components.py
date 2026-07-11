"""
Swappable components: the Router and the Primary Agent.

These are intentionally simple stubs so the loop runs end-to-end today. Swap them
for the real router / production agent without touching the orchestrator - they
only need the same method signatures.
"""
from __future__ import annotations

from .llm import LLMError, parse_json
from .models import AGENT_ONLY, HUMAN_ONLY, MIXED, ROUTES

# --------------------------------------------------------------------------- #
# Router
# --------------------------------------------------------------------------- #
ROUTER_SYSTEM = (
    "You are the Router in a human-agent operating system. You decide who should "
    "do a task: 'human_only' (high stakes / irreversible / legal or financial "
    "exposure), 'agent_only' (low risk, reversible, routine), or 'mixed' (agent "
    "drafts, a human confirms). Be conservative: route to human_only when in doubt."
)

_ROUTER_SCHEMA = """Return ONLY JSON: {"route": "human_only|agent_only|mixed", "reasoning": "one sentence"}"""


def build_router_prompt(task: dict) -> tuple[str, str]:
    user = (
        f"TASK: {task.get('text','')}\n"
        f"risk={task.get('risk','unknown')}  "
        f"reversibility={task.get('reversibility','unknown')}  "
        f"exposure={task.get('exposure','unknown')}\n\n{_ROUTER_SCHEMA}"
    )
    return ROUTER_SYSTEM, user


class Router:
    def __init__(self, llm):
        self.llm = llm

    def classify(self, task: dict) -> dict:
        try:
            data = parse_json(self.llm.chat(*build_router_prompt(task)))
            route = data.get("route")
            if route not in ROUTES:
                route = HUMAN_ONLY
            return {"route": route, "reasoning": data.get("reasoning", ""), "fallback": False}
        except (LLMError, ValueError, KeyError, Exception):  # noqa: BLE001
            # JSON fallback: default to the accountable path.
            return {"route": HUMAN_ONLY,
                    "reasoning": "fallback: router unavailable, defaulting to human review",
                    "fallback": True}


# --------------------------------------------------------------------------- #
# Primary Agent
# --------------------------------------------------------------------------- #
AGENT_SYSTEM = (
    "You are a capable worker agent. Complete the task concisely and concretely. "
    "If given reviewer feedback, revise your previous draft to fix every issue raised."
)


def build_agent_prompt(task: dict, critique=None) -> tuple[str, str]:
    parts = [f"TASK: {task.get('text','')}"]
    if critique is not None:
        fixes = "\n".join(
            f"- ({i.severity}) {i.detail} -> {i.fix_hint}".rstrip(" ->")
            for i in critique.issues
        )
        parts.append("A reviewer rejected your previous draft. Fix these issues:\n" + fixes)
        parts.append("Return only the corrected output.")
    return AGENT_SYSTEM, "\n\n".join(parts)


class PrimaryAgent:
    def __init__(self, llm):
        self.llm = llm

    def produce(self, task: dict, critique=None) -> str:
        try:
            return self.llm.chat(*build_agent_prompt(task, critique)).strip()
        except (LLMError, Exception):  # noqa: BLE001
            return "[agent output unavailable - API failure]"
