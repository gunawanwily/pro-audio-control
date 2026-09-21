@echo off
cd /d "%~dp0"
if exist node_modules\electron\dist\electron.exe (
  node_modules\.bin\electron.cmd .
) else (
  echo Dependencies belum tersedia. Jalankan INSTALL-PRO-AUDIO-CONTROL.bat terlebih dahulu.
  pause
)
