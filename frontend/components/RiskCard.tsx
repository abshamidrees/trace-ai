'use client'

import type { AnalysisResult, RiskLevel, RiskSignal } from '../lib/types'

const RC: Record<RiskLevel,{ring:string;glow:string;bg:string;text:string}> = {
  high:   { ring:'#ff4d6a', glow:'rgba(255,77,106,0.35)',  bg:'rgba(255,77,106,0.07)',  text:'#ff4d6a' },
  medium: { ring:'#ffad3b', glow:'rgba(255,173,59,0.35)',  bg:'rgba(255,173,59,0.07)',  text:'#ffad3b' },
  low:    { ring:'#36d399', glow:'rgba(54,211,153,0.35)',  bg:'rgba(54,211,153,0.07)',  text:'#36d399' },
}
const LABELS: Record<RiskLevel,string> = { high:'HIGH RISK', medium:'MEDIUM RISK', low:'LOW RISK' }

function ScoreRing({ score, level }: { score:number; level:RiskLevel }) {
  const sz = 148, sw = 7, r = (sz - sw*2)/2
  const circ = 2*Math.PI*r
  const fill  = circ - (score/100)*circ
  const c = RC[level]
  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width:sz, height:sz }}>
      <svg width={sz} height={sz} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="#1e1b3a" strokeWidth={sw}/>
        <circle cx={sz/2} cy={sz/2} r={r} fill="none"
          stroke={c.ring} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={String(circ)} strokeDashoffset={fill}
          style={{ filter:`drop-shadow(0 0 8px ${c.glow})`, transition:'stroke-dashoffset 1.1s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-black text-[36px] leading-none" style={{ color:c.ring }}>{score}</span>
        <span className="font-mono text-[9px] mt-0.5" style={{ color:'#475569' }}>/100</span>
      </div>
    </div>
  )
}

function Signal({ s }: { s:RiskSignal }) {
  const c = RC[s.severity]
  return (
    <div className="rounded-lg p-3" style={{ background:c.bg, border:`1px solid ${c.ring}35` }}>
      <div className="font-mono font-bold text-[10.5px] mb-1" style={{ color:c.ring, textTransform:'uppercase', letterSpacing:'0.05em' }}>
        {s.label}
      </div>
      <div className="text-[12px] leading-relaxed" style={{ color:'#94a3b8' }}>{s.description}</div>
    </div>
  )
}

export default function RiskCard({ result }: { result:AnalysisResult }) {
  const c = RC[result.riskLevel]
  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-white text-base">AI Risk Assessment</h2>
        <span className="font-mono font-bold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-widest"
              style={{ background:c.bg, border:`1px solid ${c.ring}35`, color:c.ring }}>
          {LABELS[result.riskLevel]}
        </span>
      </div>

      {/* Score + bars */}
      <div className="flex items-center gap-5">
        <ScoreRing score={result.riskScore} level={result.riskLevel} />
        <div className="flex-1 space-y-4 min-w-0">
          {/* Sybil prob bar */}
          <div>
            <div className="flex justify-between text-[11px] mb-1.5">
              <span style={{ color:'#64748b', fontFamily:'DM Sans,sans-serif' }}>Sybil Probability</span>
              <span className="font-mono font-bold" style={{ color:c.ring }}>
                {Math.round(result.sybilProbability*100)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background:'#1e1b3a' }}>
              <div className="h-full rounded-full transition-all duration-1000"
                   style={{ width:`${result.sybilProbability*100}%`, background:c.ring, boxShadow:`0 0 8px ${c.glow}` }}/>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-lg p-3" style={{ background:'rgba(127,90,240,0.06)', border:'1px solid rgba(127,90,240,0.15)' }}>
              <div className="font-display font-bold text-lg" style={{ color:'#7f5af0' }}>{result.connectedWallets.length}</div>
              <div className="text-[10px] font-mono" style={{ color:'#475569' }}>connected</div>
            </div>
            <div className="rounded-lg p-3" style={{ background:'rgba(45,212,191,0.06)', border:'1px solid rgba(45,212,191,0.15)' }}>
              <div className="font-display font-bold text-lg" style={{ color:'#2dd4bf' }}>{result.recentTransactions.length}</div>
              <div className="text-[10px] font-mono" style={{ color:'#475569' }}>traced txns</div>
            </div>
          </div>
        </div>
      </div>

      {/* AI explanation */}
      <div className="rounded-xl p-4" style={{ background:c.bg, border:`1px solid ${c.ring}25` }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 rounded flex items-center justify-center text-white font-black text-[8px]"
               style={{ background:'linear-gradient(135deg,#7f5af0,#5f3dc4)' }}>AI</div>
          <span className="font-mono text-[10px]" style={{ color:'#475569' }}>OpenGradient Analysis</span>
        </div>
        <p className="text-[12.5px] leading-relaxed" style={{ color:'#94a3b8' }}>{result.explanation}</p>
      </div>

      {/* Signals */}
      {result.signals.length > 0 && (
        <div className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color:'#2a2550' }}>
            Detection Signals
          </div>
          {result.signals.map((s,i) => <Signal key={i} s={s}/>)}
        </div>
      )}
    </div>
  )
}
