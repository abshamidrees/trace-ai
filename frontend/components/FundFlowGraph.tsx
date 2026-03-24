'use client'

/**
 * FundFlowGraph — MetaSleuth/Arkham-style canvas graph
 *
 * Default view  : static, no interactions (clean visual)
 * Fullscreen    : full-screen modal with zoom/pan/drag/click-to-inspect
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { GraphData, GraphNode, GraphLink, NodeType, RiskLevel } from '../lib/types'
import { shortenAddress } from '../lib/api'

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = '#06060f'
const GRID_C = 'rgba(120,100,255,0.055)'

const RISK: Record<RiskLevel, { ring: string; glow: string; fill: string }> = {
  high:   { ring: '#ff4d6a', glow: 'rgba(255,77,106,0.4)',  fill: 'rgba(255,77,106,0.08)' },
  medium: { ring: '#ffad3b', glow: 'rgba(255,173,59,0.4)',  fill: 'rgba(255,173,59,0.08)' },
  low:    { ring: '#36d399', glow: 'rgba(54,211,153,0.4)',  fill: 'rgba(54,211,153,0.08)' },
}

const NODE_T: Record<NodeType, { icon: string }> = {
  target:   { icon: '#a78bfa' },
  exchange: { icon: '#2dd4bf' },
  bridge:   { icon: '#7f5af0' },
  mixer:    { icon: '#f87171' },
  wallet:   { icon: '#64748b' },
  victim:   { icon: '#fb923c' },
}

const CHAIN_C: Record<string, string> = {
  ethereum: '#627eea', base: '#0052ff', arbitrum: '#12aaff',
  polygon:  '#8247e5', solana: '#9945ff',
  unknown:  '#475569',
}

const NR = 24, TR = 32, RING = 3

// ── Helpers ───────────────────────────────────────────────────────────────────
function rgba(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// ── Node icon ─────────────────────────────────────────────────────────────────
function drawIcon(ctx: CanvasRenderingContext2D, nt: NodeType, x: number, y: number, sz: number, col: string) {
  ctx.save()
  ctx.fillStyle = col
  ctx.strokeStyle = col
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (nt) {
    case 'exchange': {
      // Building / exchange icon
      const bw = sz * 1.1, bh = sz * 1.0
      ctx.beginPath()
      ctx.moveTo(x - bw / 2, y - bh / 2 + sz * .3)
      ctx.lineTo(x, y - bh / 2 - sz * .15)
      ctx.lineTo(x + bw / 2, y - bh / 2 + sz * .3)
      ctx.closePath()
      ctx.fill()
      for (let i = 0; i < 3; i++) {
        const cx2 = x - bw / 2 + 1.5 + (bw - 3) / 3 * i + (bw - 3) / 3 * .1
        ctx.fillRect(cx2, y - bh / 2 + sz * .3, (bw - 3) / 3 * .8, bh * .6)
      }
      ctx.fillRect(x - bw / 2, y + bh / 2 - sz * .12, bw, sz * .12)
      break
    }
    case 'bridge': {
      // Diamond
      const s = sz * .8
      ctx.beginPath()
      ctx.moveTo(x, y - s)
      ctx.lineTo(x + s * .7, y)
      ctx.lineTo(x, y + s)
      ctx.lineTo(x - s * .7, y)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'mixer': {
      // Funnel
      const s = sz * .8
      ctx.beginPath()
      ctx.moveTo(x - s, y - s * .7)
      ctx.lineTo(x + s, y - s * .7)
      ctx.lineTo(x + s * .3, y + s * .7)
      ctx.lineTo(x - s * .3, y + s * .7)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'target': {
      // Star / crosshair
      const s = sz * .65
      ctx.lineWidth = 1.8
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.stroke()
      ctx.beginPath(); ctx.arc(x, y, s * .45, 0, Math.PI * 2); ctx.stroke()
      break
    }
    case 'victim': {
      // Warning triangle
      const sv = sz * .8
      ctx.beginPath()
      ctx.moveTo(x, y - sv)
      ctx.lineTo(x + sv * .85, y + sv * .7)
      ctx.lineTo(x - sv * .85, y + sv * .7)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = rgba('#000', .4)
      ctx.beginPath(); ctx.arc(x, y + sv * .35, sz * .12, 0, Math.PI * 2); ctx.fill()
      break
    }
    default: {
      // Wallet icon
      const s = sz * .7, r = sz * .15
      const l = x - s, t = y - s * .6, w = s * 2, h = s * 1.2
      ctx.beginPath()
      ctx.moveTo(l + r, t); ctx.lineTo(l + w - r, t); ctx.arcTo(l + w, t, l + w, t + r, r)
      ctx.lineTo(l + w, t + h - r); ctx.arcTo(l + w, t + h, l + w - r, t + h, r)
      ctx.lineTo(l + r, t + h); ctx.arcTo(l, t + h, l, t + h - r, r)
      ctx.lineTo(l, t + r); ctx.arcTo(l, t, l + r, t, r)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = rgba('#000', .2)
      ctx.fillRect(l + s * .25, t + h * .38, s * .7, h * .28)
      break
    }
  }
  ctx.restore()
}

// ── Arrow ─────────────────────────────────────────────────────────────────────
function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, color: string) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle)
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-size, -size * .55); ctx.lineTo(-size, size * .55)
  ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.restore()
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props { data: GraphData }

// ── Main Component ────────────────────────────────────────────────────────────
export default function FundFlowGraph({ data }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const rafRef     = useRef<number>(0)
  const nodesRef   = useRef<GraphNode[]>([])
  const linksRef   = useRef<GraphLink[]>([])
  const dragNode   = useRef<GraphNode | null>(null)
  const panRef     = useRef({ x: 0, y: 0 })
  const panStart   = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const isPanning  = useRef(false)
  const zoom       = useRef(1)
  const hoverNode  = useRef<GraphNode | null>(null)
  const pulseT     = useRef(0)
  const settled    = useRef(false)
  const ticks      = useRef(0)

  const [isFS,       setIsFS]       = useState(false)
  const [selectedNode, setSelected] = useState<GraphNode | null>(null)
  const [tooltip,    setTooltip]    = useState<{ x: number; y: number; node: GraphNode } | null>(null)
  const [copied,     setCopied]     = useState(false)

  // ── Data init ──────────────────────────────────────────────────────────────
  const fitView = useCallback((W: number, H: number) => {
    const nodes = nodesRef.current
    if (!nodes.length) return
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y)
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const gW = maxX - minX + NR * 8, gH = maxY - minY + NR * 8
    zoom.current = Math.min(Math.min(W / gW, H / gH) * .85, 1.2)
    panRef.current = {
      x: W / 2 - ((minX + maxX) / 2) * zoom.current,
      y: H / 2 - ((minY + maxY) / 2) * zoom.current,
    }
  }, [])

  useEffect(() => {
    settled.current = false; ticks.current = 0
    nodesRef.current = data.nodes.map(n => ({ ...n, vx: 0, vy: 0 }))
    linksRef.current = data.links
    setSelected(null)
    const c = canvasRef.current
    if (c) fitView(c.offsetWidth, c.offsetHeight)
  }, [data, fitView])

  // ── Physics ────────────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    if (settled.current) return
    if (++ticks.current > 320) { settled.current = true; return }
    const nodes = nodesRef.current, links = linksRef.current
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        const dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
        const f = 9000 / (dist * dist)
        const fx = (dx / dist) * f, fy = (dy / dist) * f
        if (a.fx == null) { a.vx -= fx; a.vy -= fy }
        if (b.fx == null) { b.vx += fx; b.vy += fy }
      }
    }
    const nm = new Map(nodes.map(n => [n.id, n]))
    for (const l of links) {
      const s = nm.get(l.source), t = nm.get(l.target); if (!s || !t) continue
      const dx = t.x - s.x, dy = t.y - s.y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
      const f = (dist - 180) * .03
      const fx = (dx / dist) * f, fy = (dy / dist) * f
      if (s.fx == null) { s.vx += fx; s.vy += fy }
      if (t.fx == null) { t.vx -= fx; t.vy -= fy }
    }
    const W = canvasRef.current?.offsetWidth ?? 800
    const H = canvasRef.current?.offsetHeight ?? 500
    for (const n of nodes) {
      if (n.fx != null) { n.x = n.fx; n.vx = 0 }
      if (n.fy != null) { n.y = n.fy; n.vy = 0 }
      if (n.fx == null) { n.vx = (n.vx + (W / 2 - n.x) * .002) * .82; n.x += n.vx; n.x = Math.max(60, Math.min(W - 60, n.x)) }
      if (n.fy == null) { n.vy = (n.vy + (H / 2 - n.y) * .002) * .82; n.y += n.vy; n.y = Math.max(60, Math.min(H - 60, n.y)) }
    }
  }, [])

  // ── Draw ───────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
      ctx.scale(dpr, dpr)
    }
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)

    pulseT.current += .016

    // Dot grid
    ctx.save()
    const gs = 32 * zoom.current
    const offX = ((panRef.current.x % gs) + gs) % gs
    const offY = ((panRef.current.y % gs) + gs) % gs
    ctx.fillStyle = GRID_C
    for (let gx = offX - gs; gx < W + gs; gx += gs)
      for (let gy = offY - gs; gy < H + gs; gy += gs) {
        ctx.beginPath(); ctx.arc(gx, gy, .8, 0, Math.PI * 2); ctx.fill()
      }
    ctx.restore()

    ctx.save()
    ctx.translate(panRef.current.x, panRef.current.y)
    ctx.scale(zoom.current, zoom.current)

    const nodes = nodesRef.current, links = linksRef.current
    const nm = new Map(nodes.map(n => [n.id, n]))

    // Draw links
    for (const link of links) {
      const s = nm.get(link.source), t = nm.get(link.target); if (!s || !t) continue
      const dx = t.x - s.x, dy = t.y - s.y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
      const nx = dx / dist, ny = dy / dist
      const sR = s.isTarget ? TR + RING : NR + RING
      const tR = t.isTarget ? TR + RING : NR + RING
      const x1 = s.x + nx * sR, y1 = s.y + ny * sR
      const x2 = t.x - nx * tR, y2 = t.y - ny * tR

      const chainCol = CHAIN_C[link.chain || 'unknown'] || CHAIN_C.unknown
      const isHovered = hoverNode.current?.id === s.id || hoverNode.current?.id === t.id

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
      const isDirect = !link.isDirect === false || link.isDirect !== false
      ctx.setLineDash(isDirect ? [] : [5, 4])
      ctx.strokeStyle = isHovered ? chainCol : rgba(chainCol, .35)
      ctx.lineWidth = isHovered ? 1.8 : 1.1
      if (isHovered) { ctx.shadowBlur = 8; ctx.shadowColor = chainCol }
      ctx.stroke()
      ctx.restore()

      // Arrow
      if (dist > 30) {
        const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2
        const angle = Math.atan2(dy, dx)
        drawArrow(ctx, midX, midY, angle, 5, isHovered ? chainCol : rgba(chainCol, .5))
      }
    }

    // Draw nodes
    for (const node of nodes) {
      const r = node.isTarget ? TR : NR
      const risk = RISK[node.riskLevel]
      const nt = NODE_T[node.nodeType] || NODE_T.wallet
      const isHov = hoverNode.current?.id === node.id
      const isSel = selectedNode?.id === node.id
      const pulse = isHov || isSel

      // Outer glow
      if (pulse) {
        const g = ctx.createRadialGradient(node.x, node.y, r * .5, node.x, node.y, r * 2.2)
        g.addColorStop(0, rgba(risk.ring, .2 + Math.sin(pulseT.current * 3) * .08))
        g.addColorStop(1, rgba(risk.ring, 0))
        ctx.beginPath(); ctx.arc(node.x, node.y, r * 2.2, 0, Math.PI * 2)
        ctx.fillStyle = g; ctx.fill()
      }

      // Ring
      ctx.beginPath(); ctx.arc(node.x, node.y, r + RING, 0, Math.PI * 2)
      ctx.strokeStyle = isSel ? risk.ring : isHov ? rgba(risk.ring, .8) : rgba(risk.ring, .5)
      ctx.lineWidth = isSel ? 2.5 : isHov ? 2 : 1.5
      if (isHov || isSel) { ctx.shadowBlur = 14; ctx.shadowColor = risk.ring }
      ctx.stroke(); ctx.shadowBlur = 0

      // Fill
      ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
      ctx.fillStyle = rgba(risk.ring, pulse ? .12 : .06); ctx.fill()

      // Inner border
      ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = rgba(risk.ring, pulse ? .3 : .15); ctx.lineWidth = .8; ctx.stroke()

      // Icon
      drawIcon(ctx, node.nodeType, node.x, node.y, r * .42, nt.icon)

      // Chain dot (bottom right)
      const cdot = CHAIN_C[node.chain] || CHAIN_C.unknown
      const dAngle = Math.PI * .32
      const dx2 = Math.cos(dAngle) * (r + RING * .5)
      const dy2 = Math.sin(dAngle) * (r + RING * .5)
      ctx.beginPath(); ctx.arc(node.x + dx2, node.y + dy2, 4, 0, Math.PI * 2)
      ctx.fillStyle = cdot; ctx.fill()
      ctx.beginPath(); ctx.arc(node.x + dx2, node.y + dy2, 4, 0, Math.PI * 2)
      ctx.strokeStyle = BG; ctx.lineWidth = 1.5; ctx.stroke()

      // Label
      const label = node.label || shortenAddress(node.address, 4)
      ctx.font = `${node.isTarget ? 600 : 400} ${node.isTarget ? 11 : 9.5}px DM Sans, sans-serif`
      ctx.textAlign = 'center'
      const textY = node.y + r + RING + 14
      if (node.isTarget) {
        // Target gets a background pill
        const tw = ctx.measureText(label).width
        ctx.fillStyle = rgba(risk.ring, .08)
        const px = 8, py = 3
        ctx.beginPath()
        ctx.roundRect(node.x - tw / 2 - px, textY - 10, tw + px * 2, 16, 4)
        ctx.fill()
        ctx.fillStyle = risk.ring
      } else {
        ctx.fillStyle = isHov ? '#e2e8f0' : '#94a3b8'
      }
      ctx.fillText(label, node.x, textY)

      // Bridge/exchange "expand hint" dot
      if ((node.nodeType === 'bridge' || node.nodeType === 'exchange' || node.nodeType === 'mixer') && isFS) {
        ctx.beginPath()
        ctx.arc(node.x + r + RING - 1, node.y - r - RING + 1, 5, 0, Math.PI * 2)
        ctx.fillStyle = '#7f5af0'; ctx.fill()
        ctx.font = 'bold 7px monospace'
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'
        ctx.fillText('i', node.x + r + RING - 1, node.y - r - RING + 3.5)
      }
    }

    ctx.restore()
  }, [isFS, selectedNode])

  // ── Animation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = () => { tick(); draw(); rafRef.current = requestAnimationFrame(loop) }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [tick, draw])

  // ── Coordinate helpers ────────────────────────────────────────────────────
  const toWorld = (cx: number, cy: number) => ({
    x: (cx - panRef.current.x) / zoom.current,
    y: (cy - panRef.current.y) / zoom.current,
  })
  const getPos = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { cx: e.clientX - r.left, cy: e.clientY - r.top }
  }
  const getNode = (wx: number, wy: number) =>
    nodesRef.current.find(n => {
      const r = (n.isTarget ? TR : NR) + RING + 4
      return (n.x - wx) ** 2 + (n.y - wy) ** 2 <= r * r
    }) ?? null

  // ── Mouse events (only active in fullscreen) ──────────────────────────────
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isFS) return
    const { cx, cy } = getPos(e), { x: wx, y: wy } = toWorld(cx, cy)
    const node = getNode(wx, wy)
    hoverNode.current = node
    if (dragNode.current) { dragNode.current.fx = wx; dragNode.current.fy = wy; settled.current = false }
    else if (isPanning.current) {
      panRef.current = {
        x: panStart.current.px + (cx - panStart.current.mx),
        y: panStart.current.py + (cy - panStart.current.my),
      }
    }
    if (node) setTooltip({ x: cx, y: cy, node }); else setTooltip(null)
  }
  const onMouseDown = (e: React.MouseEvent) => {
    if (!isFS) return
    const { cx, cy } = getPos(e), { x: wx, y: wy } = toWorld(cx, cy)
    const node = getNode(wx, wy)
    if (node) { dragNode.current = node; node.fx = wx; node.fy = wy }
    else { isPanning.current = true; panStart.current = { mx: cx, my: cy, px: panRef.current.x, py: panRef.current.y } }
  }
  const onMouseUp = () => {
    if (dragNode.current && !dragNode.current.isTarget) { dragNode.current.fx = null; dragNode.current.fy = null }
    dragNode.current = null; isPanning.current = false
  }
  const onMouseLeave = () => {
    hoverNode.current = null; isPanning.current = false; dragNode.current = null; setTooltip(null)
  }
  const onClick = (e: React.MouseEvent) => {
    if (!isFS) return
    const { cx, cy } = getPos(e), { x: wx, y: wy } = toWorld(cx, cy)
    const node = getNode(wx, wy)
    setSelected(prev => prev?.id === node?.id ? null : node)
  }
  const onWheel = (e: React.WheelEvent) => {
    if (!isFS) return
    e.preventDefault()
    const { cx, cy } = getPos(e)
    const delta = e.deltaY < 0 ? 1.12 : .9
    const nz = Math.max(.2, Math.min(4, zoom.current * delta))
    panRef.current = {
      x: cx - (cx - panRef.current.x) * (nz / zoom.current),
      y: cy - (cy - panRef.current.y) * (nz / zoom.current),
    }
    zoom.current = nz
  }

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  const toggleFS = () => {
    setIsFS(v => {
      const next = !v
      setTimeout(() => {
        const c = canvasRef.current; if (!c) return
        fitView(c.offsetWidth, c.offsetHeight)
      }, 80)
      return next
    })
    setSelected(null)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && isFS) { setIsFS(false); setSelected(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFS])

  // ── Counts ─────────────────────────────────────────────────────────────────
  const nlen = nodesRef.current.length
  const llen  = linksRef.current.length

  // ── Cursor ─────────────────────────────────────────────────────────────────
  const cursor = !isFS ? 'default'
    : dragNode.current ? 'grabbing'
    : isPanning.current ? 'grabbing'
    : hoverNode.current ? 'pointer'
    : 'grab'

  // ── Wrapper style ──────────────────────────────────────────────────────────
  const wrapStyle = isFS
    ? { position: 'fixed' as const, inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column' as const, background: BG }
    : { width: '100%', height: '100%', display: 'flex', flexDirection: 'column' as const, background: BG }

  // ── Portal fullscreen canvas (same JSX, rendered via portal when FS) ──────
  const graphCanvas = (
    <div style={wrapStyle}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', borderBottom: '1px solid #1a1830',
        flexShrink: 0, background: 'rgba(6,6,15,0.95)',
      }}>
        <span style={{ fontFamily: 'Space Mono,monospace', fontSize: 10, color: '#475569' }}>
          {nlen} wallets · {llen} transfers
          {!isFS && <span style={{ marginLeft: 8, color: '#2d2b4a' }}>· click ⛶ to explore</span>}
          {isFS  && <span style={{ marginLeft: 8, color: '#475569' }}>· scroll=zoom · drag=pan · click node=inspect · Esc=close</span>}
        </span>
        <button
          onClick={toggleFS}
          title={isFS ? 'Exit fullscreen (Esc)' : 'Expand to explore'}
          style={{
            background: isFS ? 'rgba(127,90,240,0.2)' : 'rgba(30,27,58,0.8)',
            border: '1px solid rgba(127,90,240,0.35)', borderRadius: 6,
            color: '#a78bfa', cursor: 'pointer', padding: '7px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .15s',
          }}
        >
          {isFS ? (
            // Compress: arrows pointing inward to center
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5"/>
            </svg>
          ) : (
            // Expand: arrows pointing outward to corners
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"/>
            </svg>
          )}
        </button>
      </div>

      {/* ── Canvas area ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', cursor, display: 'block', userSelect: 'none' }}
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onClick={onClick}
          onWheel={onWheel}
        />

        {/* ── Tooltip (hover, fullscreen only) ── */}
        {isFS && tooltip && !selectedNode && (
          <div style={{
            position: 'absolute', pointerEvents: 'none', zIndex: 10,
            left: tooltip.x + 16, top: Math.max(8, tooltip.y - 80),
            maxWidth: 220, background: 'rgba(10,9,26,0.96)',
            border: `1px solid ${RISK[tooltip.node.riskLevel].ring}40`,
            borderRadius: 10, padding: '10px 14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          }}>
            <div style={{ fontFamily: 'Space Mono,monospace', fontSize: 10.5, color: '#e2e8f0', marginBottom: 4 }}>
              {shortenAddress(tooltip.node.address, 7)}
            </div>
            <div style={{ display: 'flex', gap: 6, fontSize: 10, marginBottom: 3, flexWrap: 'wrap' }}>
              <span style={{ color: RISK[tooltip.node.riskLevel].ring, fontWeight: 700, textTransform: 'uppercase', fontSize: 9 }}>
                {tooltip.node.riskLevel} risk
              </span>
              <span style={{ color: '#1e1b3a' }}>·</span>
              <span style={{ color: CHAIN_C[tooltip.node.chain] || '#475569', fontSize: 9, textTransform: 'capitalize' }}>
                {tooltip.node.chain}
              </span>
              <span style={{ color: '#1e1b3a' }}>·</span>
              <span style={{ color: '#64748b', fontSize: 9, textTransform: 'capitalize' }}>{tooltip.node.nodeType}</span>
            </div>
            {tooltip.node.label && (
              <div style={{ fontSize: 10, color: '#7f5af0', marginBottom: 3 }}>{tooltip.node.label}</div>
            )}
            <div style={{ fontFamily: 'Space Mono,monospace', fontSize: 9, color: '#475569' }}>
              {tooltip.node.txCount} tx{tooltip.node.txCount !== 1 ? 's' : ''}
            </div>
            {(tooltip.node.nodeType === 'bridge' || tooltip.node.nodeType === 'exchange' || tooltip.node.nodeType === 'mixer') && (
              <div style={{ marginTop: 5, fontSize: 9, color: '#7f5af0' }}>click to inspect</div>
            )}
          </div>
        )}

        {/* ── Selected node panel (fullscreen, right side) ── */}
        {isFS && selectedNode && (
          <div style={{
            position: 'absolute', top: 12, right: 12, width: 260,
            background: 'rgba(10,9,26,0.97)',
            border: `1px solid ${RISK[selectedNode.riskLevel].ring}35`,
            borderRadius: 12, padding: '14px 16px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.8)',
            zIndex: 20,
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: 'Space Mono,monospace', fontSize: 10, color: '#e2e8f0', marginBottom: 2 }}>
                  {selectedNode.label || selectedNode.nodeType.toUpperCase()}
                </div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px',
                  borderRadius: 999, fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                  background: `${RISK[selectedNode.riskLevel].ring}15`,
                  border: `1px solid ${RISK[selectedNode.riskLevel].ring}35`,
                  color: RISK[selectedNode.riskLevel].ring,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: RISK[selectedNode.riskLevel].ring, display: 'inline-block' }} />
                  {selectedNode.riskLevel} risk
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={{
                background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 16, lineHeight: 1,
              }}>×</button>
            </div>

            {/* Address */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: '#475569', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Address</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'Space Mono,monospace', fontSize: 9.5, color: '#94a3b8', wordBreak: 'break-all' }}>
                  {selectedNode.address.slice(0, 18)}...{selectedNode.address.slice(-6)}
                </span>
                <button
                  onClick={() => { navigator.clipboard.writeText(selectedNode.address); setCopied(true); setTimeout(() => setCopied(false), 1400) }}
                  style={{ background: 'rgba(127,90,240,0.1)', border: '1px solid rgba(127,90,240,0.2)', borderRadius: 4, color: '#a78bfa', cursor: 'pointer', padding: '2px 7px', fontSize: 9, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {copied ? '✓' : 'copy'}
                </button>
              </div>
            </div>

            {/* Details */}
            {[
              ['Chain', selectedNode.chain, CHAIN_C[selectedNode.chain] || '#475569'],
              ['Type',  selectedNode.nodeType, '#64748b'],
              ['Txns',  String(selectedNode.txCount), '#94a3b8'],
            ].map(([k, v, c]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #1e1b3a', fontSize: 11 }}>
                <span style={{ color: '#475569' }}>{k}</span>
                <span style={{ color: c as string, textTransform: 'capitalize' }}>{v}</span>
              </div>
            ))}

            {/* External link */}
            <a
              href={`https://etherscan.io/address/${selectedNode.address}`}
              target="_blank" rel="noreferrer"
              style={{ display: 'block', marginTop: 12, textAlign: 'center', padding: '7px', borderRadius: 8, background: 'rgba(127,90,240,0.08)', border: '1px solid rgba(127,90,240,0.2)', color: '#7f5af0', fontSize: 10, textDecoration: 'none' }}>
              View on Explorer ↗
            </a>

            {/* Bridge/mixer note */}
            {(selectedNode.nodeType === 'bridge' || selectedNode.nodeType === 'mixer') && (
              <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(127,90,240,0.06)', border: '1px solid rgba(127,90,240,0.12)', fontSize: 10, color: '#64748b', lineHeight: 1.5 }}>
                {selectedNode.nodeType === 'bridge'
                  ? '→ Funds passed through this bridge contract. Destination address appears as a separate node if on a supported chain.'
                  : '⚠ Mixer detected — funds may have been obfuscated. High risk indicator.'}
              </div>
            )}
          </div>
        )}

        {/* ── Legend (always visible) ── */}
        <div style={{ position: 'absolute', bottom: 10, left: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(['high', 'medium', 'low'] as RiskLevel[]).map(l => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Space Mono,monospace', fontSize: 9, color: '#475569' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: RISK[l].ring, display: 'inline-block' }} />
              {l.charAt(0).toUpperCase() + l.slice(1)} Risk
            </div>
          ))}
          <div style={{ marginTop: 4, paddingTop: 5, borderTop: '1px solid #1a1830', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {(['exchange', 'bridge', 'mixer'] as NodeType[]).map(nt => (
              <div key={nt} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Space Mono,monospace', fontSize: 9, color: '#475569' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: NODE_T[nt].icon, display: 'inline-block' }} />
                {nt.charAt(0).toUpperCase() + nt.slice(1)}
              </div>
            ))}
          </div>
        </div>

        {/* ── Chain legend (bottom right) ── */}
        <div style={{ position: 'absolute', bottom: 10, right: 12, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {Object.entries(CHAIN_C).filter(([k]) => k !== 'unknown').map(([chain, color]) => (
            <div key={chain} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'Space Mono,monospace', fontSize: 9, color: '#475569' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
              {chain.charAt(0).toUpperCase() + chain.slice(1)}
            </div>
          ))}
        </div>

        {/* ── Static overlay hint (default view only) ── */}
        {!isFS && (
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              background: 'rgba(6,6,15,0.0)',
              padding: '8px 16px', borderRadius: 8,
              fontFamily: 'Space Mono,monospace', fontSize: 10, color: 'rgba(71,85,105,0)',
            }}>
              Click Explore to interact
            </div>
          </div>
        )}
      </div>
    </div>
  )

  if (isFS && typeof document !== 'undefined') {
    return createPortal(graphCanvas, document.body)
  }
  return graphCanvas
}