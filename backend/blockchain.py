"""
Blockchain data fetchers — Etherscan (EVM) + Helius (Solana)
Falls back to empty list if no API key set.
"""

import re
import os
import httpx
import logging
from typing import Any

logger = logging.getLogger(__name__)

# ── Chain detection ───────────────────────────────────────────────────────────
def detect_chain(address: str) -> str:
    if re.match(r'^0x[a-fA-F0-9]{40}$', address):        return 'ethereum'
    if re.match(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$', address): return 'solana'
    if re.match(r'^(EQ|UQ)[A-Za-z0-9_-]{46}$', address): return 'ton'
    if re.match(r'^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$', address): return 'bitcoin'
    return 'unknown'

# ── Known contract labels ─────────────────────────────────────────────────────
KNOWN_LABELS: dict[str, tuple[str, str]] = {
    "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b": ("Tornado Cash",      "mixer"),
    "0x722122dfa5a6e8359f5f24840e0c35d0b48e1990": ("Tornado Cash",      "mixer"),
    "0x3ee18b2214aff97000d974cf647e7c347e8fa585": ("Wormhole Bridge",   "bridge"),
    "0x5a58505a96d1dbf8df91cb21b54419fc36e93fde": ("Jumper Bridge",     "bridge"),
    "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae": ("LI.FI Bridge",      "bridge"),
    "0x3a23f943181408eac424116af7b7790c94cb97a5": ("Socket Bridge",     "bridge"),
    "0x66a71dcef29a0ffbdbe3c6a460a3b5bc225cd675": ("LayerZero",         "bridge"),
    "0x9d1b1669c73b033dfe47ae5a0164ab96df25b944": ("Relay Bridge",      "bridge"),
    "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506": ("SushiSwap",         "exchange"),
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": ("Uniswap V2",        "exchange"),
    "0xe592427a0aece92de3edee1f18e0157c05861564": ("Uniswap V3",        "exchange"),
}

def label_address(addr: str) -> tuple[str | None, str]:
    """Return (label, nodeType) for an address."""
    lower = addr.lower()
    if lower in KNOWN_LABELS:
        return KNOWN_LABELS[lower]
    return None, 'wallet'

# ── EVM (Etherscan-compatible) ────────────────────────────────────────────────
ETHERSCAN_BASES: dict[str, str] = {
    'ethereum': 'https://api.etherscan.io/api',
    'base':     'https://api.basescan.org/api',
    'arbitrum': 'https://api.arbiscan.io/api',
    'optimism': 'https://api-optimistic.etherscan.io/api',
    'polygon':  'https://api.polygonscan.com/api',
}

def fetch_evm_transactions(address: str, api_key: str, chain: str = 'ethereum') -> list[dict]:
    if not api_key:
        logger.info("No Etherscan API key — returning empty tx list for %s", address[:10])
        return []
    base = ETHERSCAN_BASES.get(chain, ETHERSCAN_BASES['ethereum'])
    try:
        resp = httpx.get(base, params={
            "module":   "account",
            "action":   "txlist",
            "address":  address,
            "startblock": 0,
            "endblock": 99999999,
            "sort":     "desc",
            "offset":   50,
            "page":     1,
            "apikey":   api_key,
        }, timeout=15)
        data = resp.json()
        if data.get("status") != "1":
            logger.warning("Etherscan returned status %s: %s", data.get("status"), data.get("message"))
            return []
        raw_txns = data.get("result", [])
        return [_normalise_evm_tx(t, chain) for t in raw_txns]
    except Exception as e:
        logger.error("Etherscan fetch failed: %s", e)
        return []

def _normalise_evm_tx(t: dict, chain: str) -> dict:
    value_eth = int(t.get("value","0")) / 1e18
    ts_ms = int(t.get("timeStamp","0")) * 1000
    label, node_type = label_address(t.get("to",""))
    bridge = node_type == "bridge"
    return {
        "hash":            t.get("hash",""),
        "from":            t.get("from","").lower(),
        "to":              t.get("to","").lower(),
        "amount":          f"{value_eth:.6f}",
        "amountUSD":       value_eth * 3200,  # rough ETH price placeholder
        "token":           "ETH",
        "timestamp":       ts_ms,
        "chain":           chain,
        "blockNumber":     int(t.get("blockNumber","0")),
        "isDirect":        not bridge,
        "bridgeProtocol":  label if bridge else None,
        "input":           t.get("input",""),
    }

# ── Solana (Helius) ───────────────────────────────────────────────────────────
def fetch_solana_transactions(address: str, api_key: str) -> list[dict]:
    if not api_key:
        logger.info("No Helius API key — returning empty tx list for %s", address[:10])
        return []
    try:
        resp = httpx.get(
            f"https://api.helius.xyz/v0/addresses/{address}/transactions",
            params={"api-key": api_key, "limit": 50},
            timeout=15,
        )
        raw = resp.json()
        if isinstance(raw, dict) and raw.get("error"):
            logger.warning("Helius error: %s", raw["error"])
            return []
        return [_normalise_solana_tx(t) for t in (raw if isinstance(raw, list) else [])]
    except Exception as e:
        logger.error("Helius fetch failed: %s", e)
        return []

def _normalise_solana_tx(t: dict) -> dict:
    sol_amount = abs(t.get("nativeTransfers", [{}])[0].get("amount", 0)) / 1e9
    accounts   = [a.get("account","") for a in t.get("accountData", [])]
    to_addr    = accounts[1] if len(accounts) > 1 else ""
    from_addr  = accounts[0] if accounts else ""
    return {
        "hash":            t.get("signature",""),
        "from":            from_addr,
        "to":              to_addr,
        "amount":          f"{sol_amount:.6f}",
        "amountUSD":       sol_amount * 180,
        "token":           "SOL",
        "timestamp":       int(t.get("timestamp", 0)) * 1000,
        "chain":           "solana",
        "isDirect":        True,
        "bridgeProtocol":  None,
        "input":           "",
    }

# ── Graph builder ─────────────────────────────────────────────────────────────
def build_graph(address: str, chain: str, transactions: list[dict]) -> tuple[dict, dict]:
    """
    Build a GraphData dict + summary stats from transaction list.
    Returns (graph_data, summary).
    """
    if not transactions:
        return _empty_graph(address, chain), {"node_count":1,"max_depth":0,"high_risk_count":0}

    # Collect unique counterparties
    counterparties: dict[str, dict] = {}
    for tx in transactions:
        other = tx["to"] if tx["from"].lower() == address.lower() else tx["from"]
        if other and other.lower() != address.lower():
            if other not in counterparties:
                label, nt = label_address(other)
                counterparties[other] = {"count": 0, "label": label, "nodeType": nt, "latest": 0, "totalUSD": 0}
            counterparties[other]["count"]    += 1
            counterparties[other]["totalUSD"] += tx.get("amountUSD", 0)
            ts = tx.get("timestamp", 0)
            if ts > counterparties[other]["latest"]:
                counterparties[other]["latest"] = ts

    # Assign depths (simple: all counterparties are depth 1, then limit to 3 columns)
    all_addrs = list(counterparties.keys())[:12]  # cap at 12 nodes

    # Layout: column-based
    col_x = {0: 140, 1: 380, 2: 660, 3: 920}
    col_counts: dict[int, int] = {1: 0, 2: 0, 3: 0}

    def assign_depth(i: int) -> int:
        if i < 3:  return 1
        if i < 7:  return 2
        return 3

    nodes: list[dict] = []
    H_approx = 560

    # Target node
    nodes.append({
        "id":           address,
        "address":      address,
        "shortAddress": address[:6]+"..."+address[-6:],
        "chain":        chain,
        "riskLevel":    "medium",
        "nodeType":     "target",
        "isTarget":     True,
        "label":        "Searched Wallet",
        "txCount":      len(transactions),
        "x":            col_x[0],
        "y":            H_approx / 2,
        "vx": 0, "vy": 0,
    })

    depth_groups: dict[int, list] = {1:[], 2:[], 3:[]}
    for i, addr in enumerate(all_addrs):
        d = assign_depth(i)
        info = counterparties[addr]
        node: dict[str, Any] = {
            "id":           addr,
            "address":      addr,
            "shortAddress": addr[:5]+"..."+addr[-5:],
            "chain":        chain,
            "riskLevel":    _risk_for_node(info),
            "nodeType":     info["nodeType"],
            "isTarget":     False,
            "label":        info["label"],
            "txCount":      info["count"],
            "x":            0,
            "y":            0,
            "vx": 0, "vy": 0,
        }
        depth_groups[d].append(node)
        nodes.append(node)

    # Position nodes in columns
    for d, group in depth_groups.items():
        if not group: continue
        step = (H_approx - 80) / (len(group) + 1)
        for i, n in enumerate(group):
            n["x"] = float(col_x[d])
            n["y"] = float(40 + step * (i + 1))

    # Build links from transactions
    node_ids = {n["id"] for n in nodes}
    links: list[dict] = []
    seen_links: set = set()
    for tx in transactions[:20]:
        src = tx["from"].lower() if tx["from"].lower() in node_ids else address
        tgt = tx["to"].lower()   if tx["to"].lower()   in node_ids else address
        if src == tgt: continue
        key = (src, tgt)
        if key in seen_links: continue
        seen_links.add(key)
        links.append({
            "id":        tx["hash"],
            "source":    src,
            "target":    tgt,
            "amount":    tx["amount"],
            "amountUSD": tx.get("amountUSD", 0),
            "chain":     tx["chain"],
            "timestamp": tx["timestamp"],
            "txHash":    tx["hash"],
            "token":     tx.get("token","ETH"),
            "isDirect":  tx.get("isDirect", True),
            "direction": "out" if tx["from"].lower() == address.lower() else "in",
        })

    high_risk_count = sum(1 for n in nodes if n["riskLevel"]=="high" and not n["isTarget"])
    summary = {
        "node_count":       len(nodes),
        "link_count":       len(links),
        "max_depth":        3 if len(all_addrs)>6 else 2 if len(all_addrs)>2 else 1,
        "high_risk_count":  high_risk_count,
        "bridge_count":     sum(1 for n in nodes if n["nodeType"]=="bridge"),
        "mixer_count":      sum(1 for n in nodes if n["nodeType"]=="mixer"),
    }

    return {"nodes": nodes, "links": links}, summary


def _risk_for_node(info: dict) -> str:
    nt = info.get("nodeType","wallet")
    if nt == "mixer":    return "high"
    if nt == "bridge":   return "medium"
    if nt == "exchange": return "low"
    # Heuristic: high tx count or high total USD might suggest sybil
    if info.get("totalUSD",0) > 100_000: return "medium"
    if info.get("count",0) > 30:         return "medium"
    return "low"


def _empty_graph(address: str, chain: str) -> dict:
    return {
        "nodes": [{
            "id":address,"address":address,"shortAddress":address[:6]+"..."+address[-6:],
            "chain":chain,"riskLevel":"low","nodeType":"target","isTarget":True,
            "label":"Searched Wallet","txCount":0,"x":500,"y":280,"vx":0,"vy":0,
        }],
        "links": [],
    }
