#!/usr/bin/env python3
"""Screenshot a local page via Chrome DevTools Protocol.

Adapted from the pattern used by sibling hackathon builds in this workspace
(point-and-ask/scripts/shot.py): headless Chrome here needs the Hatch WebGL
domain-policy switches, and plain --screenshot mode does not produce output,
so drive it over CDP instead.

Usage: shot.py <url> <out.png> <width> <height> [--wait SECONDS] [--full]
"""
import base64
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request

import websocket

CHROME = "/opt/meta-chromium/chrome"
POLICY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "webgl-policy.txt")


def sha256(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def main():
    url, out, width, height = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    wait = 3.0
    full = "--full" in sys.argv
    for i, a in enumerate(sys.argv):
        if a == "--wait" and i + 1 < len(sys.argv):
            wait = float(sys.argv[i + 1])
    import random
    port = random.randint(20000, 45000)
    # NOTE: /tmp is a 512MB tmpfs shared by every agent's Chrome profiles and
    # fills up; keep the profile on workspace disk instead.
    profile = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cdp-profile-%d" % os.getpid())
    cmd = [
        CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
        "--disable-dev-shm-usage",
        "--user-data-dir=" + profile,
        "--remote-debugging-port=%d" % port,
        "--hatch-webgl-allowed-domains-file=" + POLICY,
        "--hatch-webgl-allowed-domains-sha256=" + sha256(POLICY),
        "--hide-scrollbars",
        "about:blank",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws_url = None
        for _ in range(60):
            try:
                with urllib.request.urlopen("http://127.0.0.1:%d/json/list" % port, timeout=2) as r:
                    targets = json.load(r)
                page = next(t for t in targets if t.get("type") == "page")
                # Guard against connecting to another agent's browser on a
                # colliding port: only a fresh about:blank tab is ours.
                if page.get("url") not in ("about:blank", ""):
                    raise SystemExit("DevTools port %d belongs to another browser (tab: %s)" % (port, page.get("url")))
                ws_url = page["webSocketDebuggerUrl"]
                break
            except Exception:
                time.sleep(0.5)
        if not ws_url:
            raise SystemExit("DevTools endpoint never came up")
        ws = websocket.create_connection(ws_url, timeout=60)
        mid = [0]

        def send(method, params=None):
            mid[0] += 1
            ws.send(json.dumps({"id": mid[0], "method": method, "params": params or {}}))
            while True:
                msg = json.loads(ws.recv())
                if msg.get("id") == mid[0]:
                    if "error" in msg:
                        raise SystemExit("CDP error %s: %s" % (method, msg["error"]))
                    return msg.get("result", {})

        def drain_until(event_name, timeout_s=30):
            ws.settimeout(timeout_s)
            end = time.time() + timeout_s
            while time.time() < end:
                try:
                    msg = json.loads(ws.recv())
                except Exception:
                    break
                if msg.get("method") == event_name:
                    return True
            return False

        send("Page.enable")
        send("Runtime.enable")
        send("Emulation.setDeviceMetricsOverride", {
            "width": width, "height": height, "deviceScaleFactor": 1, "mobile": width < 500,
        })
        send("Page.navigate", {"url": url})
        drain_until("Page.loadEventFired", 30)
        time.sleep(wait)
        metrics = send("Runtime.evaluate", {
            "expression": "JSON.stringify({sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh: document.documentElement.scrollHeight, ih: window.innerHeight, title: document.title, bodyText: document.body.innerText.slice(0, 120)})",
            "returnByValue": True,
        })
        print("metrics:", metrics["result"]["value"])
        params = {"format": "png"}
        if full:
            params["captureBeyondViewport"] = True
        shot = send("Page.captureScreenshot", params)
        data = base64.b64decode(shot["data"])
        open(out, "wb").write(data)
        print("wrote", out, len(data), "bytes")
        ws.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    main()
