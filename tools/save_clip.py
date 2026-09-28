#!/usr/bin/env python3
"""Accepts animation uploads from the local game page."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "animations"
ROOT.mkdir(exist_ok=True)


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        data = self.rfile.read(length)
        parts = [part for part in self.path.split("?", 1)[0].split("/") if part]
        if len(parts) == 3 and parts[0] == "frame":
            folder = ROOT / ".frames" / parts[1]
            folder.mkdir(parents=True, exist_ok=True)
            target = folder / parts[2]
        else:
            name = Path(parts[-1] if parts else "clip.webm").name or "clip.webm"
            target = ROOT / name
        target.write_bytes(data)
        self.send_response(204)
        self._cors()
        self.end_headers()
        print(f"saved {target} ({len(data)} bytes)", flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8766), Handler).serve_forever()
