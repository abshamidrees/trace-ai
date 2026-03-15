#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Trace AI — Local development launcher
# Starts both frontend (Next.js :3000) and backend (FastAPI :8000)
# ─────────────────────────────────────────────────────────────────────────────

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  Trace AI — Starting local environment"
echo "  ──────────────────────────────────────"

# ── Dependency checks ─────────────────────────────────────────────────────────
command -v node    >/dev/null 2>&1 || { echo "  node not found — install from nodejs.org"; exit 1; }
command -v npm     >/dev/null 2>&1 || { echo "  npm not found"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "  python3 not found — install from python.org"; exit 1; }

# ── Copy .env if it doesn't exist ─────────────────────────────────────────────
if [ ! -f "$ROOT/backend/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/backend/.env"
  echo ""
  echo "  Created backend/.env from .env.example"
  echo "  Add your API keys there for live data (optional — demo mode works without them)"
fi

# ── Frontend ──────────────────────────────────────────────────────────────────
echo ""
echo "  [1/2] Frontend → http://localhost:3000"
cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
  echo "  Installing npm packages..."
  npm install --silent
fi
npm run dev &
FRONTEND_PID=$!

# ── Backend ───────────────────────────────────────────────────────────────────
echo "  [2/2] Backend  → http://localhost:8000"
cd "$ROOT/backend"
if [ ! -d venv ]; then
  echo "  Creating Python virtual environment..."
  python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt -q
uvicorn main:app --reload --port 8000 --log-level warning &
BACKEND_PID=$!

# ── Ready ─────────────────────────────────────────────────────────────────────
echo ""
echo "  ──────────────────────────────────────────────"
echo "  Frontend : http://localhost:3000"
echo "  Backend  : http://localhost:8000"
echo "  API docs : http://localhost:8000/docs"
echo ""
echo "  Works in demo mode without any API keys."
echo "  Edit backend/.env to add real keys."
echo "  ──────────────────────────────────────────────"
echo ""
echo "  Press Ctrl+C to stop."

trap "kill $FRONTEND_PID $BACKEND_PID 2>/dev/null; echo ''; echo '  Stopped.'; echo ''" EXIT
wait
