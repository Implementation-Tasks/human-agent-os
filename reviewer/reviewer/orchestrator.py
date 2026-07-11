"""
Orchestrator - wires Router -> Primary Agent -> Reviewer into the accountability
loop and records a full trace of every step.

Flow:
    task -> Router
      human_only  -> surface to a human (no AI touches it)          [ROUTED_HUMAN]
      agent/mixed -> Agent draft -> Reviewer critique
                       pass                    -> (mixed: human confirm) done  [AUTO_COMPLETED]
                       fail & retries left      -> reroute to Agent with critique
                       fail & no retries left   -> escalate to a human          [ESCALATED]

The trace (router decision + reviewer verdict + retry count + escalation) is the
primary evidence of agentic reasoning - it is what the demo should show live.
"""
from __future__ import annotations

from .components import PrimaryAgent, Router
from .models import (AGENT_ONLY, AUTO_COMPLETED, ESCALATED, HUMAN_ONLY, MIXED,
                     ROUTED_HUMAN, Critique, RunResult, TraceStep, new_id)
from .reviewer import ReviewerAgent


def _human_output(task: dict, escalated: bool = False, critique: Critique | None = None) -> str:
    who = "escalated to" if escalated else "routed to"
    line = f"[Awaiting human] Task {who} a human owner for completion/approval."
    if critique is not None:
        line += f" Reason: {critique.verdict_reason}"
    return line


class HumanAgentOS:
    def __init__(self, llm, max_retries: int = 1, pass_threshold: float = 0.7):
        self.router = Router(llm)
        self.agent = PrimaryAgent(llm)
        self.reviewer = ReviewerAgent(llm, pass_threshold=pass_threshold)
        self.max_retries = max_retries

    def run(self, task: dict) -> RunResult:
        task_id = new_id()
        text = task.get("text", "")
        trace: list[dict] = []

        def log(step, title, detail):
            trace.append(TraceStep(step, title, detail).to_dict())

        # 1) Route
        decision = self.router.classify(task)
        route = decision["route"]
        log("route", "Router decision",
            {"route": route, "reasoning": decision["reasoning"], "fallback": decision["fallback"]})

        # 2a) Human-only: accountable path, no AI acts
        if route == HUMAN_ONLY:
            log("human", "Routed to a human (accountable path)",
                {"note": "High-stakes/irreversible - no AI action taken."})
            return self._result(task_id, text, route, ROUTED_HUMAN,
                                _human_output(task), retries=0, confidence=1.0, trace=trace)

        # 2b) Agent / mixed: draft -> review loop
        draft = self.agent.produce(task)
        log("draft", "Agent draft", {"attempt": 0, "output": draft})

        retries = 0
        critique = None
        while True:
            critique = self.reviewer.review(text, draft)
            log("review", f"Reviewer critique (attempt {retries})", critique.to_dict())

            if critique.passed:
                break

            if retries >= self.max_retries:
                log("escalate", "Reviewer escalated to a human",
                    {"reason": critique.verdict_reason, "confidence": critique.confidence,
                     "retries_used": retries})
                return self._result(task_id, text, route, ESCALATED,
                                    _human_output(task, escalated=True, critique=critique),
                                    retries=retries, confidence=critique.confidence, trace=trace)

            retries += 1
            log("reroute", f"Reroute to agent with critique (attempt {retries})",
                {"issues": [i.__dict__ for i in critique.issues]})
            draft = self.agent.produce(task, critique=critique)
            log("draft", "Agent revised draft", {"attempt": retries, "output": draft})

        # 3) Passed review
        if route == MIXED:
            log("human_confirm", "Human confirmation (mixed path)",
                {"note": "Agent output passed review; a human signs off before it ships.",
                 "confidence": critique.confidence})

        return self._result(task_id, text, route, AUTO_COMPLETED, draft,
                            retries=retries, confidence=critique.confidence, trace=trace)

    @staticmethod
    def _result(task_id, text, route, outcome, final, retries, confidence, trace) -> RunResult:
        metrics = {
            "outcome": outcome,
            "auto_completed": outcome == AUTO_COMPLETED,
            "escalated_to_human": outcome == ESCALATED,
            "retries": retries,
            "confidence": round(confidence, 3),
            "steps": len(trace),
        }
        return RunResult(task_id=task_id, task=text, route=route, outcome=outcome,
                        final_output=final, retries=retries, confidence=round(confidence, 3),
                        trace=trace, metrics=metrics)
