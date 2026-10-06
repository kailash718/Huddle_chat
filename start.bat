@echo off
title Huddle server
cd /d "%~dp0"
if not exist node_modules (
  echo First run: installing server, please wait...
  call npm install
)
if not exist client\dist\index.html (
  echo Building the React frontend, please wait...
  call npm run build
)
node server.js
pause
