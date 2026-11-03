@echo off
setlocal
cd /d "%~dp0"
if not exist .env (
  copy .env.example .env >nul
  echo Set DASHBOARD_PASSWORD in .env, then run again.
  exit /b 1
)
call npm ci --ignore-scripts || exit /b 1
call npm run build || exit /b 1
call npm start
