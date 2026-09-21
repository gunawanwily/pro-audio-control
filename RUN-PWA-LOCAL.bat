@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (
  start "PRO AUDIO CONTROL PWA" http://127.0.0.1:8787/
  py -m http.server 8787
  goto :eof
)
where python >nul 2>&1
if %errorlevel%==0 (
  start "PRO AUDIO CONTROL PWA" http://127.0.0.1:8787/
  python -m http.server 8787
  goto :eof
)
echo Python tidak ditemukan.
echo Untuk PWA gunakan hosting HTTPS seperti GitHub Pages.
pause
