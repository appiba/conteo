# Conteo de ingresos por camara

Demo local para contar ingresos de personas con Python, OpenCV, YOLO/Ultralytics y tracking temporal. No hace reconocimiento facial, no identifica personas y no guarda fotos ni video automaticamente.

## Link web

Cuando GitHub Pages termine de publicar, abre:

https://appiba.github.io/conteo/

Esa version web funciona desde celular o computadora usando la camara del navegador. La version Python sigue siendo la opcion local con YOLO/OpenCV.

En iPhone, si el link se abre desde WhatsApp y aparece un bloqueo de camara, toca `Abrir en Safari/Chrome` dentro de la app o copia el link y pegalo directamente en Safari. Luego permite la camara desde el aviso del navegador.

## Instalar

En Windows, con Python 3.10 o superior:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Tambien puedes usar:

```powershell
.\scripts\install.ps1
```

## Ejecutar

```powershell
.\.venv\Scripts\python.exe main.py
```

Si tienes `python` instalado globalmente:

```powershell
python main.py
```

Al iniciar aparece un menu para escoger fuente. Tambien puedes saltar el menu con argumentos:

```powershell
python main.py --source webcam --camera-index 0
python main.py --source ip_camera --url http://192.168.1.50:8080/video
python main.py --source video_file --video-file C:\videos\entrada.mp4
python main.py --source phone_browser
```

## Probar con la camara del celular

Hay dos formas:

1. `phone_browser`: ejecuta `python main.py --source phone_browser`. El programa mostrara una URL local, por ejemplo `https://192.168.1.20:8765/`. Abrela en el celular, acepta el aviso del certificado local si aparece, presiona `Iniciar` y concede permiso de camara. La computadora recibira los frames y hara el conteo.
2. `ip_camera`: instala una app de camara IP en el celular, inicia el servidor de video y copia la URL tipo `http://192.168.x.x:xxxx/video`. Luego usa `python main.py --source ip_camera --url TU_URL`.

El celular y la computadora deben estar en la misma red Wi-Fi. Algunos navegadores moviles bloquean camara si no es HTTPS; por eso el modo `phone_browser` intenta crear un certificado local automaticamente. Si el navegador aun lo bloquea, usa el modo `ip_camera`.

## Calibrar LINE_A, LINE_B y ROI

En la ventana principal:

- `C`: entrar o salir de calibracion.
- `1`: seleccionar `LINE_A`.
- `2`: seleccionar `LINE_B`.
- `R`: seleccionar la zona de deteccion `ROI`.
- `V`: usar lineas verticales.
- `H`: usar lineas horizontales.
- `D`: cambiar direccion de ingreso.
- `X`: intercambiar `LINE_A` y `LINE_B`.
- Arrastra con el mouse sobre el video para ubicar la linea o la ROI. Con lineas verticales se mueven izquierda/derecha; con lineas horizontales se mueven arriba/abajo. `LINE_A` debe quedar del lado de origen y `LINE_B` del lado de destino.
- `S`: guardar en `config.json`.

La logica usa el punto inferior-central de la persona. Con lineas verticales evalua movimiento en X; con lineas horizontales evalua movimiento en Y. La unica entrada valida es `LINE_A` y luego `LINE_B` con el mismo `track_id`. Si cruza `LINE_B` y luego `LINE_A`, se considera salida y no suma.

En el enlace web, entra a `Calibrar` para usar los botones `Linea A`, `Linea B` y `Zona`. Los cambios quedan como borrador hasta presionar `Guardar`; `Cancelar` descarta cambios y `Restaurar` vuelve a los valores iniciales con confirmacion. La separacion minima entre A y B es 5% del eje usado.

## Precision con grupos

La configuracion esta ajustada para priorizar precision de conteo sobre FPS: `confidence` 0.30, `iou` 0.70, inferencia `imgsz` 960, modelo `yolov8s.pt` y ByteTrack con buffer de 60 frames para tolerar oclusiones breves. En modo debug se muestran `PERSONAS DETECTADAS`, `TRACKS ACTIVOS` y `ENTRADAS CONFIRMADAS`.

En el enlace web tambien aparece un campo `Conteo real` para pruebas manuales. Escribe cuantas personas entraron realmente y la app calcula la precision contra el conteo del sistema.

## Registro horario y ritmo

Cada entrada confirmada guarda un evento anonimo con timestamp en `America/Guayaquil`, camara, `track_id` temporal, grupo etario si esta disponible, total acumulado, intervalo contra la entrada anterior, franja horaria y minuto. No se guardan rostros, fotos ni video.

El sistema calcula en tiempo real total del dia, conteo por franja, ultimos 5/15/30 minutos, ritmo personas/minuto, proyeccion personas/hora, hora pico, menor hora con camara activa, cobertura de camara por franja, estimado de hora completa, maximo por minuto y tamano promedio/maximo de grupos.

El boton `REINICIAR` solo reinicia la sesion de conteo y conserva el historial. Para borrar datos del dia se debe usar la accion de borrado con confirmacion.

## Controles

- `Espacio`: iniciar/detener conteo.
- `0`: reiniciar contador.
- `Q` o `Esc`: salir.
- Botones en pantalla: `INICIAR/DETENER`, `CALIBRAR`, `RESET`, `CONFIG`.

El contador diario se guarda en `data/count.json`. Si cambia el dia, se reinicia automaticamente.

## Google Sheets

El demo funciona completo de manera local. Para registrar despues en Google Sheets:

1. Crea una hoja de calculo.
2. Abre Apps Script y pega `google-apps-script/Code.gs`.
3. Publica el script como Web App.
4. Copia la URL en `config.json` como `apps_script_url`.
5. Cambia `google_sheets_enabled` a `true`.

Apps Script solo recibe eventos ya contados; no procesa video.

## Privacidad

El sistema usa deteccion anonima de personas y tracking temporal por frame. No hace reconocimiento facial, no almacena rostros, no guarda capturas y no graba video automaticamente.
