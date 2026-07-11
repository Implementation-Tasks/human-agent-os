#!/usr/bin/env python3
"""
Demo / rehearsal runner for the Human-Agent OS review loop.

Default: runs the four scripted scenarios (no API key needed) so the live demo is
deterministic, and writes each result to sample_response_<name>.json (the exact
JSON contract the frontend renders).

    python demo.py                 # all scripted scenarios
    python demo.py reroute_pass    # one scenario by name
    python demo.py --live "Draft a refund reply for a $200 dispute" --risk medium
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from reviewer.llm import LiveLLM, ScriptedLLM
from reviewer.orchestrator import HumanAgentOS

HERE = Path(__file__).parent
BAR = "\u2500" * 72

STEP_ICON = {"route": "\u2794", "draft": "\u270e", "review": "\u2713?",
             "reroute": "\u21ba", "escalate": "\u26a0", "human": "\U0001f464",
             "human_confirm": "\U0001f464"}


def print_trace(result: dict) -> None:
    print(BAR)
    print(f"TASK: {result['task']}")
    print(f"ROUTE: {result['route']}    OUTCOME: {result['outcome']}    "
          f"retries={result['retries']}  confidence={result['confidence']}")
    print(BAR)
    for s in result["trace"]:
        icon = STEP_ICON.get(s["step"], "\u2022")
        print(f"  {icon}  {s['title']}")
        d = s.get("detail") or {}
        if s["step"] == "route":
            print(f"        route={d.get('route')}  reason: {d.get('reasoning')}"
                  + ("  [FALLBACK]" if d.get("fallback") else ""))
        elif s["step"] == "draft":
            print(f"        {_trunc(d.get('output',''))}")
        elif s["step"] == "review":
            verdict = "PASS" if d.get("passed") else "FAIL"
            print(f"        verdict={verdict}  confidence={d.get('confidence')}"
                  + ("  [FALLBACK]" if d.get("fallback") else ""))
            for i in d.get("issues", []):
                print(f"          - ({i['severity']}/{i['dimension']}) {_trunc(i['detail'], 90)}")
            if d.get("verdict_reason"):
                print(f"          reason: {_trunc(d['verdict_reason'], 100)}")
        elif s["step"] == "escalate":
            print(f"        reason: {_trunc(d.get('reason',''), 100)}")
        elif s["step"] in ("human", "human_confirm"):
            print(f"        {d.get('note','')}")
    print(f"\n  FINAL: {_trunc(result['final_output'], 140)}")
    m = result["metrics"]
    print(f"  METRICS: outcome={m['outcome']}  retries={m['retries']}  "
          f"confidence={m['confidence']}  steps={m['steps']}\n")


def _trunc(s: str, n: int = 120) -> str:
    s = " ".join(str(s).split())
    return s if len(s) <= n else s[: n - 1] + "\u2026"


def run_scripted(only: str | None) -> None:
    scenarios = json.loads((HERE / "scenarios.json").read_text())["scenarios"]
    completed = 0
    for sc in scenarios:
        if only and sc["name"] != only:
            continue
        llm = ScriptedLLM(sc["responses"])
        result = HumanAgentOS(llm, max_retries=1).run(sc["task"]).to_dict()
        print(f"\n### scenario: {sc['name']}  \u2014 {sc['note']}")
        print_trace(result)
        out = HERE / f"sample_response_{sc['name']}.json"
        out.write_text(json.dumps(result, indent=2))
        completed += 1
    if only and completed == 0:
        print(f"No scenario named '{only}'. Options: "
              + ", ".join(s["name"] for s in scenarios), file=sys.stderr)
        sys.exit(1)
    print(f"Wrote {completed} sample_response_*.json (the frontend JSON contract).")


def run_live(text: str, risk: str, reversibility: str, exposure: str) -> None:
    task = {"text": text, "risk": risk, "reversibility": reversibility, "exposure": exposure}
    result = HumanAgentOS(LiveLLM(), max_retries=1).run(task).to_dict()
    print_trace(result)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("scenario", nargs="?", help="Run one scripted scenario by name.")
    ap.add_argument("--live", metavar="TASK", help="Run a real task through a live LLM.")
    ap.add_argument("--risk", default="unknown")
    ap.add_argument("--reversibility", default="unknown")
    ap.add_argument("--exposure", default="unknown")
    args = ap.parse_args()

    if args.live:
        run_live(args.live, args.risk, args.reversibility, args.exposure)
    else:
        run_scripted(args.scenario)


if __name__ == "__main__":
    main()
