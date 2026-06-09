# -*- coding: utf-8 -*-
# 喷头底板配置 UI 的本地小服务
#   GET  /                -> config-ui.html
#   GET  /params          -> 返回 inkjet-baseplate-params.json
#   POST /params          -> 写回 inkjet-baseplate-params.json (校验 JSON)
# 运行: python serve.py   然后浏览器打开 http://127.0.0.1:8765/
import http.server, socketserver, json, os

DIR = os.path.dirname(os.path.abspath(__file__))
PARAMS = os.path.join(DIR, "inkjet-baseplate-params.json")
PORT = 8080

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DIR, **k)

    def _json(self, code, raw):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw if isinstance(raw, bytes) else raw.encode("utf-8"))

    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/params":
            with open(PARAMS, "rb") as f:
                self._json(200, f.read())
            return
        if p in ("/", ""):
            self.path = "/config-ui.html"
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] == "/params":
            try:
                n = int(self.headers.get("Content-Length", 0))
                data = json.loads(self.rfile.read(n).decode("utf-8"))
                with open(PARAMS, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                self._json(200, '{"ok":true}')
            except Exception as e:
                self._json(400, json.dumps({"ok": False, "err": str(e)}))
            return
        self.send_error(404)

    def log_message(self, *a):
        pass

if __name__ == "__main__":
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H) as httpd:
        print("喷头底板配置 UI: http://127.0.0.1:%d/" % PORT)
        httpd.serve_forever()
