// ─────────────────────────────────────────────────────────────────────────────
// Trace AI – Shared Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type Chain = 'ethereum' | 'base' | 'solana' | 'arbitrum' | 'optimism' | 'polygon' | 'ton' | 'bitcoin' | 'unknown'
export type RiskLevel = 'high' | 'medium' | 'low'

// Node visual type — controls icon + base styling (like TRM Labs)
export type NodeType =
  | 'target'    // the wallet being searched (orange ring, center)
  | 'exchange'  // known CEX / DEX (building icon, teal)
  | 'bridge'    // cross-chain bridge
  | 'victim'    // known scam victim (blue ring)
  | 'mixer'     // mixer (dark red)
  | 'wallet'    // generic wallet

export interface Wallet {
  address: string
  chain: Chain
  balance?: string
  balanceUSD?: number
  label?: string
  riskLevel: RiskLevel
  nodeType?: NodeType
  txCount?: number
  firstSeen?: number
  lastSeen?: number
  tags?: string[]
  connectionType?: string
}

export interface Transaction {
  hash: string
  from: string
  to: string
  amount: string
  amountUSD: number
  token: string
  timestamp: number
  chain: Chain
  blockNumber?: number
  gasUSD?: number
  bridgeProtocol?: string
  isDirect?: boolean
}

export interface GraphNode {
  id: string
  address: string
  shortAddress: string
  chain: Chain
  riskLevel: RiskLevel
  nodeType: NodeType
  isTarget: boolean
  label?: string
  sublabel?: string
  txCount: number
  balanceUSD?: number
  x: number
  y: number
  vx: number
  vy: number
  fx?: number | null
  fy?: number | null
  depth?: number
}

export interface GraphLink {
  id: string
  source: string
  target: string
  amount: string
  amountUSD: number
  chain: Chain
  timestamp: number
  txHash: string
  token: string
  isDirect: boolean
  direction: 'out' | 'in'
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

export interface OGProof {
  workflowAddress: string
  executionTxHash: string
  modelId: string
  inputHash: string
  outputHash: string
  timestamp: number
  teeProvider: string
  attestationReport?: string
  rawProof?: Record<string, unknown>
}

export interface AnalysisResult {
  targetAddress: string
  chain: Chain
  analyzedAt: number
  riskScore: number
  riskLevel: RiskLevel
  sybilProbability: number
  explanation: string
  signals: RiskSignal[]
  connectedWallets: Wallet[]
  recentTransactions: Transaction[]
  graph: GraphData
  proof: OGProof
  dataSource: 'live' | 'demo'
}

export interface RiskSignal {
  label: string
  severity: RiskLevel
  description: string
  icon?: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}
