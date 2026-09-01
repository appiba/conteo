@echo off
cd /d "%~dp0"
echo.
echo Iniciando conteo con camara de computadora o celular...
echo.
echo 1. Espera a que se abra la ventana de Conteo.
echo 2. En la computadora abre: http://127.0.0.1:8765/
echo 3. En tu celular abre el link HTTPS que aparece en esta consola.
echo 4. Toca Iniciar y permite la camara.
echo.
".venv\Scripts\python.exe" main.py --source phone_browser --no-menu
pause
