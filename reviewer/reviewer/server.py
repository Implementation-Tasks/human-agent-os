#!/usr/bin/env python3
"""
Minimal HTTP endpoint for the frontend. No dependencies (stdlib only).

    python -m reviewer.server            # http://localhost:8000

POST /run
  body: {"task": {"text": "...", "risk": "...", "reversibility": "...", "exposure": "..."},
         "responses": [...]   # optional: run deterministically (scripted), no API key
         }
  If "responses" is omitted, the server runs LIVE (needs OPENAI_API_KEY).
  Returns the full RunResult JSON (route, outcome, trace, metrics, final_output).

GET /            -> health + usage
GET /scenarios   -> the bundled scripted scenarios
"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from reviewer.llm import LiveLLM, ScriptedLLM
from reviewer.orchestrator import HumanAgentOS

HERE = Path(__file__).parent.parent


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, payload: dict):
        body = json.dumps(payload, indent=2).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # CORS preflight
        self._send(204, {})

    def do_GET(self):
        if self.path.rstrip("/") == "/scenarios":
            self._send(200, json.loads((HERE / "scenarios.json").read_text()))
        else:
            self._send(200, {"service": "human-agent-os reviewer",
                             "usage": "POST /run {task:{...}, responses?:[...]}"})

    def do_POST(self):
        if self.path.rstrip("/") != "/run":
            return self._send(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length) or b"{}")
            task = data.get("task") or {}
            if not task.get("text"):
                return self._send(400, {"error": "task.text is required"})
            if "responses" in data:                      # deterministic / scripted
                llm = ScriptedLLM(data["responses"])
            else:                                        # live
                llm = LiveLLM()
            max_retries = int(data.get("max_retries", 1))
            threshold = float(data.get("pass_threshold", 0.7))
            result = HumanAgentOS(llm, max_retries=max_retries,
                                  pass_threshold=threshold).run(task)
            self._send(200, result.to_dict())
        except Exception as e:  # noqa: BLE001
            self._send(500, {"error": str(e)})

    def log_message(self, *_):  # quieter console
        return


def main():
    port = int(os.environ.get("PORT", "8000"))
    print(f"Reviewer server on http://localhost:{port}  (POST /run)")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
