// ─────────────────────────────────────────────────────────────────────────────
// Trace AI – API Client + Demo Data
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AnalysisResult, Chain, GraphData, GraphLink, GraphNode,
  NodeType, OGProof, RiskLevel, RiskSignal, Transaction, Wallet
} from './types'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

export function detectChain(address: string): Chain {
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return 'solana'
  if (/^0x[a-fA-F0-9]{40}$/.test(address))            return 'ethereum'
  if (/^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(address))     return 'ton'
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(address)) return 'bitcoin'
  return 'unknown'
}

export function shortenAddress(addr: string, chars = 6): string {
  if (!addr) return ''
  if (addr.length <= chars * 2 + 4) return addr
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`
}

export function validateAddress(address: string): boolean {
  const t = address.trim()
  return (
    /^0x[a-fA-F0-9]{40}$/.test(t) ||
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t) ||
    /^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(t) ||
    /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(t)
  )
}

export async function analyzeWallet(address: string): Promise<AnalysisResult> {
  try {
    const res = await fetch(`${BACKEND_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address.trim() }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || `Backend ${res.status}`)
    }
    return await res.json() as AnalysisResult
  } catch {
    return generateDemoData(address)
  }
}

// ── Rich demo data (TRM Labs style) ──────────────────────────────────────────
function rng(seed: number, min: number, max: number) {
  return min + (seed % (max - min + 1))
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

export function generateDemoData(address: string): AnalysisResult {
  const chain = detectChain(address)
  const seed  = address.split('').reduce((a, c) => a + c.charCodeAt(0), 0)

  const riskScore = rng(seed, 25, 88)
  const riskLevel: RiskLevel =
    riskScore >= 70 ? 'high' : riskScore >= 42 ? 'medium' : 'low'
  const sybilProb = Math.min(0.97, riskScore * 0.011)

  const now = Date.now()

  // ── Wallets ─────────────────────────────────────────────────────────────────
  const mk = (i: number): string => {
    const h = ((seed + i * 137) % 0xffffff).toString(16).padStart(6,'0')
    const t = ((seed + i * 997) % 0xffffffffffff).toString(16).padStart(12,'0')
    return chain === 'solana'
      ? `Sol${h}${t}kPump`
      : chain === 'ton'
      ? `EQ${h}${t}BizQ`
      : `0x${h}${t}`
  }

  const walletDefs: Array<{label?:string; sublabel?:string; nt:NodeType; rl:RiskLevel; ct:string; tags:string[]}> = [
    { label:'Exchange 3',       nt:'exchange', rl:'low',    ct:'direct',   tags:[] },
    { label:'Suspected Sybil',  nt:'wallet',   rl:'high',   ct:'direct',   tags:['Sybil Suspect','High Volume'] },
    { label:'Exchange 2',       nt:'exchange', rl:'low',    ct:'bridge',   tags:[] },
    { label:'Exchange 4',       sublabel:'17 transfers', nt:'exchange', rl:'low',ct:'bridge',tags:[] },
    { label:'Relay Bridge',     nt:'bridge',   rl:'medium', ct:'bridge',   tags:['Bridge'] },
    { label:undefined,          nt:'wallet',   rl:'high',   ct:'indirect', tags:['Flagged'] },
    { label:'Mixer',            nt:'mixer',    rl:'high',   ct:'indirect', tags:['Mixer','OFAC'] },
    { label:undefined,          nt:'wallet',   rl:'medium', ct:'direct',   tags:[] },
  ]

  const connectedWallets: Wallet[] = walletDefs.map((d, i) => ({
    address:        mk(i),
    chain:          (['ethereum','base','arbitrum','optimism','solana'] as Chain[])[i % 5],
    balance:        `${(rng(seed + i, 1, 500) / 10).toFixed(2)} ETH`,
    balanceUSD:     rng(seed + i, 200, 60000),
    riskLevel:      d.rl,
    nodeType:       d.nt,
    txCount:        rng(seed + i, 4, 250),
    label:          d.label,
    connectionType: d.ct,
    tags:           d.tags,
  }))

  // ── Transactions ─────────────────────────────────────────────────────────────
  const tokens  = ['ETH','USDC','USDT','SOL','TON','BTC']
  const bridges = ['LayerZero','Relay','Jumper',undefined,undefined,undefined]
  const recentTransactions: Transaction[] = Array.from({ length: 10 }, (_, i) => {
    const isOut  = i % 2 === 0
    const from   = isOut ? address : connectedWallets[i % connectedWallets.length].address
    const to     = isOut ? connectedWallets[i % connectedWallets.length].address : address
    const amt    = (rng(seed + i, 1, 8000) / 100).toFixed(4)
    const amtUSD = rng(seed + i * 7, 50, 150000)
    return {
      hash:           `0x${((seed + i * 31337) % 0xffffffffffff).toString(16).padStart(12,'0')}ff${i.toString(16).padStart(4,'0')}`,
      from, to,
      amount:         amt,
      amountUSD:      amtUSD,
      token:          tokens[i % tokens.length],
      timestamp:      now - i * 86_400_000 * rng(seed + i, 1, 4),
      chain:          (['ethereum','base','arbitrum','optimism'] as Chain[])[i % 4],
      bridgeProtocol: bridges[i % bridges.length],
      isDirect:       i < 6,
    }
  })

  // ── Graph ────────────────────────────────────────────────────────────────────
  // Layout: target in center-left, connected wallets spread right in depth levels
  const W = 1200, H = 600
  const cx = 160, cy = H / 2

  const targetNode: GraphNode = {
    id: address, address, shortAddress: shortenAddress(address, 6),
    chain, riskLevel, nodeType: 'target', isTarget: true,
    label: 'Searched Wallet',
    txCount: rng(seed, 50, 800),
    x: cx, y: cy, vx: 0, vy: 0, depth: 0,
  }

  // Group wallets into depth columns (simulating TRM flow)
  const depths = [1,1,2,2,2,3,3,3]
  const depthGroups: Record<number, GraphNode[]> = {}

  const connectedNodes: GraphNode[] = connectedWallets.map((w, i) => {
    const d = depths[i] ?? 1
    if (!depthGroups[d]) depthGroups[d] = []
    const node: GraphNode = {
      id: w.address, address: w.address,
      shortAddress: shortenAddress(w.address, 5),
      chain: w.chain, riskLevel: w.riskLevel,
      nodeType: w.nodeType ?? 'wallet',
      isTarget: false, label: w.label, sublabel: (walletDefs[i] as {sublabel?:string}).sublabel,
      txCount: w.txCount ?? 0, x: 0, y: 0, vx: 0, vy: 0, depth: d,
    }
    depthGroups[d].push(node)
    return node
  })

  // Assign positions based on depth
  const colX: Record<number,number> = { 1: 420, 2: 720, 3: 1000 }
  Object.entries(depthGroups).forEach(([d, nodes]) => {
    const colH = H - 80
    const step  = colH / (nodes.length + 1)
    nodes.forEach((n, i) => {
      n.x = colX[Number(d)] ?? 500
      n.y = 40 + step * (i + 1)
    })
  })

  const allNodes = [targetNode, ...connectedNodes]
  const nodeMap  = new Map(allNodes.map(n => [n.id, n]))

  const graphLinks: GraphLink[] = recentTransactions.map((tx, i): GraphLink => {
    const srcNode = nodeMap.get(tx.from) ? tx.from : address
    const tgtNode = nodeMap.get(tx.to)   ? tx.to   : address
    return {
      id:        tx.hash,
      source:    srcNode,
      target:    tgtNode,
      amount:    tx.amount,
      amountUSD: tx.amountUSD,
      chain:     tx.chain,
      timestamp: tx.timestamp,
      txHash:    tx.hash,
      token:     tx.token,
      isDirect:  tx.isDirect ?? true,
      direction: tx.from === address ? 'out' : 'in',
    }
  })

  const graph: GraphData = { nodes: allNodes, links: graphLinks }

  // ── Signals ───────────────────────────────────────────────────────────────────
  const signals: RiskSignal[] = [
    {
      label:       'Coordinated Sybil Activity',
      severity:    'high',
      description: 'Wallet sent micro-transactions to 12 fresh addresses within a 6-hour window coinciding with a known airdrop snapshot period.',
      icon:        '',
    },
    {
      label:       'Bridge Clustering',
      severity:    'medium',
      description: 'Funds bridged via LayerZero and Relay to 4 wallets displaying identical on-chain interaction patterns.',
      icon:        '',
    },
    {
      label:       'Automated Timing Pattern',
      severity:    'medium',
      description: 'Transactions occur at statistically regular intervals (within 30 seconds), consistent with automated bot execution.',
      icon:        '',
    },
    {
      label:       'Mixer-Adjacent Funding',
      severity:    riskScore >= 60 ? 'high' : 'low',
      description: 'Initial wallet funding traceable to addresses associated with Tornado Cash-adjacent mixing services.',
      icon:        '',
    },
  ]

  const proof: OGProof = {
    workflowAddress: '0xYourDeployedOGWorkflowAddress',
    executionTxHash: `0x${(seed * 999).toString(16).padStart(16,'a')}feed`,
    modelId:         'og-sybil-detector-v1',
    inputHash:       `0x${seed.toString(16).padStart(32,'b')}`,
    outputHash:      `0x${(seed + 1).toString(16).padStart(32,'c')}`,
    timestamp:       now,
    teeProvider:     'Marlin TEE (Intel TDX)',
    rawProof: {
      version:    '1.0',
      enclave_id: `tee-${seed.toString(16)}`,
      measurements: { pcr0: `0x${seed.toString(16).padStart(64,'0')}` },
      signature:    `0x${(seed * 42).toString(16).padStart(64,'0')}`,
    },
  }

  const explanationMap: Record<RiskLevel,string> = {
    high:   `High-confidence Sybil indicators detected. AI identified coordinated transaction bursts targeting airdrop snapshots, mixer-adjacent funding, and direct clustering with ${connectedWallets.filter(w=>w.riskLevel==='high').length} other flagged wallets. Probability of legitimate organic activity is low.`,
    medium: `Moderate risk signals present. Bridge clustering and irregular transaction timing suggest possible Sybil behaviour, but evidence is insufficient for definitive classification. Manual review is recommended before high-value decisions.`,
    low:    `Wallet exhibits organic transaction patterns. Funding sources are clean, timing is irregular (consistent with human behaviour), and no significant overlap with known bad-actor clusters. No Sybil indicators detected.`,
  }

  return {
    targetAddress: address,
    chain,
    analyzedAt: now,
    riskScore,
    riskLevel,
    sybilProbability: parseFloat(sybilProb.toFixed(2)),
    explanation: explanationMap[riskLevel],
    signals,
    connectedWallets,
    recentTransactions,
    graph,
    proof,
    dataSource: 'demo',
  }
}
