#!/usr/bin/env python3
"""
Local preview server for the maintained TWC fork.

Serves the local src/ tree as static files and proxies /transmission/rpc to a
real Transmission daemon. Because both the page and the RPC endpoint share this
origin, the browser sees no cross-origin request and the existing relative
`../rpc` path in transmission.js works unchanged.

Nothing is written to the daemon: this is a preview harness only.

Usage:
    python3 preview-server.py [--port 8901] [--upstream 192.168.1.2:9091]
Then open http://127.0.0.1:8901/
"""

import argparse
import http.server
import os
import socketserver
import sys
import urllib.error
import urllib.request

# The daemon usually lives on the LAN. When this script is launched from a shell
# that exports HTTP_PROXY (e.g. a proxy on 127.0.0.1:7899), urllib would route
# LAN traffic through the proxy and the daemon answers 502. Bypass proxies
# entirely: this harness only ever talks to one known host.
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")
UPSTREAM = "192.168.1.2:9091"
PORT = 8901

# Headers that must not be forwarded verbatim in either direction.
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, format, *args):
        # Quieter logs: only record RPC traffic, not every static asset.
        # args[0] is a string for normal requests but an int from log_error().
        try:
            first = args[0] if args else ""
            if isinstance(first, str) and "/rpc" in first:
                sys.stderr.write("[rpc] %s\n" % (format % args))
        except Exception:
            pass

    # ---- RPC proxy -------------------------------------------------------
    def _proxy(self, method):
        # The page is served from "/", so transmission.js's relative "../rpc"
        # resolves to "/rpc". Map both forms onto the daemon's real endpoint.
        path = self.path
        if path == "/rpc" or path.startswith("/rpc?"):
            path = "/transmission/rpc"
        url = "http://%s%s" % (UPSTREAM, path)

        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None

        req = urllib.request.Request(url, data=body, method=method)
        # Forward only the headers the RPC endpoint actually needs. Blindly
        # copying every client header causes the daemon to reject the request
        # (observed as an upstream 502 through Synology's nginx).
        req.add_header("Content-Type", "application/json")
        sid = self.headers.get("X-Transmission-Session-Id")
        if sid:
            req.add_header("X-Transmission-Session-Id", sid)
        auth = self.headers.get("Authorization")
        if auth:
            req.add_header("Authorization", auth)

        try:
            with _OPENER.open(req, timeout=30) as resp:
                status = resp.status
                payload = resp.read()
                resp_headers = list(resp.headers.items())
        except urllib.error.HTTPError as e:
            # 409 carries the session id; it must reach the browser intact.
            status = e.code
            payload = e.read()
            resp_headers = list(e.headers.items())
        except Exception as e:
            import traceback
            detail = traceback.format_exc()
            sys.stderr.write("[proxy-error] %s\n%s\n" % (e, detail))
            sys.stderr.flush()
            self.send_error(502, "upstream error: %r" % (e,))
            return

        self.send_response(status)
        for key, value in resp_headers:
            if key.lower() not in HOP_BY_HOP:
                self.send_header(key, value)
        self.send_header("Content-Length", str(len(payload)))
        # Allow the preview page to call the proxied RPC even if the browser
        # decides it is cross-origin (e.g. opened as localhost vs 127.0.0.1).
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Expose-Headers", "X-Transmission-Session-Id")
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        if self.path.startswith("/transmission/rpc") or self.path == "/rpc" or self.path.startswith("/rpc?"):
            self._proxy("POST")
        else:
            self.send_error(405)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "X-Transmission-Session-Id")
        self.end_headers()

    def end_headers(self):
        # Never let the browser cache the preview build.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def selftest():
    """Start the server in a thread, hit it once, print everything, exit."""
    import threading
    import time

    srv = Server(("127.0.0.1", PORT), Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    time.sleep(0.5)

    print("--- selftest: static ---")
    with urllib.request.urlopen("http://127.0.0.1:%d/index.html" % PORT, timeout=5) as r:
        print("  index.html ->", r.status, len(r.read()), "bytes")

    print("--- selftest: rpc proxy (expect 409 + session id) ---")
    req = urllib.request.Request(
        "http://127.0.0.1:%d/transmission/rpc" % PORT,
        data=b"{}", method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            print("  unexpected success:", r.status)
    except urllib.error.HTTPError as e:
        sid = e.headers.get("X-Transmission-Session-Id")
        print("  status:", e.code)
        print("  session id:", "OK" if sid else "MISSING")
        if sid:
            req2 = urllib.request.Request(
                "http://127.0.0.1:%d/transmission/rpc" % PORT,
                data=b'{"method":"session-get"}', method="POST")
            req2.add_header("X-Transmission-Session-Id", sid)
            with urllib.request.urlopen(req2, timeout=15) as r2:
                import json
                d = json.loads(r2.read())
                print("  session-get:", d.get("result"),
                      "| version:", d.get("arguments", {}).get("version"))

    time.sleep(0.3)
    srv.shutdown()
    print("--- selftest done ---")


def main():
    global UPSTREAM, PORT
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="0.0.0.0",
                    help="bind address (default 0.0.0.0, LAN-reachable)")
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--upstream", default=UPSTREAM)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    PORT, UPSTREAM, HOST = args.port, args.upstream, args.host

    if not os.path.isdir(ROOT):
        sys.exit("src/ not found next to this script: %s" % ROOT)

    if args.selftest:
        selftest()
        return

    print("Serving : %s" % ROOT)
    print("Proxying: /transmission/rpc -> http://%s/transmission/rpc" % UPSTREAM)
    print("Binding : %s:%d" % (HOST, PORT))
    print("Ctrl-C to stop.\n")

    with Server((HOST, PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()
