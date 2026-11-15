@echo off
REM Chat_Safe - one-click setup and run for Windows.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node 20+ from https://nodejs.org/
  echo Then run this file again.
  pause
  exit /b 1
)

if not exist .env (
  if exist .env.example copy .env.example .env >nul
  echo Created .env - add your free GEMINI_API_KEY there for AI answers ^(optional^).
)

echo Running tests...
call npm test
if errorlevel 1 (
  echo Tests failed. Starting anyway...
)

echo.
echo Starting Chat_Safe on http://localhost:8080
echo Press Ctrl+C to stop.
start "" http://localhost:8080
node --env-file=.env server.js
if errorlevel 1 node server.js
pause
