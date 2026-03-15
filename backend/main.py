"""
Trace AI — FastAPI Backend
"""

import os
import time
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

import blockchain
import opengradient_agent

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="Trace AI API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class AnalyzeRequest(BaseModel):
    address: str


@app.get("/health")
def health():
    return {"status": "ok", "timestamp": int(time.time() * 1000)}


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    address = req.address.strip()
    if not address:
        raise HTTPException(status_code=400, detail="address is required")

    logger.info("Analyzing %s...", address[:12])

    try:
        # Detect chain
        chain = blockchain.detect_chain(address)

        # Fetch transactions
        if chain == "solana":
            transactions = blockchain.fetch_solana_transactions(address, os.getenv("HELIUS_API_KEY", ""))
        else:
            transactions = blockchain.fetch_evm_transactions(address, os.getenv("ETHERSCAN_API_KEY", ""), chain)

        # Build graph
        graph_data, graph_summary = blockchain.build_graph(address, chain, transactions)

        # AI analysis (OG TEE or heuristic fallback)
        ai = await opengradient_agent.analyze(address, transactions, graph_summary)
        result  = ai["result"]
        proof   = ai["proof"]
        source  = ai["source"]

        # Build connected wallets list from graph nodes
        connected_wallets = [
            {
                "address":    n["address"],
                "chain":      n["chain"],
                "riskLevel":  n["riskLevel"],
                "nodeType":   n["nodeType"],
                "txCount":    n.get("txCount", 0),
                "label":      n.get("label"),
                "tags":       n.get("tags", []),
            }
            for n in graph_data["nodes"]
            if not n.get("isTarget", False)
        ]

        # Recent transactions (most recent 15)
        recent_txns = sorted(transactions, key=lambda t: t.get("timestamp", 0), reverse=True)[:15]

        return {
            "targetAddress":      address,
            "chain":              chain,
            "analyzedAt":         int(time.time() * 1000),
            "riskScore":          result["risk_score"],
            "riskLevel":          result["risk_level"],
            "sybilProbability":   result["sybil_probability"],
            "explanation":        result["explanation"],
            "signals":            result.get("signals", []),
            "connectedWallets":   connected_wallets,
            "recentTransactions": recent_txns,
            "graph":              graph_data,
            "proof": {
                "workflowAddress":  proof["workflowAddress"],
                "executionTxHash":  proof["executionTxHash"],
                "modelId":          proof["modelId"],
                "inputHash":        proof["inputHash"],
                "outputHash":       proof["outputHash"],
                "timestamp":        int(time.time() * 1000),
                "teeProvider":      proof["teeProvider"],
                "rawProof":         proof.get("rawProof", {}),
                "verifiable":       proof.get("verifiable", False),
            },
            "dataSource": "live" if source == "opengradient_tee" else "demo",
        }

    except Exception as e:
        logger.error("Analysis failed for %s: %s", address[:12], e)
        # Return demo-like data so UI never shows a blank error
        raise HTTPException(status_code=500, detail=str(e))
