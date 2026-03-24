"""
Blockchain data fetchers:
  - Etherscan V2 (free): Ethereum + Arbitrum
  - Moralis (free tier): Base + Polygon
  - Helius: Solana
"""

import re
import os
import math
import httpx
import logging

logger = logging.getLogger(__name__)

# ── Chain config ──────────────────────────────────────────────────────────────
ETHERSCAN_CHAINS = {
    'ethereum': '1',
    'arbitrum': '42161',
}

MORALIS_CHAINS = {
    'base':    '0x2105',
    'polygon': '0x89',
}

MORALIS_BASE_URL = 'https://deep-index.moralis.io/api/v2.2'

# ── Entity labels ─────────────────────────────────────────────────────────────
# How this works: exchanges have "hot wallets" — main treasury addresses that
# all user deposits sweep into. We label those hot wallets. Personal deposit
# addresses (unique per user) cannot be labeled automatically.
KNOWN_LABELS: dict[str, tuple[str, str]] = {

    # ── Tornado Cash (mixer) ──────────────────────────────────────────────────
    "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b": ("Tornado Cash", "mixer"),
    "0x722122dfa5a6e8359f5f24840e0c35d0b48e1990": ("Tornado Cash", "mixer"),
    "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf": ("Tornado Cash", "mixer"),
    "0xa160cdab225685da1d56aa342ad8841c3b53f291": ("Tornado Cash", "mixer"),
    "0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3": ("Tornado Cash", "mixer"),
    "0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144": ("Tornado Cash", "mixer"),

    # ── Bridges ───────────────────────────────────────────────────────────────
    "0x3ee18b2214aff97000d974cf647e7c347e8fa585": ("Wormhole Bridge", "bridge"),
    "0x5a58505a96d1dbf8df91cb21b54419fc36e93fde": ("Jumper Bridge", "bridge"),
    "0x3a23f943181408eac424116af7b7790c94cb97a5": ("Socket Bridge", "bridge"),
    "0xce16f69375520ab01377ce7b88f5ba8c48f8d666": ("Celer Bridge", "bridge"),
    "0x4f60a160d8c2dddaafe16fcc57566db84d674bd6": ("Across Bridge", "bridge"),
    "0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5": ("Across Bridge", "bridge"),
    "0x3baad9b9f6b2e26b8c2ae3a3cbb09f6f90f9cc91": ("Hop Bridge", "bridge"),
    "0x914842038a853b4b89ae80150938b45a4f1e72c8": ("Hop Bridge", "bridge"),
    "0xb0d502e938ed5f4df2e681fe6e419ff29631d62b": ("Stargate Bridge", "bridge"),
    "0xaf54be5b6eec24d6bfacf1cce4eaf680a8239398": ("Stargate Bridge", "bridge"),
    "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae": ("LI.FI Bridge", "bridge"),
    "0x9d8f8572f345e1ae53db1dfa4a7fce49b467bd7f": ("Relay Bridge", "bridge"),
    "0xccc88a9d1b4ed6b0eaba998850414b24f1c315be": ("Relay Bridge", "bridge"),
    "0xf70da97812cb96acdf810712aa562db8dfa3dbef": ("Relay Bridge", "bridge"),
    "0x80c67432656d59144ceff962e8faf8926599bcf8": ("Orbiter Finance", "bridge"),
    "0xd9d74a29307cc6fc8bf424ee4217f1a587fbc8dc": ("Orbiter Finance", "bridge"),
    "0x1111111254eeb25477b68fb85ed929f73a960582": ("1inch Fusion", "bridge"),
    "0xe4edb277e41dc89ab076a1f049f4a3efa700bce8": ("Orbiter Finance", "bridge"),

    # ── Binance hot wallets ───────────────────────────────────────────────────
    "0x28c6c06298d514db089934071355e5743bf21d60": ("Binance", "exchange"),
    "0x21a31ee1afc51d94c2efccaa2092ad1028285549": ("Binance", "exchange"),
    "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": ("Binance", "exchange"),
    "0x56eddb7aa87536c09ccc2793473599fd21a8b17f": ("Binance", "exchange"),
    "0xf977814e90da44bfa03b6295a0616a897441acec": ("Binance", "exchange"),
    "0x001866ae5b3de6caa5a51543fd9fb64f524f5478": ("Binance", "exchange"),
    "0x8894e0a0c962cb723c1976a4421c95949be2d4e3": ("Binance", "exchange"),
    "0xe0f0cfde7ee664943906f17f7f14342a76a61f1e": ("Binance", "exchange"),

    # ── Coinbase hot wallets ──────────────────────────────────────────────────
    "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43": ("Coinbase", "exchange"),
    "0x71660c4005ba85c37ccec55d0c4493e66fe775d3": ("Coinbase", "exchange"),
    "0x503828976d22510aad0201ac7ec88293211d23da": ("Coinbase", "exchange"),
    "0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740": ("Coinbase", "exchange"),
    "0x77696bb39917c91a0c3908d577d5e322095425ca": ("Coinbase", "exchange"),
    "0x7c195d981abfdc3ddecd2ca0fed0958430488e34": ("Coinbase", "exchange"),
    "0xb739d0895772dbb71a89a3754a160269068dcd30": ("Coinbase", "exchange"),

    # ── Kraken hot wallets ────────────────────────────────────────────────────
    "0x95222290dd7278aa3ddd389cc1e1d165cc4bafe5": ("Kraken", "exchange"),
    "0x2910543af39aba0cd09dbb2d50200b3e800a63d2": ("Kraken", "exchange"),
    "0xe853c56864a2ebe4576a807d26fdc4a0ada51919": ("Kraken", "exchange"),
    "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0": ("Kraken", "exchange"),

    # ── OKX hot wallets ───────────────────────────────────────────────────────
    "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b": ("OKX", "exchange"),
    "0x236c2b912f70a4f6a39dd6f7b9c7e8ea4dcdaa2f": ("OKX", "exchange"),
    "0x388c818ca8b9251b393131c08a736a67ccb19297": ("OKX", "exchange"),
    "0xa7efae728d2936e78bda97dc267687568dd593f3": ("OKX", "exchange"),
    "0x98ec059dc8ad22612cb9e4929a881e82c5c0d1f9": ("OKX", "exchange"),

    # ── Bybit hot wallets ─────────────────────────────────────────────────────
    "0x9696f59e4d72e237be84ffd425dcad154bf96976": ("Bybit", "exchange"),
    "0xf89d7b9c864f589bbf53a82105107622b35eaa40": ("Bybit", "exchange"),
    "0xd6216fc19db775df9774a6e33526131da7d19a2c": ("Bybit", "exchange"),
    "0x2b5634c42055806a59e9107ed44d43c426e58258": ("Bybit", "exchange"),

    # ── MEXC hot wallets ──────────────────────────────────────────────────────
    # Your deposit address sweeps into these
    "0x75e89d5979e4f6fba9f97c104172152486377bcc": ("MEXC", "exchange"),
    "0x4b5057b2c87ec9e7c053f135237cbc054b843a57": ("MEXC", "exchange"),
    "0x3cc936b795a188f0e246cbb2d74c5bd190aecf18": ("MEXC", "exchange"),
    "0xd76e0f7bef426aa62e5b14e9fc67e87a7ea46e81": ("MEXC", "exchange"),
    "0x3503050bf32cc4da62e09e25e2c16eae7bf574df": ("MEXC", "exchange"),

    # ── Gate.io hot wallets ───────────────────────────────────────────────────
    "0x0d0707963952f2fba59dd06f2b425ace40b492fe": ("Gate.io", "exchange"),
    "0x7793cd85c11a924478d358d49b05b37e91b5810f": ("Gate.io", "exchange"),
    "0x1c4b70a3968436b9a0a9cf5205c787eb81bb558c": ("Gate.io", "exchange"),

    # ── Kucoin hot wallets ────────────────────────────────────────────────────
    "0xd6216fc19db775df9774a6e33526131da7d19a2c": ("Kucoin", "exchange"),
    "0xa1d8d972560c2f8144af871db508f0b0b10a3fbf": ("Kucoin", "exchange"),
    "0xec6952892271c8ee13f12e118484e03149281c9f": ("Kucoin", "exchange"),

    # ── Bitget hot wallets ────────────────────────────────────────────────────
    "0x1ab4973a48dc892cd9971ece8e01dcc7688f8f23": ("Bitget", "exchange"),
    "0x5bedb060b8eb8d823e2414d82acce78d38be7fe9": ("Bitget", "exchange"),

    # ── HTX (Huobi) hot wallets ───────────────────────────────────────────────
    "0xab5c66752a9e8167967685f1450532fb96d5d24f": ("HTX", "exchange"),
    "0x6f259637dcd74c767781e37bc6133cd6a68aa161": ("HTX", "exchange"),
    "0xfdb16996831753d5331ff813c29a93c76834a0ad": ("HTX", "exchange"),
    "0xeee28d484628d41a82d01e21d12e2e78d69920da": ("HTX", "exchange"),

    # ── Crypto.com hot wallets ────────────────────────────────────────────────
    "0x6262998ced04146fa42253a5c0af90ca02dfd2a3": ("Crypto.com", "exchange"),
    "0x46340b20830761efd32832a74d7169b29feb9758": ("Crypto.com", "exchange"),
    "0x72a53cdbbcc1b9efa39c834a540550e23463aacb": ("Crypto.com", "exchange"),

    # ── Upbit hot wallets ─────────────────────────────────────────────────────
    "0x1e2f9e10d02a6b8f8f69fcbf515e75039d2ea30d": ("Upbit", "exchange"),
    "0x7f268357a8c2552623316e2562d90e642bb538e5": ("Upbit", "exchange"),

    # ── DEX routers ───────────────────────────────────────────────────────────
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": ("Uniswap V2", "exchange"),
    "0xe592427a0aece92de3edee1f18e0157c05861564": ("Uniswap V3", "exchange"),
    "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": ("Uniswap V3", "exchange"),
    "0x000000000004444c5dc75cb358380d2e3de08a90": ("Uniswap V4", "exchange"),
    "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": ("SushiSwap", "exchange"),
    "0x1111111254fb6c44bac0bed2854e76f90643097d": ("1inch", "exchange"),

    # ── Staking ───────────────────────────────────────────────────────────────
    "0x00000000219ab540356cbb839cbe05303d7705fa": ("ETH2 Deposit", "exchange"),
    "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": ("Lido stETH", "exchange"),
}


def detect_chain(address: str) -> str:
    if re.match(r'^0x[a-fA-F0-9]{40}$', address):
        return 'ethereum'
    if re.match(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$', address):
        return 'solana'
    return 'unknown'


def label_address(addr: str) -> tuple[str | None, str]:
    lower = addr.lower()
    if lower in KNOWN_LABELS:
        return KNOWN_LABELS[lower]
    return None, 'wallet'


# ── Etherscan V2 (ETH + Arbitrum) ────────────────────────────────────────────
def _fetch_etherscan_chain(address: str, api_key: str, chain: str) -> list[dict]:
    chain_id = ETHERSCAN_CHAINS.get(chain, '1')
    try:
        r = httpx.get('https://api.etherscan.io/v2/api', params={
            "chainid": chain_id,
            "module": "account", "action": "txlist", "address": address,
            "startblock": 0, "endblock": 99999999, "sort": "desc",
            "offset": 20, "page": 1, "apikey": api_key,
        }, timeout=15)
        r.raise_for_status()
        data = r.json()
        result = data.get("result", [])
        if isinstance(result, list) and len(result) > 0:
            logger.info("Etherscan %s: %d txns for %s", chain, len(result), address[:10])
            return [_norm_evm(t, chain) for t in result[:20] if isinstance(t, dict)]
        logger.debug("Etherscan %s: no data for %s", chain, address[:10])
        return []
    except Exception as e:
        logger.warning("Etherscan %s error: %s", chain, e)
        return []


# ── Moralis (Base + Polygon) ──────────────────────────────────────────────────
def _fetch_moralis_chain(address: str, api_key: str, chain: str) -> list[dict]:
    chain_hex = MORALIS_CHAINS.get(chain)
    if not chain_hex:
        return []
    try:
        r = httpx.get(
            f"{MORALIS_BASE_URL}/{address}",
            params={"chain": chain_hex, "limit": 20, "order": "DESC"},
            headers={"X-API-Key": api_key},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        result = data.get("result", [])
        if isinstance(result, list) and len(result) > 0:
            logger.info("Moralis %s: %d txns for %s", chain, len(result), address[:10])
            return [_norm_moralis(t, chain) for t in result[:20] if isinstance(t, dict)]
        logger.debug("Moralis %s: no data for %s", chain, address[:10])
        return []
    except Exception as e:
        logger.warning("Moralis %s error: %s", chain, e)
        return []


def _norm_moralis(t: dict, chain: str) -> dict:
    try:
        value = int(t.get("value", 0)) / 1e18
    except (TypeError, ValueError):
        value = 0.0
    token_map = {'base': 'ETH', 'polygon': 'POL'}
    return {
        "hash":      t.get("hash", ""),
        "from":      (t.get("from_address") or "").lower(),
        "to":        (t.get("to_address") or "").lower(),
        "amount":    f"{value:.4f}",
        "amountUSD": value * 3200,
        "token":     token_map.get(chain, 'ETH'),
        "timestamp": _parse_moralis_ts(t.get("block_timestamp", "")),
        "chain":     chain,
        "input":     t.get("input", ""),
    }


def _parse_moralis_ts(ts_str: str) -> int:
    if not ts_str:
        return 0
    try:
        from datetime import datetime, timezone
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        return int(dt.timestamp() * 1000)
    except Exception:
        return 0


# ── Main EVM fetcher — all 4 chains ──────────────────────────────────────────
def fetch_evm_transactions(address: str, api_key: str, chain: str = 'ethereum') -> list[dict]:
    if not api_key:
        logger.warning("No Etherscan API key")
        return []

    moralis_key = os.getenv("MORALIS_API_KEY", "")
    all_txns: list[dict] = []

    for c in ETHERSCAN_CHAINS:
        all_txns.extend(_fetch_etherscan_chain(address, api_key, c))

    if moralis_key:
        for c in MORALIS_CHAINS:
            all_txns.extend(_fetch_moralis_chain(address, moralis_key, c))
    else:
        logger.info("No MORALIS_API_KEY — skipping Base/Polygon")

    logger.info("Total EVM txns for %s across all chains: %d", address[:10], len(all_txns))
    return all_txns


def _norm_evm(t: dict, chain: str) -> dict:
    try:
        value = int(t.get("value", 0)) / 1e18
    except (TypeError, ValueError):
        value = 0.0
    return {
        "hash":      t.get("hash", ""),
        "from":      (t.get("from") or "").lower(),
        "to":        (t.get("to") or "").lower(),
        "amount":    f"{value:.4f}",
        "amountUSD": value * 3200,
        "token":     "ETH",
        "timestamp": int(t.get("timeStamp", 0)) * 1000,
        "chain":     chain,
        "input":     t.get("input", ""),
    }


# ── Solana (Helius) ───────────────────────────────────────────────────────────
def fetch_solana_transactions(address: str, api_key: str) -> list[dict]:
    if not api_key:
        logger.warning("No Helius API key")
        return []
    try:
        url = f"https://api.helius.xyz/v0/addresses/{address}/transactions"
        r = httpx.get(url, params={"api-key": api_key, "limit": 40}, timeout=15)
        r.raise_for_status()
        data = r.json()
        raw = data if isinstance(data, list) else data.get("items", data.get("transactions", []))
        if not isinstance(raw, list):
            return []
        results = []
        for t in raw[:25]:
            try:
                results.append(_norm_solana(t))
            except Exception as e:
                logger.warning("Skipping malformed Helius tx: %s", e)
        logger.info("Helius: %d txns for %s", len(results), address[:10])
        return results
    except Exception as e:
        logger.error("Helius error: %s", e)
        return []


def _norm_solana(t: dict) -> dict:
    amount = 0.0
    try:
        native = t.get("nativeTransfers") or []
        if native and isinstance(native, list):
            amount = abs(int(native[0].get("amount", 0))) / 1e9
    except Exception:
        pass
    from_addr = (t.get("from") or t.get("feePayer") or
                 (t.get("nativeTransfers") or [{}])[0].get("fromUserAccount", ""))
    to_addr   = (t.get("to") or
                 (t.get("nativeTransfers") or [{}])[0].get("toUserAccount", ""))
    return {
        "hash":      t.get("signature", ""),
        "from":      from_addr or "",
        "to":        to_addr or "",
        "amount":    f"{amount:.4f}",
        "amountUSD": amount * 180,
        "token":     "SOL",
        "timestamp": int(t.get("timestamp", 0)) * 1000,
        "chain":     "solana",
        "input":     "",
    }


# ── Graph builder ─────────────────────────────────────────────────────────────
def build_graph(address: str, chain: str, transactions: list) -> tuple:
    if not transactions:
        node = _make_node(address, chain, is_target=True, tx_count=0, x=400, y=300)
        return {"nodes": [node], "links": []}, {"node_count": 1, "link_count": 0}

    addr_lower = address.lower()
    target = _make_node(address, chain, is_target=True,
                        tx_count=len(transactions), x=400, y=300)

    seen: dict[str, dict] = {}
    links: list[dict] = []
    link_ids_seen: set[str] = set()

    for tx in transactions[:30]:
        frm = (tx.get("from") or "").lower()
        to  = (tx.get("to") or "").lower()
        other = to if frm == addr_lower else frm
        if not other or other == addr_lower:
            continue

        if other not in seen:
            label_name, node_type = label_address(other)
            risk = "high" if node_type == "mixer" else "medium" if node_type == "bridge" else "low"
            seen[other] = _make_node(
                other, tx.get("chain", chain),
                is_target=False, node_type=node_type,
                risk_level=risk, label=label_name, tx_count=1, x=0, y=0,
            )
        else:
            seen[other]["txCount"] = seen[other].get("txCount", 1) + 1

        link_id = tx.get("hash", f"link-{len(links)}")
        if link_id not in link_ids_seen:
            link_ids_seen.add(link_id)
            links.append({
                "id":        link_id,
                "source":    address,
                "target":    other,
                "amount":    tx.get("amount", "0"),
                "amountUSD": tx.get("amountUSD", 0),
                "chain":     tx.get("chain", chain),
                "timestamp": tx.get("timestamp", 0),
                "direction": "out" if frm == addr_lower else "in",
                "token":     tx.get("token", "ETH"),
            })

    # Circular layout
    node_list = list(seen.values())
    n = len(node_list)
    cx, cy, radius = 400, 300, 220
    for i, node in enumerate(node_list):
        angle = (2 * math.pi * i / max(n, 1)) - math.pi / 2
        node["x"] = cx + radius * math.cos(angle)
        node["y"] = cy + radius * math.sin(angle)

    nodes = [target] + node_list
    summary = {
        "node_count":      len(nodes),
        "link_count":      len(links),
        "high_risk_count": sum(1 for nd in nodes if nd.get("riskLevel") == "high"),
        "max_depth":       1,
    }
    return {"nodes": nodes, "links": links}, summary


def _make_node(address: str, chain: str, is_target: bool = False,
               node_type: str = "wallet", risk_level: str = "low",
               label: str | None = None, tx_count: int = 0,
               x: float = 300, y: float = 280) -> dict:
    short = address[:6] + "..." + address[-4:] if len(address) > 12 else address
    if not label:
        if is_target:             label = "Searched Wallet"
        elif node_type == "exchange": label = "Exchange"
        elif node_type == "bridge":   label = "Bridge"
        elif node_type == "mixer":    label = "Mixer"
    return {
        "id":           address,
        "address":      address,
        "shortAddress": short,
        "chain":        chain,
        "riskLevel":    "medium" if is_target else risk_level,
        "nodeType":     "target" if is_target else node_type,
        "isTarget":     is_target,
        "label":        label,
        "txCount":      tx_count,
        "tags":         ["Mixer", "OFAC"] if node_type == "mixer" else
                        ["Bridge"] if node_type == "bridge" else [],
        "x": x, "y": y, "vx": 0, "vy": 0,
        "depth": 0 if is_target else 1,
    }