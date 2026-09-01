from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from src.calibration import CalibrationController
from src.camera import CameraOpenError, create_video_source
from src.config import ConfigError, load_config, save_config
from src.counter import EntryCounter
from src.detector import DetectorError, PersonDetector
from src.sheets import SheetsClient
from src.storage import CountStorage
from src.ui import AppUi


WINDOW_NAME = "Conteo de ingresos"


def format_event_log(event) -> str:
    if event.kind == "crossed_a":
        return f"Track {event.track_id} crossed A"
    if event.kind == "crossed_b":
        return f"Track {event.track_id} crossed B"
    if event.kind == "entry":
        return f"Track {event.track_id} ENTRY CONFIRMED"
    if event.kind == "exit":
        return f"Track {event.track_id} EXIT / NOT COUNTED"
    if event.kind == "backed_out":
        return f"Track {event.track_id} backed out before entry"
    return event.message


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Demo local de conteo de ingresos por camara.")
    parser.add_argument("--config", default="config.json", help="Ruta del archivo config.json.")
    parser.add_argument(
        "--source",
        choices=["webcam", "ip_camera", "video_file", "phone_browser"],
        help="Fuente de video a usar.",
    )
    parser.add_argument("--camera-index", type=int, help="Indice de webcam, por ejemplo 0 o 1.")
    parser.add_argument("--url", help="URL de camara IP, por ejemplo http://192.168.1.50:8080/video.")
    parser.add_argument("--video-file", help="Ruta de un archivo .mp4 para pruebas repetibles.")
    parser.add_argument("--no-menu", action="store_true", help="No mostrar menu inicial en consola.")
    return parser.parse_args()


def apply_args(config: dict, args: argparse.Namespace) -> None:
    if args.source:
        config["source_type"] = args.source
    if args.camera_index is not None:
        config["camera_index"] = args.camera_index
        config["source_type"] = "webcam"
    if args.url:
        config["camera_url"] = args.url
        config["source_type"] = "ip_camera"
    if args.video_file:
        config["video_file"] = args.video_file
        config["source_type"] = "video_file"


def choose_source_menu(config: dict) -> None:
    print("")
    print("FUENTE DE VIDEO")
    print("1) Webcam 0")
    print("2) Webcam 1")
    print("3) Camara IP / app del celular")
    print("4) Archivo de video")
    print("5) Celular por navegador")
    print("")
    current = config.get("source_type", "webcam")
    choice = input(f"Selecciona fuente [Enter = actual: {current}]: ").strip()
    if not choice:
        return
    if choice == "1":
        config["source_type"] = "webcam"
        config["camera_index"] = 0
    elif choice == "2":
        config["source_type"] = "webcam"
        config["camera_index"] = 1
    elif choice == "3":
        config["source_type"] = "ip_camera"
        url = input("URL de la camara IP del celular: ").strip()
        if url:
            config["camera_url"] = url
    elif choice == "4":
        config["source_type"] = "video_file"
        path = input("Ruta del archivo .mp4: ").strip()
        if path:
            config["video_file"] = path
    elif choice == "5":
        config["source_type"] = "phone_browser"
    else:
        print("Opcion no reconocida; se conserva la configuracion actual.")


def print_runtime_help(source) -> None:
    print("")
    print("CONTROLES")
    print("Espacio: iniciar/detener conteo")
    print("C: calibrar")
    print("1: seleccionar LINE_A durante calibracion")
    print("2: seleccionar LINE_B durante calibracion")
    print("R: seleccionar ROI durante calibracion")
    print("0: reiniciar contador")
    print("Q o Esc: salir")
    print("")
    for message in source.start_messages:
        print(message)


def make_blank_frame(width: int, height: int, message: str):
    import cv2
    import numpy as np

    frame = np.zeros((height, width, 3), dtype=np.uint8)
    cv2.putText(frame, message[:80], (32, height // 2), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (230, 230, 230), 2)
    return frame


def main() -> int:
    args = parse_args()
    config_path = Path(args.config)

    try:
        config = load_config(config_path)
    except ConfigError as exc:
        print(f"Error en configuracion: {exc}")
        return 2

    apply_args(config, args)
    if not args.no_menu and not args.source and sys.stdin.isatty():
        choose_source_menu(config)
    config["camera_type"] = config.get("source_type", "webcam")
    save_config(config, config_path)

    try:
        import cv2
    except Exception as exc:
        print("No se pudo importar OpenCV. Instala dependencias con: pip install -r requirements.txt")
        print(str(exc))
        return 2

    source = create_video_source(config)
    try:
        source.open()
    except CameraOpenError as exc:
        print(f"No se pudo abrir la fuente de video: {exc}")
        return 2

    print_runtime_help(source)

    storage = CountStorage(Path("data/count.json"), config)
    counter = EntryCounter(
        initial_count=storage.count,
        ttl_frames=int(config.get("track_ttl_frames", 45)),
        entry_direction=str(config.get("entry_direction", "LEFT_TO_RIGHT")),
        line_orientation=str(config.get("line_orientation", "vertical")),
    )
    calibration = CalibrationController(config=config, config_path=config_path)
    sheets = SheetsClient(config)
    ui = AppUi(config)

    cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)
    pending_action = {"name": None}

    def on_mouse(event, x, y, flags, param):
        action = ui.handle_click(x, y)
        if action:
            pending_action["name"] = action
            return
        calibration.handle_mouse(event, x, y, flags)

    cv2.setMouseCallback(WINDOW_NAME, on_mouse)

    detector = None
    detector_error = ""
    running = bool(config.get("auto_start", True))
    frame_index = 0
    last_events = []
    last_source_message = ""
    last_debug_log_frame = -999999
    debug_metrics = {"detected_persons": 0, "active_tracks": 0, "entries_confirmed": storage.count}

    def set_running(value: bool) -> None:
        nonlocal running
        if running == value:
            return
        running = value
        if running:
            storage.start_session()
        else:
            storage.end_session()

    if running:
        storage.start_session()

    try:
        while True:
            if storage.rollover_if_needed():
                counter.reset(storage.count)

            frame_result = source.read()
            if frame_result.frame is None:
                frame = make_blank_frame(
                    int(config.get("frame_width", 1280)),
                    int(config.get("frame_height", 720)),
                    frame_result.message or "Esperando video...",
                )
            else:
                frame = frame_result.frame
            last_source_message = frame_result.message or detector_error

            calibration.ensure_defaults(frame.shape)

            detections = []
            if running and not calibration.active and not detector_error:
                if detector is None:
                    try:
                        detector = PersonDetector(config)
                        print(f"YOLO listo. Dispositivo: {detector.device}")
                    except DetectorError as exc:
                        detector_error = str(exc)
                        set_running(False)
                if detector is not None:
                    try:
                        detections = detector.detect(frame, calibration.roi)
                        debug_metrics["detected_persons"] = detector.last_stats.roi_person_detections
                        debug_metrics["active_tracks"] = detector.last_stats.active_tracks
                    except DetectorError as exc:
                        detector_error = str(exc)
                        set_running(False)

            if running and not calibration.active and detections:
                update = counter.update(
                    detections,
                    calibration.line_a,
                    calibration.line_b,
                    frame_index,
                    entry_direction=str(config.get("entry_direction", "LEFT_TO_RIGHT")),
                    line_orientation=str(config.get("line_orientation", "vertical")),
                )
                last_events = update.events
                if bool(config.get("debug", True)):
                    for event in update.events:
                        print(format_event_log(event))
                if update.increment:
                    entry_payloads = []
                    for event in update.events:
                        if event.kind != "entry":
                            continue
                        entry_payload = storage.record_entry(event, camera=str(config.get("camera_name", "CAMARA_01")))
                        entry_payloads.append(entry_payload)
                        sheets.send_entry(entry_payload)
                    counter.set_total(storage.count)
                    current_summary = storage.current_hour_summary()
                    sheets.send_hourly_summary(current_summary)
            elif not detections:
                last_events = []

            traffic_summary = storage.summary()
            debug_metrics["active_tracks"] = len(detections)
            debug_metrics["entries_confirmed"] = storage.count
            debug_metrics["last_1_minute"] = traffic_summary["last_1_minute"]
            debug_metrics["last_5_minutes"] = traffic_summary["last_5_minutes"]
            debug_metrics["live_rate_per_minute"] = traffic_summary["live_rate_per_minute"]
            debug_metrics["projected_people_per_hour"] = traffic_summary["projected_people_per_hour"]
            debug_metrics["current_bucket"] = traffic_summary["current_bucket"]
            debug_metrics["current_bucket_count"] = traffic_summary["current_bucket_count"]
            if (
                bool(config.get("debug", True))
                and detector is not None
                and frame_index - last_debug_log_frame >= int(config.get("debug_log_every_frames", 15))
            ):
                print(f"DETECTED persons: {debug_metrics['detected_persons']}")
                print(f"ACTIVE tracks: {debug_metrics['active_tracks']}")
                print(f"Last 1 min: {debug_metrics['last_1_minute']}")
                print(f"Last 5 min: {debug_metrics['last_5_minutes']}")
                print(f"Rate: {debug_metrics['live_rate_per_minute']}/min")
                print(f"Projection: {debug_metrics['projected_people_per_hour']}/hour")
                print(f"Bucket: {debug_metrics['current_bucket']}")
                last_debug_log_frame = frame_index

            canvas = ui.draw(
                frame=frame,
                detections=detections,
                total=storage.count,
                running=running,
                calibration=calibration,
                events=last_events,
                message=last_source_message,
                source=source,
                metrics=debug_metrics,
            )

            cv2.imshow(WINDOW_NAME, canvas)
            key = cv2.waitKey(1) & 0xFF
            action = pending_action["name"]
            pending_action["name"] = None

            if key in (27, ord("q"), ord("Q")):
                break
            if key == ord(" "):
                set_running(not running)
            elif key in (ord("c"), ord("C")):
                calibration.toggle()
            elif key == ord("0"):
                storage.reset_session_counter()
                counter.reset(storage.count)
            elif key != 255:
                calibration.handle_key(key)

            if action == "toggle_run":
                set_running(not running)
            elif action == "toggle_calibrate":
                calibration.toggle()
            elif action == "reset_counter":
                storage.reset_session_counter()
                counter.reset(storage.count)
            elif action == "config":
                print_runtime_help(source)

            frame_index += 1
            if not frame_result.ok:
                time.sleep(0.15)
    finally:
        storage.end_session()
        save_config(config, config_path)
        source.release()
        cv2.destroyAllWindows()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
