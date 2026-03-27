import { useState, useEffect, useRef } from 'react'
import { MOCK_ACTIVITY } from '../data/mockData'

const ALERTS = [
  { type:'warn',  msg:'SENTINEL-1: Threat signature SIG-4497 detected — investigating' },
  { type:'info',  msg:'NOVA-7: RCA complete for INC0084521 — root cause identified' },
  { type:'ok',    msg:'FORGE-5: Pipeline #2848 deployed successfully to prod' },
  { type:'warn',  msg:'Budget alert: WEAVER-4 at 83% PTU — approaching limit' },
  { type:'info',  msg:'HERALD-3: VIP auto-response approved and dispatched to acme-corp' },
  { type:'ok',    msg:'ATLAS-6: Topology sync complete — 214 endpoints mapped' },
  { type:'warn',  msg:'ECHO-2: P1 alert received — routing to incident queue' },
  { type:'info',  msg:'NEXUS-12: Coordinating 4-agent workflow for INC0084518' },
]

const COLOR = { warn:'var(--accent-orange)', info:'var(--accent-cyan)', ok:'var(--accent-green)' }
const ICON  = { warn:'⚠', info:'ℹ', ok:'✓' }

export default function NotifyBar() {
  const [items, setItems] = useState(MOCK_ACTIVITY.slice(0,3).map((a,i) => ({
    id:i, type:'info', msg:`${a.agent}: ${a.msg.replace(/<[^>]+>/g,'')}`, ts:a.time
  })))
  const [idx, setIdx] = useState(0)
  const idRef = useRef(100)

  useEffect(() => {
    const t = setInterval(() => {
      const alert = ALERTS[idx % ALERTS.length]
      const now = new Date()
      const ts = now.toTimeString().slice(0,8)
      setItems(prev => {
        const next = [...prev, { id: idRef.current++, ...alert, ts }]
        return next.slice(-6)           // keep last 6
      })
      setIdx(i => i + 1)
    }, 7000)
    return () => clearInterval(t)
  }, [idx])

  return (
    <div style={{ background:'var(--bg-deep)', borderTop:'1px solid var(--border)',
      padding:'6px 16px', display:'flex', alignItems:'center', gap:16, overflowX:'auto',
      flexShrink:0, minHeight:34 }}>
      <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-dim)',
        letterSpacing:2, whiteSpace:'nowrap', flexShrink:0 }}>
        ▶ LIVE ALERTS
      </div>
      <div style={{ display:'flex', gap:24, alignItems:'center', overflow:'hidden' }}>
        {items.map(item => (
          <div key={item.id} style={{ display:'flex', gap:5, alignItems:'center', whiteSpace:'nowrap',
            animation:'fadeIn 0.4s ease' }}>
            <span style={{ color:COLOR[item.type], fontSize:10 }}>{ICON[item.type]}</span>
            <span style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9,
              color:'var(--text-dim)', marginRight:2 }}>{item.ts}</span>
            <span style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9,
              color:COLOR[item.type] }}
              dangerouslySetInnerHTML={{ __html: item.msg }} />
          </div>
        ))}
      </div>
    </div>
  )
}
