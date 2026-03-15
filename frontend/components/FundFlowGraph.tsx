'use client'

/**
 * FundFlowGraph — TRM Labs–style canvas graph
 * Fullscreen expand only (no +/- zoom buttons — scroll to zoom)
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { GraphData, GraphNode, GraphLink, NodeType, RiskLevel } from '../lib/types'
import { shortenAddress } from '../lib/api'

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG      = '#06060f'
const GRID_C  = 'rgba(120,100,255,0.065)'

const RISK: Record<RiskLevel, { ring:string; glow:string; fill:string }> = {
  high:   { ring:'#ff4d6a', glow:'rgba(255,77,106,0.45)',  fill:'rgba(255,77,106,0.1)'  },
  medium: { ring:'#ffad3b', glow:'rgba(255,173,59,0.45)',  fill:'rgba(255,173,59,0.1)'  },
  low:    { ring:'#36d399', glow:'rgba(54,211,153,0.45)',  fill:'rgba(54,211,153,0.1)'  },
}

const NODE_T: Record<NodeType, { body:string; icon:string }> = {
  target:   { body:'#1a1230', icon:'#a78bfa' },
  exchange: { body:'#0d1f2d', icon:'#2dd4bf' },
  bridge:   { body:'#1a1030', icon:'#7f5af0' },
  mixer:    { body:'#1f0d0d', icon:'#f87171' },
  wallet:   { body:'#111120', icon:'#94a3b8' },
}

const CHAIN_C: Record<string, string> = {
  ethereum:'#627eea', base:'#0052ff', arbitrum:'#12aaff',
  optimism:'#ff0420', polygon:'#8247e5', solana:'#9945ff',
  ton:'#0088cc', bitcoin:'#f7931a', unknown:'#475569',
}

const NR=26, TR=34, RING=4

// ── Helpers ───────────────────────────────────────────────────────────────────
function rgba(hex:string, a:number){
  const n=parseInt(hex.replace('#',''),16)
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`
}
function fmtUSD(v:number){
  if(v>=1e6) return `$${(v/1e6).toFixed(2)}M`
  if(v>=1000) return `$${(v/1000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

// ── Node icon ─────────────────────────────────────────────────────────────────
function drawIcon(ctx:CanvasRenderingContext2D, nt:NodeType, x:number, y:number, sz:number, col:string){
  ctx.save(); ctx.fillStyle=col; ctx.strokeStyle=col; ctx.lineWidth=1.4
  ctx.lineCap='round'; ctx.lineJoin='round'
  switch(nt){
    case 'exchange':{
      const bw=sz*1.2,bh=sz*1.1
      ctx.beginPath(); ctx.moveTo(x-bw/2,y-bh/2+sz*.3); ctx.lineTo(x,y-bh/2-sz*.15); ctx.lineTo(x+bw/2,y-bh/2+sz*.3); ctx.closePath(); ctx.fill()
      for(let i=0;i<3;i++){ const cx2=x-bw/2+2+(bw-4)/3*i+(bw-4)/3*.15; ctx.fillRect(cx2,y-bh/2+sz*.3,(bw-4)/3*.7,bh*.65) }
      ctx.fillRect(x-bw/2,y+bh/2-sz*.12,bw,sz*.12); break
    }
    case 'bridge':{const s=sz*.8; ctx.beginPath(); ctx.moveTo(x,y-s); ctx.lineTo(x+s*.7,y); ctx.lineTo(x,y+s); ctx.lineTo(x-s*.7,y); ctx.closePath(); ctx.fill(); break}
    case 'mixer':{ const s=sz*.8; ctx.beginPath(); ctx.moveTo(x-s,y-s*.7); ctx.lineTo(x+s,y-s*.7); ctx.lineTo(x+s*.3,y+s*.7); ctx.lineTo(x-s*.3,y+s*.7); ctx.closePath(); ctx.fill(); break}
    case 'wallet': default:{
      const s=sz*.72,r=sz*.17,l=x-s,t=y-s*.64,w=s*2,h=s*1.28
      ctx.beginPath(); ctx.moveTo(l+r,t); ctx.lineTo(l+w-r,t); ctx.arcTo(l+w,t,l+w,t+r,r); ctx.lineTo(l+w,t+h-r); ctx.arcTo(l+w,t+h,l+w-r,t+h,r); ctx.lineTo(l+r,t+h); ctx.arcTo(l,t+h,l,t+h-r,r); ctx.lineTo(l,t+r); ctx.arcTo(l,t,l+r,t,r); ctx.closePath(); ctx.fill()
      ctx.fillStyle=rgba('#000',.24); ctx.fillRect(l+s*.3,t+h*.35,s*.65,h*.3); break
    }
  }
  ctx.restore()
}

// ── Arrow ─────────────────────────────────────────────────────────────────────
function drawArrow(ctx:CanvasRenderingContext2D, x:number, y:number, angle:number, size:number, color:string){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle)
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-size,-size*.55); ctx.lineTo(-size,size*.55); ctx.closePath()
  ctx.fillStyle=color; ctx.shadowBlur=6; ctx.shadowColor=color; ctx.fill(); ctx.restore()
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props { data: GraphData; onNodeClick?: (nodeId:string) => void }

// ── Component ─────────────────────────────────────────────────────────────────
export default function FundFlowGraph({ data, onNodeClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)
  const rafRef    = useRef<number>(0)
  const nodesRef  = useRef<GraphNode[]>([])
  const linksRef  = useRef<GraphLink[]>([])
  const dragNode  = useRef<GraphNode|null>(null)
  const panRef    = useRef({ x:0, y:0 })
  const panStart  = useRef({ mx:0, my:0, px:0, py:0 })
  const isPanning = useRef(false)
  const zoom      = useRef(1)
  const hoverNode = useRef<GraphNode|null>(null)
  const pulseT    = useRef(0)
  const settled   = useRef(false)
  const ticks     = useRef(0)

  const [tooltip, setTooltip] = useState<{x:number;y:number;node:GraphNode}|null>(null)
  const [isFS,    setIsFS]    = useState(false)

  useEffect(() => {
    settled.current = false; ticks.current = 0
    nodesRef.current = data.nodes.map(n => ({...n, vx:0, vy:0}))
    linksRef.current = data.links

    const canvas = canvasRef.current
    if (!canvas) return
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    const xs = nodesRef.current.map(n=>n.x), ys = nodesRef.current.map(n=>n.y)
    const [minX,maxX,minY,maxY] = [Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)]
    const gW = maxX-minX+NR*5, gH = maxY-minY+NR*5
    zoom.current = Math.min(Math.min(W/gW, H/gH)*.88, 1.15)
    panRef.current = { x: W/2-((minX+maxX)/2)*zoom.current, y: H/2-((minY+maxY)/2)*zoom.current }
  }, [data])

  // ── Physics ──────────────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    if (settled.current) return
    if (++ticks.current > 280) { settled.current = true; return }
    const nodes = nodesRef.current, links = linksRef.current
    for (let i=0; i<nodes.length; i++) for (let j=i+1; j<nodes.length; j++){
      const a=nodes[i], b=nodes[j], dx=b.x-a.x, dy=b.y-a.y
      const dist=Math.max(Math.sqrt(dx*dx+dy*dy),1), f=8500/(dist*dist)
      const fx=(dx/dist)*f, fy=(dy/dist)*f
      if(a.fx==null){a.vx-=fx;a.vy-=fy} if(b.fx==null){b.vx+=fx;b.vy+=fy}
    }
    const nm = new Map(nodes.map(n=>[n.id,n]))
    for (const l of links){
      const s=nm.get(l.source), t=nm.get(l.target); if(!s||!t) continue
      const dx=t.x-s.x, dy=t.y-s.y, dist=Math.max(Math.sqrt(dx*dx+dy*dy),1)
      const f=(dist-175)*0.033, fx=(dx/dist)*f, fy=(dy/dist)*f
      if(s.fx==null){s.vx+=fx;s.vy+=fy} if(t.fx==null){t.vx-=fx;t.vy-=fy}
    }
    const W=canvasRef.current?.offsetWidth??800, H=canvasRef.current?.offsetHeight??500
    for (const n of nodes){
      if(n.fx!=null){n.x=n.fx;n.vx=0} if(n.fy!=null){n.y=n.fy;n.vy=0}
      if(n.fx==null){n.vx=(n.vx+(W/2-n.x)*.002)*.82;n.x+=n.vx;n.x=Math.max(60,Math.min(W-60,n.x))}
      if(n.fy==null){n.vy=(n.vy+(H/2-n.y)*.002)*.82;n.y+=n.vy;n.y=Math.max(60,Math.min(H-60,n.y))}
    }
  }, [])

  // ── Draw ─────────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current; if(!canvas) return
    const ctx = canvas.getContext('2d'); if(!ctx) return
    const dpr=window.devicePixelRatio||1, W=canvas.offsetWidth, H=canvas.offsetHeight
    if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){
      canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr); ctx.scale(dpr,dpr)
    }
    ctx.clearRect(0,0,W,H); ctx.fillStyle=BG; ctx.fillRect(0,0,W,H)
    // dot grid
    const gs=34*zoom.current, ox=((panRef.current.x%gs)+gs)%gs, oy=((panRef.current.y%gs)+gs)%gs
    ctx.fillStyle=GRID_C
    for(let gx=ox;gx<W;gx+=gs) for(let gy=oy;gy<H;gy+=gs){ctx.beginPath();ctx.arc(gx,gy,.8,0,Math.PI*2);ctx.fill()}
    ctx.save(); ctx.translate(panRef.current.x,panRef.current.y); ctx.scale(zoom.current,zoom.current)
    const nodes=nodesRef.current, links=linksRef.current, nm=new Map(nodes.map(n=>[n.id,n]))
    pulseT.current=(pulseT.current+.013)%1
    // edges
    for(const link of links){
      const s=nm.get(link.source), t=nm.get(link.target); if(!s||!t) continue
      const hov=hoverNode.current?.id===s.id||hoverNode.current?.id===t.id
      const sr=RISK[s.riskLevel], tr=RISK[t.riskLevel]
      const mx=(s.x+t.x)/2, my=(s.y+t.y)/2-38*(hov?1.4:1)
      const grad=ctx.createLinearGradient(s.x,s.y,t.x,t.y)
      grad.addColorStop(0,rgba(sr.ring,hov?.9:.42)); grad.addColorStop(1,rgba(tr.ring,hov?.9:.42))
      ctx.save(); ctx.beginPath(); ctx.moveTo(s.x,s.y); ctx.quadraticCurveTo(mx,my,t.x,t.y)
      ctx.strokeStyle=grad; ctx.lineWidth=hov?2.2:1.4
      ctx.shadowBlur=hov?14:0; ctx.shadowColor=sr.ring
      if(!link.isDirect) ctx.setLineDash([7,5]); ctx.stroke(); ctx.setLineDash([]); ctx.restore()
      // arrow
      const at=.84
      const ax=(1-at)*(1-at)*s.x+2*(1-at)*at*mx+at*at*t.x
      const ay=(1-at)*(1-at)*s.y+2*(1-at)*at*my+at*at*t.y
      const dtx=2*(1-at)*(mx-s.x)+2*at*(t.x-mx), dty=2*(1-at)*(my-s.y)+2*at*(t.y-my)
      drawArrow(ctx,ax,ay,Math.atan2(dty,dtx),8,tr.ring)
      // pulse dot
      const pt=(pulseT.current+parseInt(link.id.slice(-4)||'0',16)*.08)%1
      const pxc=(1-pt)*(1-pt)*s.x+2*(1-pt)*pt*mx+pt*pt*t.x
      const pyc=(1-pt)*(1-pt)*s.y+2*(1-pt)*pt*my+pt*pt*t.y
      ctx.save(); ctx.beginPath(); ctx.arc(pxc,pyc,3.5,0,Math.PI*2)
      ctx.fillStyle=sr.ring; ctx.shadowBlur=10; ctx.shadowColor=sr.ring; ctx.fill(); ctx.restore()
      // edge label
      if(hov||link.amountUSD>2000){
        const lx=.25*s.x+.5*mx+.25*t.x, ly=.25*s.y+.5*my+.25*t.y-10
        const bw=112,bh=50,br=6,bx=lx-bw/2,by=ly-bh/2
        ctx.save(); ctx.shadowBlur=10; ctx.shadowColor='rgba(0,0,0,.55)'
        ctx.fillStyle='rgba(13,12,29,.94)'; ctx.strokeStyle=rgba(sr.ring,.3); ctx.lineWidth=1
        ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,br); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0
        ctx.textAlign='center'
        ctx.fillStyle='#e2e8f0'; ctx.font=`600 10.5px "Space Mono",monospace`; ctx.fillText(`${link.amount} ${link.token}`,lx,by+13)
        ctx.fillStyle=rgba(sr.ring,.9); ctx.font=`600 10px "Space Mono",monospace`; ctx.fillText(fmtUSD(link.amountUSD),lx,by+25)
        ctx.fillStyle='#64748b'; ctx.font=`400 9px "DM Sans",sans-serif`
        ctx.fillText(new Date(link.timestamp).toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'}),lx,by+38)
        ctx.restore()
      }
    }
    // nodes
    for(const node of nodes){
      const r=node.isTarget?TR:NR, rc=RISK[node.riskLevel], nt=NODE_T[node.nodeType]
      const hov=hoverNode.current?.id===node.id, sc=hov?1.07:1, rs=r*sc
      ctx.save(); ctx.translate(node.x,node.y)
      const halo=ctx.createRadialGradient(0,0,rs*.6,0,0,rs*2.3)
      halo.addColorStop(0,rgba(rc.ring,hov?.22:.07)); halo.addColorStop(1,'transparent')
      ctx.beginPath(); ctx.arc(0,0,rs*2.3,0,Math.PI*2); ctx.fillStyle=halo; ctx.fill()
      ctx.shadowBlur=hov?26:12; ctx.shadowColor=rc.ring
      ctx.beginPath(); ctx.arc(0,0,rs+RING,0,Math.PI*2)
      ctx.strokeStyle=rgba(rc.ring,hov?1:.72); ctx.lineWidth=RING+(hov?1:0); ctx.stroke(); ctx.shadowBlur=0
      ctx.beginPath(); ctx.arc(0,0,rs,0,Math.PI*2); ctx.fillStyle=nt.body; ctx.fill()
      const bg2=ctx.createRadialGradient(-rs*.3,-rs*.3,0,0,0,rs)
      bg2.addColorStop(0,rgba(rc.ring,.18)); bg2.addColorStop(1,'transparent')
      ctx.beginPath(); ctx.arc(0,0,rs,0,Math.PI*2); ctx.fillStyle=bg2; ctx.fill()
      drawIcon(ctx,node.nodeType,0,0,rs*.36,nt.icon)
      const cc=CHAIN_C[node.chain]||'#475569'
      ctx.beginPath(); ctx.arc(rs*.7,rs*.7,5.5,0,Math.PI*2)
      ctx.fillStyle=cc; ctx.shadowBlur=5; ctx.shadowColor=cc; ctx.fill(); ctx.shadowBlur=0
      ctx.restore()
      const lY=node.y+rs+RING+14
      ctx.textAlign='center'
      ctx.font=`${node.isTarget?600:500} ${node.isTarget?11.5:10.5}px "Space Mono",monospace`
      ctx.fillStyle=hov?'#e2e8f0':(node.isTarget?'#a78bfa':'#94a3b8')
      ctx.shadowBlur=hov?6:0; ctx.shadowColor=rc.ring
      ctx.fillText(node.label||node.shortAddress,node.x,lY)
      if(node.sublabel){
        ctx.font=`400 9px "DM Sans",sans-serif`; ctx.fillStyle='#475569'; ctx.shadowBlur=0
        ctx.fillText(node.sublabel,node.x,lY+13)
      }
    }
    ctx.restore()
  }, [])

  // ── Loop ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = () => { tick(); draw(); rafRef.current = requestAnimationFrame(loop) }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [tick, draw])

  // ── Coordinates ───────────────────────────────────────────────────────────────
  const toWorld = (cx:number,cy:number) => ({ x:(cx-panRef.current.x)/zoom.current, y:(cy-panRef.current.y)/zoom.current })
  const getPos  = (e:React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { cx: e.clientX-rect.left, cy: e.clientY-rect.top }
  }
  const getNode = (wx:number,wy:number) =>
    nodesRef.current.find(n=>{ const r=(n.isTarget?TR:NR)+RING+4,dx=n.x-wx,dy=n.y-wy; return dx*dx+dy*dy<=r*r }) ?? null

  // ── Mouse ─────────────────────────────────────────────────────────────────────
  const onMouseMove = (e:React.MouseEvent) => {
    const{cx,cy}=getPos(e), {x:wx,y:wy}=toWorld(cx,cy)
    const node=getNode(wx,wy); hoverNode.current=node
    if(dragNode.current){dragNode.current.fx=wx;dragNode.current.fy=wy;settled.current=false}
    else if(isPanning.current){panRef.current={x:panStart.current.px+(cx-panStart.current.mx),y:panStart.current.py+(cy-panStart.current.my)}}
    if(node) setTooltip({x:cx,y:cy,node}); else setTooltip(null)
  }
  const onMouseDown = (e:React.MouseEvent) => {
    const{cx,cy}=getPos(e), {x:wx,y:wy}=toWorld(cx,cy), node=getNode(wx,wy)
    if(node){dragNode.current=node;node.fx=wx;node.fy=wy}
    else{isPanning.current=true;panStart.current={mx:cx,my:cy,px:panRef.current.x,py:panRef.current.y}}
  }
  const onMouseUp = () => {
    if(dragNode.current&&!dragNode.current.isTarget){dragNode.current.fx=null;dragNode.current.fy=null}
    dragNode.current=null; isPanning.current=false
  }
  const onMouseLeave = () => {
    hoverNode.current=null; isPanning.current=false; dragNode.current=null; setTooltip(null)
  }
  const onClick = (e:React.MouseEvent) => {
    const{cx,cy}=getPos(e), {x:wx,y:wy}=toWorld(cx,cy), node=getNode(wx,wy)
    if(node&&onNodeClick) onNodeClick(node.id)
  }
  const onWheel = (e:React.WheelEvent) => {
    e.preventDefault()
    const{cx,cy}=getPos(e), delta=e.deltaY<0?1.11:.9
    const nz=Math.max(.25,Math.min(3.5,zoom.current*delta))
    panRef.current={x:cx-(cx-panRef.current.x)*(nz/zoom.current),y:cy-(cy-panRef.current.y)*(nz/zoom.current)}
    zoom.current=nz
  }

  // ── Fullscreen ────────────────────────────────────────────────────────────────
  const toggleFS = () => {
    setIsFS(v => !v)
    setTimeout(() => {
      const canvas=canvasRef.current; if(!canvas) return
      const W=canvas.offsetWidth, H=canvas.offsetHeight
      const xs=nodesRef.current.map(n=>n.x), ys=nodesRef.current.map(n=>n.y)
      const[minX,maxX,minY,maxY]=[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)]
      zoom.current=Math.min(Math.min(W/(maxX-minX+NR*5),H/(maxY-minY+NR*5))*.88,1.15)
      panRef.current={x:W/2-((minX+maxX)/2)*zoom.current,y:H/2-((minY+maxY)/2)*zoom.current}
    }, 80)
  }
  useEffect(() => {
    const onKey = (e:KeyboardEvent) => { if(e.key==='Escape'&&isFS) setIsFS(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFS])

  // ── Render ────────────────────────────────────────────────────────────────────
  const wrapStyle = isFS
    ? { position:'fixed' as const, inset:0, zIndex:9999, display:'flex', flexDirection:'column' as const, background:BG }
    : { width:'100%', height:'100%', display:'flex', flexDirection:'column' as const, background:BG }

  const rc = RISK; const nlen=nodesRef.current.length; const llen=linksRef.current.length

  return (
    <div ref={wrapRef} style={wrapStyle}>
      {/* Toolbar — fullscreen only */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderBottom:'1px solid #1a1830', flexShrink:0, background:'rgba(6,6,15,0.9)' }}>
        <span style={{ fontFamily:'Space Mono,monospace', fontSize:10, color:'#475569' }}>
          {nlen} wallets · {llen} transfers · scroll=zoom · drag=pan/move
        </span>
        <button className="graph-btn" onClick={toggleFS} title={isFS?'Exit fullscreen':'Expand fullscreen'}>
          {isFS ? (
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 2v3H2M9 5V2h3M9 14v-3h3M5 11v3H2"/>
            </svg>
          ) : (
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 5V2h3M9 2h3v3M14 9v3h-3M5 14H2v-3"/>
            </svg>
          )}
        </button>
      </div>

      {/* Canvas */}
      <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
        <canvas
          ref={canvasRef}
          style={{ width:'100%', height:'100%', cursor: dragNode.current?'grabbing':isPanning.current?'grabbing':'crosshair', display:'block' }}
          onMouseMove={onMouseMove} onMouseDown={onMouseDown} onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave} onClick={onClick} onWheel={onWheel}
        />

        {/* Tooltip */}
        {tooltip && (
          <div style={{ position:'absolute', pointerEvents:'none', zIndex:10, left:tooltip.x+18, top:Math.max(8,tooltip.y-90), maxWidth:240,
                        background:'rgba(13,12,29,0.97)', border:`1px solid ${RISK[tooltip.node.riskLevel].ring}40`,
                        borderRadius:10, padding:'10px 14px', boxShadow:'0 8px 32px rgba(0,0,0,0.65)' }}>
            <div style={{ fontFamily:'Space Mono,monospace', fontSize:11, color:'#e2e8f0', marginBottom:4 }}>{shortenAddress(tooltip.node.address,8)}</div>
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:10, marginBottom:3 }}>
              <span style={{ color:RISK[tooltip.node.riskLevel].ring, fontWeight:700, textTransform:'uppercase' }}>{tooltip.node.riskLevel} risk</span>
              <span style={{ color:'#1e1b3a' }}>·</span>
              <span style={{ color:'#64748b', textTransform:'capitalize' }}>{tooltip.node.chain}</span>
              <span style={{ color:'#1e1b3a' }}>·</span>
              <span style={{ color:'#64748b', textTransform:'capitalize' }}>{tooltip.node.nodeType}</span>
            </div>
            {tooltip.node.label && <div style={{ fontSize:10, color:CHAIN_C[tooltip.node.chain]||'#7f5af0', marginBottom:2 }}>{tooltip.node.label}</div>}
            <div style={{ fontFamily:'Space Mono,monospace', fontSize:10, color:'#475569' }}>{tooltip.node.txCount} transactions</div>
          </div>
        )}

        {/* Risk legend */}
        <div style={{ position:'absolute', bottom:10, left:10, display:'flex', flexDirection:'column', gap:5 }}>
          {(['high','medium','low'] as RiskLevel[]).map(l => (
            <div key={l} style={{ display:'flex', alignItems:'center', gap:6, fontFamily:'Space Mono,monospace', fontSize:10, color:'#475569' }}>
              <span style={{ width:9, height:9, borderRadius:'50%', background:RISK[l].ring, boxShadow:`0 0 5px ${RISK[l].ring}`, display:'inline-block' }}/>
              {l.charAt(0).toUpperCase()+l.slice(1)} Risk
            </div>
          ))}
          <div style={{ marginTop:6, paddingTop:6, borderTop:'1px solid #1a1830', display:'flex', flexDirection:'column', gap:4 }}>
            {[['solid','Direct'],['dashed','Indirect']].map(([style,label]) => (
              <div key={style} style={{ display:'flex', alignItems:'center', gap:6, fontFamily:'Space Mono,monospace', fontSize:10, color:'#475569' }}>
                <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#7f5af0" strokeWidth="1.5" strokeDasharray={style==='dashed'?'4 3':undefined}/></svg>
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Node type legend */}
        <div style={{ position:'absolute', bottom:10, right:10, display:'flex', flexDirection:'column', gap:4 }}>
          {(['exchange','bridge','mixer','wallet'] as NodeType[]).map(nt => (
            <div key={nt} style={{ display:'flex', alignItems:'center', gap:6, fontFamily:'Space Mono,monospace', fontSize:10, color:'#475569' }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:NODE_T[nt].icon, display:'inline-block' }}/>
              {nt.charAt(0).toUpperCase()+nt.slice(1)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
