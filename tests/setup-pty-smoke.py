#!/usr/bin/env python3
"""Adapted from 611e80e: real Clack PTY smoke, also runnable against an installed tarball CLI."""
import fcntl
import json
import os
import pty
import select
import struct
import subprocess
import sys
import tempfile
import termios
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLI = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "dist/cli.js"
SECRETS = ("fixture-only-hidden-first-982", "fixture-only-hidden-replacement-391")

class Wizard:
    def __init__(self, path, env_extra=None):
        env = {k: v for k, v in os.environ.items() if not k.endswith("_API_KEY") and not k.startswith("SIFTPATH_")}
        env.update(SIFTPATH_CONFIG=str(path), TERM="xterm-256color", **(env_extra or {}))
        self.master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 35, 120, 0, 0))
        attrs = termios.tcgetattr(slave)
        attrs[3] &= ~(termios.ECHO | termios.ECHONL)
        attrs[1] &= ~termios.OPOST
        termios.tcsetattr(slave, termios.TCSANOW, attrs)
        self.process = subprocess.Popen([os.environ.get("NODE", "node"), str(CLI), "setup"], stdin=slave, stdout=slave, stderr=slave, env=env, cwd=path.parent, start_new_session=True)
        os.close(slave)
        self.output = bytearray()
        self.mark = 0

    def send(self, keys):
        os.write(self.master, keys.encode())
        time.sleep(0.08)

    def until(self, text, timeout=15):
        needle, deadline = text.encode(), time.monotonic() + timeout
        while needle not in self.output[self.mark:]:
            if time.monotonic() >= deadline:
                raise AssertionError("Missing prompt " + text + "; terminal tail: " + repr(bytes(self.output[-1500:])))
            ready, _, _ = select.select([self.master], [], [], 0.1)
            if ready:
                try:
                    data = os.read(self.master, 65536)
                except OSError:
                    break
                self.output.extend(data)
        assert needle in self.output[self.mark:], text
        self.mark = len(self.output)

    def finish(self, expected=0):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            ready, _, _ = select.select([self.master], [], [], 0.05)
            if ready:
                try:
                    data = os.read(self.master, 65536)
                except OSError:
                    break
                if not data:
                    break
                self.output.extend(data)
            if self.process.poll() is not None and not ready:
                break
        assert self.process.wait(timeout=3) == expected, repr(bytes(self.output[-1000:]))
        assert all(secret.encode() not in self.output for secret in SECRETS), "Password leaked in terminal output"
        os.close(self.master)

    def abort(self):
        if self.process.poll() is None:
            self.process.kill()
            self.process.wait()
        try:
            os.close(self.master)
        except OSError:
            pass

def routes(w, reader=True, test=False):
    for prompt in ("Default search provider", "Semantic search provider", "Research search provider"):
        w.until(prompt)
        w.send("\r")
    if reader:
        w.until("Default webpage reader")
        w.send("\r")
    w.until("After saving, run real provider tests?")
    w.send(("\x1b[D" if test else "") + "\r")
    w.finish()

with tempfile.TemporaryDirectory(prefix="siftpath-clack-pty-") as directory:
    root = Path(directory)
    for cancel in ("\x1b", "\x03"):
        path = root / ("escape.json" if cancel == "\x1b" else "ctrl-c.json")
        w = Wizard(path)
        try:
            w.until("Providers (Space: toggle, Enter: continue)")
            w.send(cancel)
            w.finish()
            assert not path.exists(), "Cancellation created a config"
        finally:
            w.abort()

    path = root / "config.json"
    w = Wizard(path)
    try:
        w.until("Providers (Space: toggle, Enter: continue)")
        # Existing defaults: Brave, Exa, Jina. Toggle to Tavily + Jina with arrows and Space.
        w.send(" \x1b[B \x1b[B \r")
        w.until("Tavily credentials")
        w.send("\x1b[A\r")  # anonymous is initially selected; move to Add API Key
        w.until("TAVILY_API_KEY (required)")
        w.send(SECRETS[0] + "\r")
        w.until("Jina credentials")
        w.send("\r")  # anonymous Reader, no password required
        routes(w)
    finally:
        w.abort()
    saved = json.loads(path.read_text())
    assert saved["credentials"]["TAVILY_API_KEY"] == SECRETS[0]
    assert saved["routes"]["search"] == "tavily" and saved["routes"]["read"] == "jina"
    assert saved["providers"]["jina"]["connection"]["headers"] == {}
    assert not saved["providers"]["brave"]["enabled"]
    assert not list(root.glob("*.siftpath-tests.json")), "Declined tests ran or created history"

    for mode in ("keep", "replace", "cancel-after-secret"):
        original = path.read_bytes()
        w = Wizard(path)
        try:
            w.until("Providers (Space: toggle, Enter: continue)")
            w.send("\r")  # retains selected providers
            w.until("Tavily credentials")
            if mode == "keep":
                w.send("\r")
            else:
                w.send("\x1b[B\x1b[B\r")  # Replace API Key
                w.until("TAVILY_API_KEY (Enter keeps existing Key)")
                w.send(SECRETS[1] + "\r")
            w.until("Jina credentials")
            w.send("\r")
            if mode == "cancel-after-secret":
                w.until("Default search provider")
                w.send("\x1b")
                w.finish()
                assert path.read_bytes() == original, "Cancelled edit modified saved credentials"
            else:
                routes(w)
                current = json.loads(path.read_text())
                assert current["credentials"]["TAVILY_API_KEY"] == (SECRETS[0] if mode == "keep" else SECRETS[1])
        finally:
            w.abort()

    # No official calls: explicit test confirmation exercises the shared diagnostics using local MCP only.
    mock = root / "local.json"
    log = root / "calls.jsonl"
    fixture = ROOT / "tests/fixtures/official-mcp.mjs"
    mock.write_text(json.dumps({"providers": {"local": {"connection": {"transport": "stdio", "command": "node", "args": [str(fixture), "--stdio"], "env": {"MOCK_LOG": str(log)}}, "search": {"name": "search", "arguments": {"q": "$query"}}, "read": {"name": "read", "arguments": {"url": "$url"}}}}, "routes": {"search": "local", "read": "local", "intents": {}, "searchFallback": []}}))
    w = Wizard(mock)
    try:
        w.until("Providers (Space: toggle, Enter: continue)")
        w.send("\r")
        routes(w, test=True)
        assert [json.loads(row)["name"] for row in log.read_text().splitlines()] == ["search", "read"]
    finally:
        w.abort()
    print("Clack PTY passed: arrows, Space, Enter, Esc/Ctrl+C, masked add/replace/keep, routes, anonymous Reader, explicit-only diagnostics")
