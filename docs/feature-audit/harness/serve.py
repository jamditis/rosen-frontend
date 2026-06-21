#!/usr/bin/env python3
"""Threaded static server for the feature-audit test harness.

Single-threaded http.server serializes the 13 MB data fetches when several
headless browsers load the site at once, producing timeouts that look like
real failures. ThreadingHTTPServer handles concurrent test browsers cleanly.
Binds to 127.0.0.1 only.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
directory = sys.argv[2] if len(sys.argv) > 2 else "."


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=directory, **kw)

    def log_message(self, *a):
        pass  # quiet


httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
print(f"threaded server on 127.0.0.1:{port} serving {directory}", flush=True)
httpd.serve_forever()
