@echo off
cd /d "%~dp0"
echo.
echo Iniciando conteo con camara de computadora o celular...
echo.
echo LINK COMPU:
echo http://127.0.0.1:8765/
echo.
echo LINK CELULAR:
echo Mira el link HTTPS que aparece abajo cuando arranque el programa.
echo.
".venv\Scripts\python.exe" main.py --source phone_browser --no-menu
pause
