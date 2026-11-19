"""Tiny local web server for the project.

Run it from anywhere:   python3 js/server.py
Then open:              http://localhost:8000
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8000
ROOT = Path(__file__).resolve().parent.parent  # the project folder (one level above js/)

# Browsers only run JavaScript modules if they are sent with the right type.
SimpleHTTPRequestHandler.extensions_map[".js"] = "text/javascript"

handler = partial(SimpleHTTPRequestHandler, directory=ROOT)
print(f"Serving {ROOT} on http://localhost:{PORT}  (Ctrl+C to stop)")
ThreadingHTTPServer(("localhost", PORT), handler).serve_forever()
