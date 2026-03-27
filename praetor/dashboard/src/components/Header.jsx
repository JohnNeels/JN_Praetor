import { useState, useEffect } from 'react'

const s = {
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 24px',
    background:'linear-gradient(90deg, var(--bg-deep) 0%, #06091a 50%, var(--bg-deep) 100%)',
    borderBottom:'1px solid var(--border)', position:'sticky', top:0, zIndex:100 },
  logo: { display:'flex', alignItems:'center', gap:12 },
  logoIcon: { width:40, height:40, background:'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
    clipPath:'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontFamily:'Orbitron, sans-serif', fontSize:14, fontWeight:900, color:'var(--bg-void)',
    animation:'pulse-logo 3s ease-in-out infinite' },
  logoText: { fontFamily:'Orbitron, sans-serif', fontSize:20, fontWeight:900, letterSpacing:3,
    background:'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple))',
    WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' },
  logoSub: { fontSize:10, color:'var(--text-dim)', letterSpacing:4, textTransform:'uppercase', fontFamily:'Share Tech Mono, monospace' },
  metrics: { display:'flex', gap:24 },
  metric: { textAlign:'center' },
  metricVal: { fontFamily:'Orbitron, sans-serif', fontSize:16, fontWeight:700, color:'var(--accent-cyan)' },
  metricLabel: { fontSize:9, color:'var(--text-dim)', letterSpacing:2, textTransform:'uppercase', fontFamily:'Share Tech Mono, monospace' },
  pill: { display:'flex', alignItems:'center', gap:6, background:'rgba(0,255,136,0.1)', border:'1px solid rgba(0,255,136,0.3)',
    padding:'4px 12px', borderRadius:20, fontSize:11, fontFamily:'Share Tech Mono, monospace', color:'var(--accent-green)' },
  dot: { width:6, height:6, borderRadius:'50%', background:'var(--accent-green)', animation:'blink 1.5s ease-in-out infinite' },
  time: { fontFamily:'Share Tech Mono, monospace', fontSize:12, color:'var(--accent-cyan)', textAlign:'right' },
  date: { color:'var(--text-dim)', fontSize:10 },
}

export default function Header({ health, agentCount, openIncidents, ptuUsed, resolvedToday }) {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toUTCString().split(' ')[4] + ' UTC')
      setDate(now.toDateString().toUpperCase())
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  const allOk = health.orchestrator && health.budget && health.mcp

  return (
    <header style={s.header}>
      <div style={s.logo}>
        <div style={s.logoIcon}>PR</div>
        <div>
          <div style={s.logoText}>PRAETOR</div>
          <div style={s.logoSub}>Enterprise · ITOps Command</div>
        </div>
      </div>

      <div style={s.metrics}>
        {[
          { val: agentCount, label:'Agents Live', color:'var(--accent-cyan)' },
          { val: openIncidents, label:'Open P1/P2', color:'var(--accent-red)' },
          { val: `${ptuUsed}/40`, label:'PTU Used', color:'var(--accent-orange)' },
          { val: resolvedToday, label:'Resolved 24h', color:'var(--accent-green)' },
        ].map(m => (
          <div key={m.label} style={s.metric}>
            <div style={{ ...s.metricVal, color: m.color }}>{m.val}</div>
            <div style={s.metricLabel}>{m.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:12, alignItems:'center' }}>
        <div style={{ ...s.pill, ...(allOk ? {} : { background:'rgba(255,48,85,0.1)', borderColor:'rgba(255,48,85,0.3)', color:'var(--accent-red)' }) }}>
          <div style={{ ...s.dot, background: allOk ? 'var(--accent-green)' : 'var(--accent-red)' }} />
          {allOk ? 'ALL SYSTEMS NOMINAL' : 'BACKEND OFFLINE'}
        </div>
        <div style={s.time}>
          <div>{time}</div>
          <div style={s.date}>{date}</div>
        </div>
      </div>
    </header>
  )
}
