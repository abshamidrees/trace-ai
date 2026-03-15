"""
OpenGradient TEE Agent
──────────────────────
Runs Sybil detection + risk scoring inside a Trusted Execution Environment.
Every inference is cryptographically verifiable on-chain.

Setup:
  1. Install the OG Claude Code plugin:
       claude plugin marketplace add https://github.com/OpenGradient/claude-plugins
  2. Deploy this workflow from Claude Code:
       /opengradient deploy --model meta-llama/Llama-3.1-8B-Instruct --mode tee --name trace-ai-sybil
  3. Copy the returned contract address → set OG_WORKFLOW_ADDRESS in .env
  4. Get OG tokens from faucet: https://faucet.opengradient.ai/
"""

import os
import json
import logging
import hashlib
from typing import Any

logger = logging.getLogger(__name__)

# ── Try importing the OpenGradient SDK ────────────────────────────────────────
# Force real TEE mode using your deployed contract
import opengradient as og
OG_AVAILABLE = True

# Use the contract address from .env (no more SDK calls for now)
workflow_address = os.getenv("OG_WORKFLOW_ADDRESS")
if workflow_address:
    logger.info(f"Using deployed TEE workflow: {workflow_address}")
# ── System prompt for the TEE model ──────────────────────────────────────────
SYSTEM_PROMPT = """You are a blockchain forensics AI specialising in Sybil detection and wallet risk analysis.

Analyse the wallet transaction data provided and return ONLY a valid JSON object — no preamble, no markdown, no explanation outside the JSON.

JSON shape (strict):
{
  "risk_score": <integer 0-100>,
  "risk_level": <"high"|"medium"|"low">,
  "sybil_probability": <float 0.0-1.0>,
  "explanation": <string, 1-3 sentences, plain English>,
  "signals": [
    {
      "label": <string>,
      "severity": <"high"|"medium"|"low">,
      "description": <string, 1 sentence>
    }
  ]
}

Scoring guide:
- 70-100: Strong Sybil indicators (coordinated timing, micro-tx bursts, mixer funding, cluster patterns)
- 42-69:  Moderate risk (bridge clustering, automated timing, some flagged connections)
- 0-41:   Low risk (organic patterns, clean funding, irregular human-like timing)
"""

# ── Known risky contract patterns ────────────────────────────────────────────
MIXER_PATTERNS   = ['tornado', 'mixer', 'tumbler', '0xd90e2f925', '0x722122df']
BRIDGE_PROTOCOLS = ['layerzero', 'relay', 'jumper', 'stargate', 'across', 'hop', 'lifi']
KNOWN_EXCHANGES  = ['binance', 'coinbase', 'kraken', 'okx', 'bybit', 'gate.io', 'kucoin']


def _build_prompt(address: str, transactions: list[dict], graph_summary: dict) -> str:
    """Build a concise prompt from transaction data."""
    n_tx       = len(transactions)
    n_wallets  = len(set(t.get('to','') for t in transactions) | set(t.get('from','') for t in transactions)) - 1
    bridges    = [t for t in transactions if t.get('bridgeProtocol')]
    n_bridges  = len(bridges)

    # Timing analysis — detect bot-like regularity
    timestamps = sorted(t.get('timestamp',0) for t in transactions if t.get('timestamp'))
    intervals  = [timestamps[i+1]-timestamps[i] for i in range(len(timestamps)-1)] if len(timestamps)>1 else []
    avg_interval_s = (sum(intervals)/len(intervals)/1000) if intervals else 0
    has_tight_timing = avg_interval_s < 60 and len(intervals) > 3

    # Mixer proximity
    tx_inputs = ' '.join(t.get('input','') for t in transactions).lower()
    has_mixer = any(p in tx_inputs for p in MIXER_PATTERNS)

    summary = {
        "target_address": address[:10] + "...",
        "total_transactions": n_tx,
        "unique_counterparties": n_wallets,
        "bridge_transactions": n_bridges,
        "bridge_protocols_used": list({t.get('bridgeProtocol') for t in bridges if t.get('bridgeProtocol')}),
        "average_tx_interval_seconds": round(avg_interval_s, 1),
        "automated_timing_detected": has_tight_timing,
        "mixer_adjacent_funding": has_mixer,
        "graph_depth": graph_summary.get('max_depth', 1),
        "high_risk_neighbours": graph_summary.get('high_risk_count', 0),
    }

    return f"Analyse this wallet:\n\n{json.dumps(summary, indent=2)}"


def _heuristic_score(address: str, transactions: list[dict], graph_summary: dict) -> dict:
    """
    Fallback scoring when OpenGradient SDK is unavailable.
    Deterministic — same address always gets same score.
    """
    seed = sum(ord(c) for c in address)

    n_tx         = len(transactions)
    n_wallets    = graph_summary.get('node_count', 0)
    n_bridges    = sum(1 for t in transactions if t.get('bridgeProtocol'))
    n_high_risk  = graph_summary.get('high_risk_count', 0)

    timestamps = sorted(t.get('timestamp',0) for t in transactions if t.get('timestamp'))
    intervals  = [timestamps[i+1]-timestamps[i] for i in range(len(timestamps)-1)] if len(timestamps)>1 else []
    avg_int_s  = (sum(intervals)/len(intervals)/1000) if intervals else 9999
    tight       = avg_int_s < 60 and len(intervals) > 3

    tx_inputs  = ' '.join(t.get('input','') for t in transactions).lower()
    has_mixer  = any(p in tx_inputs for p in MIXER_PATTERNS)

    # Score components
    score = 10  # baseline
    if n_bridges >= 3:   score += 20
    if n_bridges >= 6:   score += 15
    if n_wallets >= 5:   score += 10
    if n_wallets >= 10:  score += 10
    if n_high_risk >= 2: score += 20
    if tight:            score += 15
    if has_mixer:        score += 25
    if n_tx > 50:        score += 5
    score = min(95, score + (seed % 8))  # small deterministic jitter

    level   = 'high' if score >= 70 else 'medium' if score >= 42 else 'low'
    sybil_p = round(min(0.97, score * 0.011), 2)

    explanations = {
        'high':   f"High-confidence Sybil indicators detected. Coordinated transaction timing, {n_bridges} bridge hops, and proximity to {n_high_risk} high-risk wallets indicate automated farming behaviour.",
        'medium': f"Moderate risk signals present. {n_bridges} bridge transactions and {n_wallets} connected wallets show clustering patterns. Manual review recommended.",
        'low':    f"Wallet exhibits organic transaction patterns. {n_tx} transactions with natural timing variance. No significant Sybil indicators detected.",
    }

    signals = []
    if tight:
        signals.append({"label":"Automated Timing", "severity":"high", "description":f"Transactions occur every ~{avg_int_s:.0f}s on average, consistent with bot execution."})
    if n_bridges >= 3:
        signals.append({"label":"Bridge Clustering", "severity":"medium" if n_bridges<6 else "high", "description":f"{n_bridges} bridge hops detected across protocols — common in Sybil farming."})
    if has_mixer:
        signals.append({"label":"Mixer-Adjacent Funding", "severity":"high", "description":"Funding source traceable to mixer-adjacent contracts."})
    if n_high_risk >= 2:
        signals.append({"label":"High-Risk Neighbours", "severity":"high", "description":f"{n_high_risk} directly connected wallets are independently flagged as high risk."})
    if not signals:
        signals.append({"label":"No Significant Signals", "severity":"low", "description":"No automated, mixer, or Sybil patterns detected in this wallet's activity."})

    return {
        "risk_score": score,
        "risk_level": level,
        "sybil_probability": sybil_p,
        "explanation": explanations[level],
        "signals": signals[:4],
    }


def _parse_model_output(raw: str) -> dict:
    """Extract JSON from model output, handling markdown fences."""
    text = raw.strip()
    if '```' in text:
        text = text.split('```')[-2] if '```' in text else text
        if text.startswith('json'): text = text[4:]
    try:
        data = json.loads(text)
        # Validate required fields
        assert isinstance(data.get('risk_score'), (int,float))
        assert data.get('risk_level') in ('high','medium','low')
        assert isinstance(data.get('sybil_probability'), float)
        return data
    except Exception as e:
        raise ValueError(f"Could not parse model output: {e}\nRaw: {text[:200]}")


async def analyze(address: str, transactions: list[dict], graph_summary: dict) -> dict:
    """
    Run Sybil detection. Returns the AI result + TEE proof (if OG available).
    """
    og_private_key      = os.getenv('OG_PRIVATE_KEY', '')
    og_workflow_address = os.getenv('OG_WORKFLOW_ADDRESS', '')
    og_rpc_url          = os.getenv('OG_RPC_URL', 'https://mainnet.opengradient.ai')

    # ── Live OpenGradient path ────────────────────────────────────────────────
    if OG_AVAILABLE and og_private_key and og_workflow_address:
        try:
            logger.info("Running OpenGradient TEE inference for %s...", address[:10])
            og.init(private_key=og_private_key, rpc=og_rpc_url)

            prompt = _build_prompt(address, transactions, graph_summary)
            result = og.run(
                contract_address=og_workflow_address,
                model_inputs={"messages": [
                    {"role": "system",  "content": SYSTEM_PROMPT},
                    {"role": "user",    "content": prompt},
                ]},
            )

            # Extract text output from result
            output_text = ""
            if hasattr(result, 'output'):
                out = result.output
                if isinstance(out, str):
                    output_text = out
                elif isinstance(out, dict):
                    output_text = out.get('content','') or out.get('text','') or str(out)
                elif isinstance(out, list) and out:
                    first = out[0]
                    output_text = first.get('text','') if isinstance(first,dict) else str(first)

            ai_result = _parse_model_output(output_text)

            # Build TEE proof from OG result
            proof = {
                "workflowAddress":  og_workflow_address,
                "executionTxHash":  getattr(result, 'transaction_hash', '') or getattr(result, 'tx_hash', ''),
                "modelId":          "meta-llama/Llama-3.1-8B-Instruct",
                "inputHash":        "0x" + hashlib.sha256(prompt.encode()).hexdigest(),
                "outputHash":       "0x" + hashlib.sha256(output_text.encode()).hexdigest(),
                "teeProvider":      "Marlin TEE (Intel TDX)",
                "rawProof":         getattr(result, 'proof', None) or {},
                "verifiable":       True,
            }

            logger.info("OG inference complete. Risk: %s (%s/100)", ai_result['risk_level'], ai_result['risk_score'])
            return {"result": ai_result, "proof": proof, "source": "opengradient_tee"}

        except Exception as e:
            logger.warning("OpenGradient inference failed: %s — falling back to heuristic", e)

    # ── Heuristic fallback ────────────────────────────────────────────────────
    logger.info("Using heuristic scoring for %s", address[:10])
    ai_result = _heuristic_score(address, transactions, graph_summary)

    # Mock proof (shows what a real proof looks like)
    addr_hash = hashlib.sha256(address.encode()).hexdigest()
    proof = {
        "workflowAddress":  og_workflow_address or "0xNotDeployedYet — see README",
        "executionTxHash":  "0x" + addr_hash[:16] + "feed",
        "modelId":          "heuristic-v1-fallback",
        "inputHash":        "0x" + addr_hash[:32],
        "outputHash":       "0x" + addr_hash[32:],
        "teeProvider":      "None — heuristic fallback (set OG_PRIVATE_KEY to enable TEE)",
        "rawProof":         {},
        "verifiable":       False,
    }

    return {"result": ai_result, "proof": proof, "source": "heuristic_fallback"}
