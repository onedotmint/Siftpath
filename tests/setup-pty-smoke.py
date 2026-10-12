#!/usr/bin/env python3
"""Exercise the installed Clack wizard in a real Linux pseudo-terminal."""
import json
import fcntl
import struct
import os
import pty
import select
import subprocess
import termios
import tempfile
import time
from pathlib import Path

CLI = Path(__file__).resolve().parent.parent / "dist" / "cli.js"
PROVIDER_KEYS = (
    "EXA_API_KEY", "TAVILY_API_KEY", "PARALLEL_API_KEY", "BRAVE_API_KEY",
    "FIRECRAWL_API_KEY", "JINA_API_KEY", "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
)


def wizard(path: Path, cancel: bool = False):
    env = dict(os.environ)
    for name in PROVIDER_KEYS:
        env.pop(name, None)
    env["SIFTPATH_CONFIG"] = str(path)
    env["TERM"] = "xterm-256color"
    master, slave = pty.openpty()
    # A raw PTY starts with 0 columns on CI and Clack wraps every character.
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 30, 100, 0, 0))
    attrs = termios.tcgetattr(slave)
    attrs[3] &= ~(termios.ECHO | termios.ECHONL)
    attrs[1] &= ~termios.OPOST
    termios.tcsetattr(slave, termios.TCSANOW, attrs)
    process = subprocess.Popen(
        ["node", str(CLI), "setup"], stdin=slave, stdout=slave, stderr=slave,
        env=env, start_new_session=True,
    )
    os.close(slave)
    output = bytearray()

    def until(needle: bytes, timeout: float = 12.0):
        deadline = time.monotonic() + timeout
        while needle not in output:
            if time.monotonic() > deadline:
                raise AssertionError(
                    "Wizard timed out waiting for " + repr(needle) +
                    "; output tail: " + repr(bytes(output[-600:]))
                )
            ready, _, _ = select.select([master], [], [], 0.15)
            if ready:
                try:
                    piece = os.read(master, 65536)
                except OSError:
                    break
                if not piece:
                    break
                output.extend(piece)
        assert needle in output, "Missing expected prompt: " + repr(needle)

    try:
        until(b"Choose search provider")
        if cancel:
            os.write(master, b"\x1b")
        else:
            # Exa is selected initially; one Down selects Tavily.
            os.write(master, b"\x1b[B")
            time.sleep(0.12)
            os.write(master, b"\r")
            until(b"TAVILY_API_KEY")
            os.write(master, b"example-only-fake-secret-94\r")
        assert process.wait(timeout=12.0) == 0, repr(bytes(output[-500:]))
        # Drain remaining output, keeping the safety assertion meaningful.
        while True:
            ready, _, _ = select.select([master], [], [], 0.05)
            if not ready:
                break
            try:
                piece = os.read(master, 65536)
            except OSError:
                break
            if not piece:
                break
            output.extend(piece)
        assert b"example-only-fake-secret-94" not in output, "API key echoed to terminal"
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        os.close(master)


with tempfile.TemporaryDirectory(prefix="siftpath-setup-pty-") as directory:
    root = Path(directory)
    canceled = root / "canceled.json"
    wizard(canceled, cancel=True)
    assert not canceled.exists(), "Canceled setup must not write configuration"

    configured = root / "config.json"
    wizard(configured)
    saved = json.loads(configured.read_text("utf-8"))
    assert saved["credentials"] == {"TAVILY_API_KEY": "example-only-fake-secret-94"}, saved
    print("Pi-independent Clack PTY smoke passed: selection, secret, cancellation")
