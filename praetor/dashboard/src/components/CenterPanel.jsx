import { useState, useEffect, useRef } from 'react'
import { submitTask } from '../hooks/useApi'
import { MOCK_INCIDENTS, MOCK_ACTIVITY, INTEGRATIONS, ACL_MATRIX } from '../data/mockData'

function SevDot({ sev }) {
  const colors = { p1:'var(--accent-red)', p2:'var(--accent-orange)', p3:'var(--accent-yellow)', p4:'var(--text-secondary)' }
  const glow = { p1:`0 0 8px var(--accent-red)`, p2:`0 0 8px var(--accent-orange)`, p3:'none', p4:'none' }
  return <span style={{ width:8, height:8, borderRadius:'50%', display:'inline-block', background:colors[sev], boxShadow:glow[sev] }} />
}

function Badge({ color, children }) {
  const styles = {
    red:    { background:'rgba(255,48,85,0.2)',   color:'var(--accent-red)',    border:'1px solid rgba(255,48,85,0.3)' },
    orange: { background:'rgba(255,107,43,0.15)', color:'var(--accent-orange)', border:'1px solid rgba(255,107,43,0.3)' },
    cyan:   { background:'rgba(0,212,255,0.1)',   color:'var(--accent-cyan)',   border:'1px solid rgba(0,212,255,0.2)' },
    green:  { background:'rgba(0,255,136,0.1)',   color:'var(--accent-green)',  border:'1px solid rgba(0,255,136,0.2)' },
    dim:    { background:'rgba(122,156,200,0.1)', color:'var(--text-secondary)',border:'1px solid var(--border)' },
  }
  return <span style={{ fontFamily:'Share Tech Mono, monospace', fontSize:10, padding:'2px 8px', borderRadius:10, ...styles[color] }}>{children}</span>
}

function CardHeader({ icon, title, badges }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px',
      borderBottom:'1px solid var(--border)', background:'rgba(0,0,0,0.2)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, fontFamily:'Rajdhani, sans-serif', fontWeight:700,
        fontSize:13, color:'var(--text-primary)', letterSpacing:1, textTransform:'uppercase' }}>
        <span>{icon}</span>{title}
      </div>
      <div style={{ display:'flex', gap:8 }}>{badges}</div>
    </div>
  )
}

function IncidentTable({ incidents }) {
  return (
    <table style={{ width:'100%', borderCollapse:'collapse' }}>
      <thead>
        <tr>{['SEV','TICKET','TITLE','SOURCE','AGENT','STATUS','ACTION'].map(h => (
          <th key={h} style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-dim)', letterSpacing:2,
            textAlign:'left', padding:'0 8px 8px', borderBottom:'1px solid var(--border)' }}>{h}</th>
        ))}</tr>
      </thead>
      <tbody>
        {incidents.map(inc => (
          <tr key={inc.id} style={{ borderBottom:'1px solid rgba(26,45,85,0.5)' }}>
            <td style={{ padding:8 }}><SevDot sev={inc.sev} /></td>
            <td style={{ padding:8, fontFamily:'Share Tech Mono, monospace', fontSize:11, color:'var(--accent-cyan)' }}>{inc.id}</td>
            <td style={{ padding:8, fontSize:12, color:'var(--text-primary)', maxWidth:280 }}>{inc.title}</td>
            <td style={{ padding:8, fontSize:10, color:'var(--text-secondary)' }}>{inc.source}</td>
            <td style={{ padding:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'var(--text-secondary)' }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:'var(--accent-green)' }} />{inc.agent}
              </div>
            </td>
            <td style={{ padding:8 }}><Badge color={inc.statusColor}>{inc.status}</Badge></td>
            <td style={{ padding:8 }}>
              <button style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, padding:'2px 8px', borderRadius:3,
                background:'rgba(0,212,255,0.1)', border:'1px solid rgba(0,212,255,0.3)', color:'var(--accent-cyan)', cursor:'pointer' }}>
                VIEW
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function BudgetBars({ budgetReport }) {
  const agents = budgetReport
    ? Object.entries(budgetReport.agents).map(([k,v]) => ({ name:k.toUpperCase(), consumed:v.consumed, max:v.max }))
    : [
        { name:'SENTINEL-1', consumed:4, max:8 },{ name:'NOVA-7', consumed:6, max:8 },
        { name:'WEAVER-4', consumed:5, max:6 },{ name:'HERALD-3', consumed:3, max:6 },
        { name:'ECHO-2', consumed:2, max:4 },{ name:'FORGE-5 / ATLAS-6', consumed:3, max:8 },
      ]

  return (
    <div>
      {agents.slice(0,6).map(a => {
        const pct = a.max > 0 ? Math.round((a.consumed/a.max)*100) : 0
        const fillColor = pct>80?'linear-gradient(90deg,#b71c1c,#ff3055)':pct>60?'linear-gradient(90deg,#e65100,#ff6b2b)':pct>40?'linear-gradient(90deg,#f9a825,#ffd700)':'linear-gradient(90deg,#00c853,#00ff88)'
        return (
          <div key={a.name} style={{ marginBottom:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontFamily:'Share Tech Mono, monospace', fontSize:10, color:'var(--text-secondary)', letterSpacing:1 }}>{a.name}</span>
              <span style={{ fontFamily:'Share Tech Mono, monospace', fontSize:10, color:'var(--text-primary)' }}>{a.consumed} / {a.max} PTU</span>
            </div>
            <div style={{ height:6, background:'var(--bg-card)', borderRadius:3, overflow:'hidden', border:'1px solid var(--border)' }}>
              <div style={{ height:'100%', width:`${Math.min(pct,100)}%`, borderRadius:3, background:fillColor, transition:'width 0.5s ease' }} />
            </div>
          </div>
        )
      })}
      <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)', fontFamily:'Share Tech Mono, monospace', fontSize:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
          <span style={{ color:'var(--text-dim)' }}>STANDBY RESERVE</span>
          <span style={{ color:'var(--accent-cyan)' }}>5 PTU</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <span style={{ color:'var(--text-dim)' }}>TOTAL CONSUMED</span>
          <span style={{ color:'var(--accent-orange)' }}>
            {budgetReport ? `${budgetReport.pool_consumed} / ${budgetReport.total_ptu}` : '28 / 40'} PTU
          </span>
        </div>
      </div>
    </div>
  )
}

function ActivityFeed({ items }) {
  const feedRef = useRef(null)
  const [feed, setFeed] = useState(items)

  useEffect(() => {
    const newItems = [
      ['NOVA-7','var(--accent-cyan)','Splunk search complete: <b>memory heap exhaustion</b> confirmed — microservice restart scheduled'],
      ['SENTINEL-1','var(--accent-red)','Threat scan: <b>0 critical vulnerabilities</b> in scope — security clearance granted'],
      ['ECHO-2','var(--accent-green)','Teams #it-alerts: <b>2 new messages</b> ingested — auto-tagged monitoring noise'],
      ['HERALD-3','var(--accent-orange)','ServiceNow INC0084521 <b>SLA timer: 42 min remaining</b> — escalation path prepped'],
      ['WEAVER-4','var(--accent-purple)','Cross-signal correlation complete: <b>3 contributing factors</b> identified for checkout latency'],
    ]
    let i = 0
    const t = setInterval(() => {
      const item = newItems[i % newItems.length]
      const now = new Date()
      const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`
      setFeed(f => [{ time:ts, agent:item[0], color:item[1], msg:item[2] }, ...f.slice(0,11)])
      i++
    }, 5000)
    return () => clearInterval(t)
  }, [])

  return (
    <div ref={feedRef} style={{ maxHeight:220, overflowY:'auto' }}>
      {feed.map((item,idx) => (
        <div key={idx} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid rgba(26,45,85,0.4)', fontSize:11 }}>
          <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-dim)', flexShrink:0, width:50, paddingTop:1 }}>{item.time}</div>
          <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:10, flexShrink:0, width:80, color:item.color }}>{item.agent}</div>
          <div style={{ color:'var(--text-secondary)', flex:1, lineHeight:1.4 }} dangerouslySetInnerHTML={{ __html:item.msg }} />
        </div>
      ))}
    </div>
  )
}

function IntegrationsGrid({ integrations }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
      {integrations.map(int => (
        <div key={int.name} style={{ background:'var(--bg-card)', border:`1px solid ${int.on?'rgba(0,255,136,0.3)':'var(--border)'}`,
          borderRadius:8, padding:'10px 12px', display:'flex', alignItems:'center', gap:8, cursor:'pointer', transition:'all 0.2s' }}>
          <span style={{ fontSize:20 }}>{int.icon}</span>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)' }}>{int.name}</div>
            <div style={{ fontSize:9, fontFamily:'Share Tech Mono, monospace', color: int.on?'var(--accent-green)':'var(--text-dim)' }}>
              {int.on ? '● LIVE' : '○ PENDING'}
            </div>
          </div>
          <div style={{ marginLeft:'auto', fontSize:10, fontFamily:'Share Tech Mono, monospace', color:'var(--text-dim)' }}>{int.badge}</div>
        </div>
      ))}
    </div>
  )
}

function AccessMatrix({ matrix }) {
  const perm = v => {
    if (v==='R/W') return <span style={{ color:'var(--accent-green)' }}>R/W</span>
    if (v==='R') return <span style={{ color:'var(--accent-yellow)' }}>R</span>
    if (v==='W') return <span style={{ color:'var(--accent-yellow)' }}>W</span>
    if (v==='GATED') return <span style={{ color:'var(--accent-yellow)' }}>GATED</span>
    return <span style={{ color:'var(--accent-red)' }}>—</span>
  }
  return (
    <div>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead>
          <tr>
            <th style={{ minWidth:100, textAlign:'left', fontFamily:'Share Tech Mono, monospace', fontSize:8, color:'var(--text-dim)', letterSpacing:1, padding:'4px 6px', borderBottom:'1px solid var(--border)' }}>AGENT</th>
            {matrix.headers.map(h => <th key={h} style={{ fontFamily:'Share Tech Mono, monospace', fontSize:8, color:'var(--text-dim)', letterSpacing:1, padding:'4px 6px', textAlign:'center', borderBottom:'1px solid var(--border)' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map(row => (
            <tr key={row.agent} style={{ borderBottom:'1px solid rgba(26,45,85,0.3)' }}>
              <td style={{ padding:'5px 6px', fontSize:10, color:'var(--text-secondary)', fontFamily:'Share Tech Mono, monospace' }}>{row.agent}</td>
              {row.perms.map((p,i) => <td key={i} style={{ padding:'5px 6px', fontSize:11, textAlign:'center' }}>{perm(p)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop:10, display:'flex', gap:16, fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-dim)' }}>
        <span><span style={{ color:'var(--accent-green)' }}>R/W</span> = Read + Write</span>
        <span><span style={{ color:'var(--accent-yellow)' }}>R</span> = Read-only</span>
        <span><span style={{ color:'var(--accent-yellow)' }}>GATED</span> = Human approval required</span>
        <span><span style={{ color:'var(--accent-red)' }}>—</span> = No access</span>
      </div>
    </div>
  )
}

function TaskDispatcher({ onSubmit }) {
  const [form, setForm] = useState({ task_type:'rca', source:'splunk', priority:'p2', incident_id:'', message:'' })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const r = await onSubmit({ ...form, payload:{ message:form.message } })
      setResult(r)
    } catch (err) { setResult({ error: 'Backend unavailable' }) }
    setLoading(false)
  }

  const sel = (field, opts) => (
    <select value={form[field]} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))}
      style={{ fontFamily:'Share Tech Mono, monospace', fontSize:10, background:'var(--bg-card)', border:'1px solid var(--border)',
        color:'var(--text-primary)', padding:'4px 8px', borderRadius:4 }}>
      {opts.map(o => <option key={o}>{o}</option>)}
    </select>
  )

  return (
    <form onSubmit={handle} style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
        <div>
          <div style={{ fontSize:9, color:'var(--text-dim)', fontFamily:'Share Tech Mono, monospace', marginBottom:4, letterSpacing:1 }}>TASK TYPE</div>
          {sel('task_type',['rca','alert','incident','correlation','security','devops','email','discovery'])}
        </div>
        <div>
          <div style={{ fontSize:9, color:'var(--text-dim)', fontFamily:'Share Tech Mono, monospace', marginBottom:4, letterSpacing:1 }}>SOURCE</div>
          {sel('source',['splunk','dynatrace','webex','teams','servicenow','email','github'])}
        </div>
        <div>
          <div style={{ fontSize:9, color:'var(--text-dim)', fontFamily:'Share Tech Mono, monospace', marginBottom:4, letterSpacing:1 }}>PRIORITY</div>
          {sel('priority',['p1','p2','p3','p4'])}
        </div>
      </div>
      <input value={form.incident_id} onChange={e=>setForm(f=>({...f,incident_id:e.target.value}))}
        placeholder="Incident ID (e.g. INC0084521)"
        style={{ fontFamily:'Share Tech Mono, monospace', fontSize:10, background:'var(--bg-card)', border:'1px solid var(--border)',
          color:'var(--text-primary)', padding:'6px 10px', borderRadius:4 }} />
      <textarea value={form.message} onChange={e=>setForm(f=>({...f,message:e.target.value}))}
        placeholder="Task details or alert description..."
        rows={2}
        style={{ fontFamily:'Rajdhani, sans-serif', fontSize:12, background:'var(--bg-card)', border:'1px solid var(--border)',
          color:'var(--text-primary)', padding:'6px 10px', borderRadius:4, resize:'vertical' }} />
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <button type="submit" disabled={loading}
          style={{ fontFamily:'Share Tech Mono, monospace', fontSize:10, padding:'6px 16px', borderRadius:4,
            background: loading?'rgba(0,212,255,0.05)':'rgba(0,212,255,0.15)',
            border:'1px solid rgba(0,212,255,0.4)', color:'var(--accent-cyan)', cursor:'pointer', letterSpacing:1 }}>
          {loading ? 'DISPATCHING...' : '⚡ DISPATCH TASK'}
        </button>
        {result && !result.error && (
          <span style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--accent-green)' }}>
            ✓ Task {result.task_id?.slice(0,8)}… → {result.assigned_agent}
          </span>
        )}
        {result?.error && <span style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--accent-red)' }}>✗ {result.error}</span>}
      </div>
    </form>
  )
}

const card = { background:'var(--bg-panel)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', marginBottom:0 }

export default function CenterPanel({ budgetReport }) {
  return (
    <main style={{ overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:16 }}>

      {/* Live Incidents */}
      <div style={card}>
        <CardHeader icon="🔴" title="Live Incidents — ServiceNow + Email"
          badges={[<Badge key="p12" color="red">7 P1/P2</Badge>, <Badge key="p3" color="orange">12 P3</Badge>, <Badge key="at" color="green">AUTO-TRIAGE ON</Badge>]} />
        <div style={{ padding:'0 16px 14px' }}>
          <IncidentTable incidents={MOCK_INCIDENTS} />
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* MCP Integrations */}
        <div style={card}>
          <CardHeader icon="🔌" title="MCP Integrations" badges={[<Badge key="c" color="green">8 CONNECTED</Badge>]} />
          <div style={{ padding:14 }}><IntegrationsGrid integrations={INTEGRATIONS} /></div>
        </div>

        {/* PTU Budget */}
        <div style={card}>
          <CardHeader icon="💰" title="PTU Budget Allocator" badges={[<Badge key="p" color="cyan">40 PTU TOTAL</Badge>]} />
          <div style={{ padding:14 }}><BudgetBars budgetReport={budgetReport} /></div>
        </div>
      </div>

      {/* Dispatch Task */}
      <div style={card}>
        <CardHeader icon="⚡" title="Dispatch Task" badges={[<Badge key="d" color="cyan">DIRECT INJECT</Badge>]} />
        <div style={{ padding:14 }}><TaskDispatcher onSubmit={submitTask} /></div>
      </div>

      {/* Activity Feed */}
      <div style={card}>
        <CardHeader icon="📜" title="Agent Activity Stream" badges={[<Badge key="l" color="green">LIVE</Badge>]} />
        <div style={{ padding:'0 16px 14px', paddingTop:0 }}><ActivityFeed items={MOCK_ACTIVITY} /></div>
      </div>

      {/* ACL Matrix */}
      <div style={card}>
        <CardHeader icon="🔐" title="Agent Tool Access Control Matrix" badges={[<Badge key="s" color="red">ENTERPRISE SECURITY</Badge>]} />
        <div style={{ padding:'10px 16px 14px' }}><AccessMatrix matrix={ACL_MATRIX} /></div>
      </div>

    </main>
  )
}
