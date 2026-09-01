from __future__ import annotations

import ipaddress
import json
import socket
import ssl
import threading
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class PhoneFrameBuffer:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._frame = None
        self._received = 0
        self._last_timestamp = 0.0

    def set_jpeg(self, jpeg_bytes: bytes) -> None:
        import cv2
        import numpy as np

        array = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        frame = cv2.imdecode(array, cv2.IMREAD_COLOR)
        if frame is None:
            return
        with self._lock:
            self._frame = frame
            self._received += 1
            self._last_timestamp = datetime.now().timestamp()

    def latest(self):
        with self._lock:
            return None if self._frame is None else self._frame.copy()

    @property
    def received(self) -> int:
        with self._lock:
            return self._received


class PhoneCameraServer:
    def __init__(
        self,
        host: str,
        port: int,
        https_enabled: bool = True,
        buffer: PhoneFrameBuffer | None = None,
    ) -> None:
        self.host = host
        self.port = port
        self.https_enabled = https_enabled
        self.buffer = buffer or PhoneFrameBuffer()
        self.httpd: ThreadingHTTPServer | None = None
        self.thread: threading.Thread | None = None
        self.scheme = "http"
        self.warning = ""
        self.local_url = ""
        self.lan_url = ""

    def start(self) -> None:
        handler = self._make_handler()
        self.httpd = ThreadingHTTPServer((self.host, self.port), handler)
        self.httpd.daemon_threads = True

        local_ip = get_lan_ip()
        if self.https_enabled:
            try:
                cert_file, key_file = ensure_self_signed_cert(Path("data/certs"), local_ip)
                context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                context.load_cert_chain(str(cert_file), str(key_file))
                self.httpd.socket = context.wrap_socket(self.httpd.socket, server_side=True)
                self.scheme = "https"
            except Exception as exc:
                self.warning = (
                    "HTTPS local no disponible; se usara HTTP. "
                    "Algunos celulares bloquean la camara del navegador en HTTP. "
                    f"Detalle: {exc}"
                )
                self.scheme = "http"

        self.local_url = f"{self.scheme}://127.0.0.1:{self.port}/"
        self.lan_url = f"{self.scheme}://{local_ip}:{self.port}/"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def stop(self) -> None:
        if self.httpd is not None:
            self.httpd.shutdown()
            self.httpd.server_close()
            self.httpd = None

    def _make_handler(self):
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format, *args):  # noqa: A002
                return

            def do_OPTIONS(self):
                self.send_response(HTTPStatus.NO_CONTENT)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.end_headers()

            def do_GET(self):
                if self.path in ("/", "/index.html"):
                    self._send_static_file("docs/index.html", "text/html; charset=utf-8", PHONE_PAGE)
                    return
                if self.path == "/styles.css":
                    self._send_static_file("docs/styles.css", "text/css; charset=utf-8")
                    return
                if self.path == "/app.js":
                    self._send_static_file("docs/app.js", "application/javascript; charset=utf-8")
                    return
                if self.path == "/health":
                    self._send_json({"ok": True, "frames": outer.buffer.received})
                    return
                self.send_error(HTTPStatus.NOT_FOUND, "Not found")

            def do_POST(self):
                if self.path != "/frame":
                    self.send_error(HTTPStatus.NOT_FOUND, "Not found")
                    return
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0:
                    self.send_error(HTTPStatus.BAD_REQUEST, "Missing image")
                    return
                outer.buffer.set_jpeg(self.rfile.read(length))
                self._send_json({"ok": True, "frames": outer.buffer.received})

            def _send_html(self, html: str):
                body = html.encode("utf-8")
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def _send_static_file(self, path: str, content_type: str, fallback: str | None = None):
                file_path = Path(path)
                if file_path.exists():
                    body = file_path.read_bytes()
                elif fallback is not None:
                    body = fallback.encode("utf-8")
                else:
                    self.send_error(HTTPStatus.NOT_FOUND, "Not found")
                    return
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def _send_json(self, data: dict):
                body = json.dumps(data).encode("utf-8")
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        return Handler


def get_lan_ip() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"


def ensure_self_signed_cert(cert_dir: Path, local_ip: str) -> tuple[Path, Path]:
    cert_dir.mkdir(parents=True, exist_ok=True)
    cert_file = cert_dir / "phone-camera-cert.pem"
    key_file = cert_dir / "phone-camera-key.pem"
    if cert_file.exists() and key_file.exists():
        return cert_file, key_file

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name(
        [
            x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Conteo Local"),
            x509.NameAttribute(NameOID.COMMON_NAME, "conteo-local"),
        ]
    )
    alt_names = [x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]
    try:
        alt_names.append(x509.IPAddress(ipaddress.ip_address(local_ip)))
    except ValueError:
        pass

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc) - timedelta(minutes=1))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=365))
        .add_extension(x509.SubjectAlternativeName(alt_names), critical=False)
        .sign(key, hashes.SHA256())
    )

    key_file.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    cert_file.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    return cert_file, key_file


PHONE_PAGE = """<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Camara celular - Conteo</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #101418; color: #f5f7fa; }
    main { min-height: 100vh; display: grid; grid-template-rows: auto 1fr auto; }
    header, footer { padding: 14px 16px; background: #151b22; }
    h1 { margin: 0; font-size: 20px; }
    video { width: 100%; height: 100%; object-fit: cover; background: #050608; }
    .controls { display: flex; gap: 10px; flex-wrap: wrap; }
    button, select { font: inherit; min-height: 44px; border: 0; border-radius: 8px; padding: 0 14px; }
    button { background: #2f80ed; color: white; font-weight: 700; }
    button.secondary { background: #26313d; }
    p { margin: 6px 0 0; color: #c9d1d9; font-size: 14px; }
    #status { color: #8ee6a1; }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Camara del celular</h1>
    <p id="status">Listo para iniciar.</p>
  </header>
  <video id="preview" playsinline muted autoplay></video>
  <footer>
    <div class="controls">
      <select id="cameraFacing">
        <option value="environment">Trasera</option>
        <option value="user">Frontal</option>
      </select>
      <button id="start">Iniciar</button>
      <button id="stop" class="secondary">Detener</button>
    </div>
    <p>Deja esta pantalla abierta. El conteo se procesa en la computadora.</p>
  </footer>
</main>
<canvas id="canvas" width="1280" height="720" hidden></canvas>
<script>
const video = document.getElementById("preview");
const canvas = document.getElementById("canvas");
const statusEl = document.getElementById("status");
const facing = document.getElementById("cameraFacing");
let stream = null;
let timer = null;
let busy = false;

function setStatus(text) { statusEl.textContent = text; }

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("El navegador no permite acceso a camara en este origen.");
    return;
  }
  stopCamera();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facing.value },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    video.srcObject = stream;
    await video.play();
    timer = setInterval(sendFrame, 100);
    setStatus("Enviando video a la computadora...");
  } catch (error) {
    setStatus("No se pudo abrir la camara: " + error.message);
  }
}

function stopCamera() {
  if (timer) clearInterval(timer);
  timer = null;
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  busy = false;
}

function sendFrame() {
  if (!stream || busy || video.videoWidth === 0) return;
  busy = true;
  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(async blob => {
    try {
      await fetch("/frame", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
      setStatus("Enviando frames...");
    } catch (error) {
      setStatus("Conexion perdida: " + error.message);
    } finally {
      busy = false;
    }
  }, "image/jpeg", 0.72);
}

document.getElementById("start").addEventListener("click", startCamera);
document.getElementById("stop").addEventListener("click", () => { stopCamera(); setStatus("Detenido."); });
</script>
</body>
</html>
"""
