#!/usr/bin/env bash
# Chat_Safe — one-click setup and run for macOS / Linux.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node 20+ from https://nodejs.org/ and run this file again."
  exit 1
fi

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "Created .env — add your free GEMINI_API_KEY there for AI answers (optional)."
fi

echo "Running tests..."
npm test

echo ""
echo "Starting Chat_Safe on http://localhost:8080"
echo "Press Ctrl+C to stop."
if node -e "process.exit(process.version.split('.')[0].slice(1) >= 20 ? 0 : 1)"; then
  node --env-file=.env server.js 2>/dev/null || node server.js
else
  node server.js
fi
