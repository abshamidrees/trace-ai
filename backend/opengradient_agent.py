"""
OpenGradient TEE Agent — SDK 0.8.0 (x402 / class-based API)
────────────────────────────────────────────────────────────
SDK 0.8.0 completely replaced the old function-based API (og.init / og.run)
with a class-based interface using x402 payment-gated LLM inference.

There are NO workflow contracts for LLM inference.
Payment is in $OPG tokens on Base Sepolia.
On-chain proof is the x402 payment transaction hash (verifiable on basescan).

Setup checklist:
  1. pip install opengradient  (already done)
  2. Your OG_PRIVATE_KEY wallet needs $OPG tokens on BASE SEPOLIA
       → https://faucet.opengradient.ai  (select Base Sepolia)
  3. Run once to approve the Permit2 spender:
       python -c "import opengradient as og; og.LLM(private_key='<key>').ensure_opg_approval(5)"
  4. Set OG_SETTLEMENT_MODE=INDIVIDUAL_FULL in .env for maximum on-chain auditability.
"""

import os
import json
import asyncio
import logging
import hashlib
from typing import Any

logger = logging.getLogger(__name__)

# ── SDK import (safe) ──────────────────────────────────────────────────────────
try:
    import opengradient as og
    # Validate the class-based API exists (0.8.0+)
    if not hasattr(og, "LLM") or not hasattr(og, "TEE_LLM"):
        raise AttributeError("og.LLM or og.TEE_LLM not found — need opengradient>=0.8.0")
    OG_AVAILABLE = True
    logger.info("OpenGradient SDK 0.8.0+ loaded. LLM class available.")
except Exception as _e:
    og = None  # type: ignore
    OG_AVAILABLE = False
    logger.warning("OpenGradient SDK unavailable (%s) — using heuristic fallback", _e)

# ── Model selection ───────────────────────────────────────────────────────────
# Best available model for wallet forensics (strong reasoning, JSON output).
# claude-sonnet-4-6 is the recommended choice — powerful and available in TEE.
# Fallback order if that enum doesn't exist in the installed version:
_MODEL_PREFERENCE = [
    "CLAUDE_SONNET_4_6",   # anthropic/claude-sonnet-4-6  <- primary
    "CLAUDE_SONNET_4_5",   # anthropic/claude-sonnet-4-5
    "GPT_4_1_2025_04_14",  # openai/gpt-4.1               <- fallback
    "GPT_5",               # openai/gpt-5
]

def _pick_model():
    if not OG_AVAILABLE or og is None:
        return None
    for name in _MODEL_PREFERENCE:
        if hasattr(og.TEE_LLM, name):
            logger.info("Selected TEE model: og.TEE_LLM.%s", name)
            return getattr(og.TEE_LLM, name)
    # Last resort — return the first enum member
    try:
        first = list(og.TEE_LLM)[0]
        logger.warning("Preferred models not found; using first available: %s", first)
        return first
    except Exception:
        return None

TEE_MODEL = _pick_model()

# ── Settlement mode ────────────────────────────────────────────────────────────
# INDIVIDUAL_FULL: full input/output written on-chain -> maximally verifiable proof
# BATCH_HASHED: cheaper, uses Merkle tree (default)
# PRIVATE: no on-chain data
def _pick_settlement_mode():
    if not OG_AVAILABLE or og is None:
        return None
    mode_name = os.getenv("OG_SETTLEMENT_MODE", "INDIVIDUAL_FULL")
    mode = getattr(og.x402SettlementMode, mode_name, None)
    if mode is None:
        mode = getattr(og.x402SettlementMode, "INDIVIDUAL_FULL",
               getattr(og.x402SettlementMode, "BATCH_HASHED", None))
    return mode

SETTLEMENT_MODE = _pick_settlement_mode()

# ── System prompt ──────────────────────────────────────────────────────────────
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
- 0-41:   Low risk (organic patterns, clean funding, irregular human-like timing)"""

MIXER_PATTERNS = ['tornado', 'mixer', 'tumbler', '0xd90e2f925', '0x722122df']


def _build_prompt(address: str, transactions: list[dict], graph_summary: dict) -> str:
    n_tx      = len(transactions)
    n_wallets = len(set(t.get('to','') for t in transactions) |
                    set(t.get('from','') for t in transactions)) - 1
    bridges   = [t for t in transactions if t.get('bridgeProtocol')]
    n_bridges = len(bridges)

    timestamps   = sorted(t.get('timestamp',0) for t in transactions if t.get('timestamp'))
    intervals    = [timestamps[i+1]-timestamps[i] for i in range(len(timestamps)-1)] if len(timestamps)>1 else []
    avg_int_s    = (sum(intervals)/len(intervals)/1000) if intervals else 0
    tight_timing = avg_int_s < 60 and len(intervals) > 3

    tx_inputs = ' '.join(t.get('input','') for t in transactions).lower()
    has_mixer = any(p in tx_inputs for p in MIXER_PATTERNS)

    summary = {
        "target_address":              address[:10] + "...",
        "total_transactions":          n_tx,
        "unique_counterparties":       n_wallets,
        "bridge_transactions":         n_bridges,
        "bridge_protocols_used":       list({t.get('bridgeProtocol') for t in bridges if t.get('bridgeProtocol')}),
        "average_tx_interval_seconds": round(avg_int_s, 1),
        "automated_timing_detected":   tight_timing,
        "mixer_adjacent_funding":      has_mixer,
        "graph_node_count":            graph_summary.get('node_count', 1),
        "high_risk_neighbours":        graph_summary.get('high_risk_count', 0),
    }

    return f"Analyse this wallet:\n\n{json.dumps(summary, indent=2)}"


def _parse_llm_output(raw: str) -> dict:
    """Extract the JSON block from the model response."""
    text = raw.strip()
    # Strip markdown fences if present
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            try:
                data = json.loads(part)
                if "risk_score" in data:
                    return _validate_result(data)
            except Exception:
                continue
    # Try raw parse
    data = json.loads(text)
    return _validate_result(data)


def _validate_result(data: dict) -> dict:
    assert isinstance(data.get('risk_score'), (int, float)), "risk_score missing"
    assert data.get('risk_level') in ('high', 'medium', 'low'), "risk_level invalid"
    assert isinstance(data.get('sybil_probability'), float), "sybil_probability missing"
    return data


def _heuristic_score(address: str, transactions: list[dict], graph_summary: dict) -> dict:
    """Deterministic fallback when SDK is unavailable."""
    seed        = sum(ord(c) for c in address)
    n_tx        = len(transactions)
    n_wallets   = graph_summary.get('node_count', 0)
    n_bridges   = sum(1 for t in transactions if t.get('bridgeProtocol'))
    n_high_risk = graph_summary.get('high_risk_count', 0)

    timestamps = sorted(t.get('timestamp',0) for t in transactions if t.get('timestamp'))
    intervals  = [timestamps[i+1]-timestamps[i] for i in range(len(timestamps)-1)] if len(timestamps)>1 else []
    avg_int_s  = (sum(intervals)/len(intervals)/1000) if intervals else 9999
    tight      = avg_int_s < 60 and len(intervals) > 3
    tx_inputs  = ' '.join(t.get('input','') for t in transactions).lower()
    has_mixer  = any(p in tx_inputs for p in MIXER_PATTERNS)

    score = 10
    if n_bridges >= 3:   score += 20
    if n_bridges >= 6:   score += 15
    if n_wallets >= 5:   score += 10
    if n_wallets >= 10:  score += 10
    if n_high_risk >= 2: score += 20
    if tight:            score += 15
    if has_mixer:        score += 25
    if n_tx > 50:        score += 5
    score = min(95, score + (seed % 8))

    level   = 'high' if score >= 70 else 'medium' if score >= 42 else 'low'
    sybil_p = round(min(0.97, score * 0.011), 2)

    expl = {
        'high':   f"High-confidence Sybil indicators detected. {n_bridges} bridge hops and {n_high_risk} high-risk neighbours indicate automated farming.",
        'medium': f"Moderate risk signals. {n_bridges} bridge transactions and {n_wallets} connected wallets show clustering.",
        'low':    f"Organic patterns. {n_tx} transactions with natural variance. No significant Sybil indicators.",
    }

    signals = []
    if tight:
        signals.append({"label": "Automated Timing", "severity": "high",
                         "description": f"Avg interval ~{avg_int_s:.0f}s, consistent with bot execution."})
    if n_bridges >= 3:
        signals.append({"label": "Bridge Clustering", "severity": "medium" if n_bridges < 6 else "high",
                         "description": f"{n_bridges} bridge hops — common in Sybil farming."})
    if has_mixer:
        signals.append({"label": "Mixer-Adjacent Funding", "severity": "high",
                         "description": "Funding traceable to mixer-adjacent contracts."})
    if n_high_risk >= 2:
        signals.append({"label": "High-Risk Neighbours", "severity": "high",
                         "description": f"{n_high_risk} connected wallets independently flagged."})
    if not signals:
        signals.append({"label": "No Significant Signals", "severity": "low",
                         "description": "No automated, mixer, or Sybil patterns detected."})

    return {"risk_score": score, "risk_level": level, "sybil_probability": sybil_p,
            "explanation": expl[level], "signals": signals[:4]}


async def analyze(address: str, transactions: list[dict], graph_summary: dict) -> dict:
    """
    Run Sybil detection via OpenGradient TEE (SDK 0.8.0 x402 API).
    Falls back to heuristic scoring if SDK is unavailable or call fails.

    Returns {"result": {...}, "proof": {...}, "source": "opengradient_tee"|"heuristic_fallback"}
    """
    og_private_key = os.getenv('OG_PRIVATE_KEY', '')

    # ── Live OpenGradient path (SDK 0.8.0 class-based API) ────────────────────
    if OG_AVAILABLE and og is not None and TEE_MODEL is not None and og_private_key:
        try:
            logger.info("Running OpenGradient TEE inference (model=%s) for %s...", TEE_MODEL, address[:10])

            # Instantiate client
            llm = og.LLM(private_key=og_private_key)

            # Ensure $OPG token approval on Base Sepolia (no-op if already sufficient)
            try:
                approval = llm.ensure_opg_approval(opg_amount=1.0)
                if approval and hasattr(approval, 'tx_hash') and approval.tx_hash:
                    logger.info("OPG approval tx: %s", approval.tx_hash)
            except Exception as _approval_err:
                # Non-fatal: if already approved, this may error in some SDK versions
                logger.warning("ensure_opg_approval warning (may be fine): %s", _approval_err)

            prompt = _build_prompt(address, transactions, graph_summary)

            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": prompt},
            ]

            # Run TEE-verified inference with on-chain settlement
            result = await llm.chat(
                model=TEE_MODEL,
                messages=messages,
                max_tokens=600,
                temperature=0.0,
                x402_settlement_mode=SETTLEMENT_MODE,
            )

            # Extract text from response
            chat_out = result.chat_output
            if isinstance(chat_out, dict):
                output_text = chat_out.get('content') or chat_out.get('text') or str(chat_out)
            elif isinstance(chat_out, str):
                output_text = chat_out
            else:
                output_text = str(chat_out)

            ai_result = _parse_llm_output(output_text)

            # payment_hash is the on-chain proof (verifiable on basescan/OG explorer)
            payment_hash = getattr(result, 'payment_hash', None) or ""
            model_name   = str(TEE_MODEL.value) if hasattr(TEE_MODEL, 'value') else str(TEE_MODEL)

            proof = {
                "workflowAddress": "x402/Base Sepolia — see payment hash",
                "executionTxHash": payment_hash,
                "modelId":         model_name,
                "inputHash":       "0x" + hashlib.sha256(prompt.encode()).hexdigest(),
                "outputHash":      "0x" + hashlib.sha256(output_text.encode()).hexdigest(),
                "teeProvider":     "OpenGradient TEE (Intel TDX)",
                "rawProof": {
                    "payment_hash":          payment_hash,
                    "settlement_mode":       str(SETTLEMENT_MODE),
                    "model":                 model_name,
                    "base_sepolia_explorer": f"https://sepolia.basescan.org/tx/{payment_hash}" if payment_hash else "",
                    "og_explorer":           f"https://explorer.opengradient.ai/tx/{payment_hash}" if payment_hash else "",
                },
                "verifiable": bool(payment_hash),
            }

            logger.info("OG TEE inference complete. Risk=%s (%s/100). Proof tx=%s",
                        ai_result['risk_level'], ai_result['risk_score'], payment_hash[:16] if payment_hash else "N/A")
            return {"result": ai_result, "proof": proof, "source": "opengradient_tee"}

        except Exception as e:
            logger.warning("OpenGradient TEE inference failed: %s — falling back to heuristic", e)

    # ── Heuristic fallback ────────────────────────────────────────────────────
    logger.info("Using heuristic scoring for %s", address[:10])
    ai_result = _heuristic_score(address, transactions, graph_summary)
    addr_hash = hashlib.sha256(address.encode()).hexdigest()

    proof = {
        "workflowAddress": "Not available — set OG_PRIVATE_KEY + fund wallet on Base Sepolia",
        "executionTxHash": "0x" + addr_hash[:16] + "feed",
        "modelId":         "heuristic-v1 (TEE unavailable)",
        "inputHash":       "0x" + addr_hash[:32],
        "outputHash":      "0x" + addr_hash[32:],
        "teeProvider":     "None (heuristic fallback)",
        "rawProof":        {},
        "verifiable":      False,
    }

    return {"result": ai_result, "proof": proof, "source": "heuristic_fallback"}
