# Trace AI — Verifiable Wallet Intelligence

A TRM Labs-style fund-flow tracker and Sybil detection tool powered by OpenGradient TEE-verified AI.

**Paste any wallet → see every connected wallet → get a cryptographically verifiable risk score.**

---

## Quick start (local)

```bash
# 1. Clone / unzip the project, then:
chmod +x start-local.sh
./start-local.sh

# Frontend → http://localhost:3000
# Backend  → http://localhost:8000
# API docs → http://localhost:8000/docs
```

Works in **demo mode** with zero API keys. Add keys to `backend/.env` for live blockchain data.

---

## Project structure

```
trace-ai/
├── .cursor/rules              ← Cursor AI rules
├── .env.example               ← copy to backend/.env and fill in keys
├── start-local.sh             ← starts both servers with one command
├── frontend/                  ← Next.js 15 + TypeScript + Tailwind
│   ├── app/
│   │   ├── page.tsx           ← homepage (search)
│   │   └── analyze/[address]/ ← results page
│   ├── components/
│   │   ├── FundFlowGraph.tsx  ← canvas graph engine
│   │   ├── RiskCard.tsx       ← risk score + signals
│   │   ├── ProofViewer.tsx    ← TEE proof display
│   │   └── WalletList.tsx     ← connected wallets table
│   └── lib/
│       ├── types.ts           ← all TypeScript interfaces
│       └── api.ts             ← backend client + demo data fallback
└── backend/
    ├── main.py                ← FastAPI: POST /analyze, GET /health
    ├── blockchain.py          ← Etherscan + Helius fetchers
    ├── opengradient_agent.py  ← OpenGradient SDK + heuristic fallback
    ├── deploy_workflow.py     ← run once to deploy OG workflow
    └── requirements.txt
```

---

## API keys (all free)

| Key | Link |
|-----|------|
| Etherscan | etherscan.io/apis |
| Helius (Solana) | helius.dev |
| OpenGradient | hub.opengradient.ai |
| OG Testnet tokens | faucet.opengradient.ai |

Add them to `backend/.env` — copy from `.env.example`.

---

## Deploy OpenGradient workflow

Run this once after adding your `OG_PRIVATE_KEY` to `backend/.env`:

```bash
cd backend
source venv/bin/activate
python deploy_workflow.py
```

Copy the printed contract address into `backend/.env` as `OG_WORKFLOW_ADDRESS`.

---

## Deploy to production

**Frontend → Vercel**
1. Push to GitHub
2. Import repo on vercel.com, set root directory to `frontend`
3. Add env var: `NEXT_PUBLIC_BACKEND_URL=https://your-backend-url.com`

**Backend → Railway**
1. Import repo on railway.app, set root directory to `backend`
2. Add all env vars from `backend/.env`
3. Copy the Railway URL into Vercel's `NEXT_PUBLIC_BACKEND_URL`

---

## Tech stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS
- **Graph**: Custom Canvas API force-directed engine (no D3/Cytoscape)
- **Backend**: Python FastAPI
- **AI**: OpenGradient SDK (Llama 3.1 8B in TEE mode)
- **Blockchain**: Etherscan API (EVM), Helius API (Solana)
- **Fonts**: Syne, Space Mono, DM Sans
