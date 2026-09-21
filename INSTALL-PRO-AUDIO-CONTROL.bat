@echo off
setlocal
cd /d "%~dp0"
echo ================================================
echo   PRO AUDIO CONTROL v16.0 - WINDOWS SETUP
 echo ================================================
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js belum terpasang.
  echo Silakan install Node.js LTS dari nodejs.org lalu jalankan file ini lagi.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo NPM tidak ditemukan. Install Node.js LTS terlebih dahulu.
  pause
  exit /b 1
)
echo Installing application dependencies...
npm install
if errorlevel 1 (
  echo Gagal menjalankan npm install.
  pause
  exit /b 1
)
echo.
echo Membuat installer Windows...
npm run dist
if errorlevel 1 (
  echo Proses build gagal.
  pause
  exit /b 1
)
echo.
echo Selesai. Cek folder dist untuk file installer/portable.
pause
