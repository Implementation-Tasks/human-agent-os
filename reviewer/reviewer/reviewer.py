"""
Reviewer Agent - the accountability core of the Human-Agent OS.

It independently critiques another agent's draft along three dimensions
(correctness, completeness, risk/safety) and returns a STRUCTURED verdict:

    pass, confidence (0..1), per-dimension scores, specific issues (each with a
    severity and a fix hint), and a one-line reason.

The pass decision is a legible rule, not the model's mood:

    PASS  iff  model_says_pass AND confidence >= threshold AND no high-severity issue

That rule is the thing you say out loud to judges, and it's why the system
escalates to a human whenever it is not confident. On any API failure it
fails safe: it does NOT pass, so the task escalates for human review.
"""
from __future__ import annotations

from typing import List

from .llm import LLMError, parse_json
from .models import Critique, Issue

REVIEWER_SYSTEM = (
    "You are a Reviewer Agent in a system where humans and AI agents share work. "
    "Another agent produced a draft for a task. Your job is to independently and "
    "skeptically critique that draft for correctness, completeness, and risk/safety. "
    "Be specific: cite concrete problems, not vibes. Prefer escalating to a human when "
    "the task is high-stakes or you are unsure. You never rubber-stamp."
)

_SCHEMA = """Return ONLY this JSON (no prose, no code fences):
{
  "pass": true | false,
  "confidence": 0.0-1.0,
  "scores": {"correctness": 0.0-1.0, "completeness": 0.0-1.0, "risk_safety": 0.0-1.0},
  "issues": [
    {"dimension": "correctness|completeness|risk_safety",
     "severity": "low|medium|high",
     "detail": "what is wrong",
     "fix_hint": "how the agent should fix it"}
  ],
  "verdict_reason": "one sentence explaining the verdict"
}
Set pass=false if the draft has any high-severity issue or you are not confident."""


def _clamp01(x, default=0.0) -> float:
    try:
        return max(0.0, min(1.0, float(x)))
    except (TypeError, ValueError):
        return default


def build_prompt(task_text: str, draft: str) -> tuple[str, str]:
    user = (
        f"TASK:\n{task_text.strip()}\n\n"
        f"AGENT DRAFT TO REVIEW:\n{draft.strip()}\n\n{_SCHEMA}"
    )
    return REVIEWER_SYSTEM, user


class ReviewerAgent:
    def __init__(self, llm, pass_threshold: float = 0.7):
        self.llm = llm
        self.pass_threshold = pass_threshold

    def review(self, task_text: str, draft: str) -> Critique:
        try:
            raw = self.llm.chat(*build_prompt(task_text, draft))
            data = parse_json(raw)
        except (LLMError, ValueError, KeyError, Exception):  # noqa: BLE001
            # Fail safe: cannot verify -> do not pass -> forces human escalation.
            return Critique(
                passed=False, confidence=0.0, scores={},
                issues=[Issue("risk_safety", "high",
                              "Reviewer could not evaluate the draft (API/parse failure).",
                              "Escalate to a human for manual review.")],
                verdict_reason="Reviewer unavailable - escalating for human review.",
                fallback=True,
            )

        issues: List[Issue] = []
        for it in data.get("issues", []) or []:
            if isinstance(it, dict):
                issues.append(Issue(
                    dimension=str(it.get("dimension", "correctness")),
                    severity=str(it.get("severity", "medium")).lower(),
                    detail=str(it.get("detail", "")),
                    fix_hint=str(it.get("fix_hint", "")),
                ))
            else:
                issues.append(Issue("correctness", "medium", str(it), ""))

        confidence = _clamp01(data.get("confidence", 0.0))
        scores = {k: _clamp01(v) for k, v in (data.get("scores", {}) or {}).items()}
        has_high = any(i.severity == "high" for i in issues)
        model_pass = bool(data.get("pass", False))

        # The legible pass rule.
        passed = model_pass and confidence >= self.pass_threshold and not has_high

        reason = data.get("verdict_reason", "")
        if not passed and model_pass:
            if has_high:
                reason = f"Overridden to FAIL: high-severity issue present. {reason}".strip()
            elif confidence < self.pass_threshold:
                reason = (f"Overridden to FAIL: confidence {confidence:.2f} < "
                          f"threshold {self.pass_threshold:.2f}. {reason}").strip()

        return Critique(passed=passed, confidence=confidence, scores=scores,
                        issues=issues, verdict_reason=reason, fallback=False)
