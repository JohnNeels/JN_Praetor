import { useState, useEffect } from 'react'
import { MOCK_AGENTS } from '../data/mockData'

/* ── SVG Ring Gauge ────────────────────────────────────────────── */
function RingGauge({ pct, color, label, value, size = 80 }) {
  const r = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const fill = circ * Math.min(pct / 100, 1)
  const cx = size / 2, cy = size / 2
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={5} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ filter:`drop-shadow(0 0 4px ${color})`, transition:'stroke-dasharray 0.5s ease' }} />
        <text x={cx} y={cy - 4} textAnchor="middle" fill={color}
          style={{ fontFamily:'Orbitron, sans-serif', fontSize:14, fontWeight:700 }}>{pct}%</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--text-dim)"
          style={{ fontFamily:'Share Tech Mono, monospace', fontSize:8 }}>{value}</text>
      </svg>
      <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-dim)',
        letterSpacing:1, textTransform:'uppercase' }}>{label}</div>
    </div>
  )
}

/* ── Topology Node ─────────────────────────────────────────────── */
function TopoNode({ x, y, label, color, active }) {
  return (
    <g>
      <circle cx={x} cy={y} r={8} fill={`${color}22`} stroke={color} strokeWidth={active ? 1.5 : 0.5}
        style={{ filter: active ? `drop-shadow(0 0 6px ${color})` : 'none' }} />
      <circle cx={x} cy={y} r={3} fill={color} opacity={active ? 1 : 0.4} />
      <text x={x} y={y + 18} textAnchor="middle" fill="var(--text-dim)"
        style={{ fontFamily:'Share Tech Mono, monospace', fontSize:7 }}>{label}</text>
    </g>
  )
}

function TopologyMap({ agents }) {
  const nodes = [
    { id:'ORCH',       x:120, y:40,  color:'var(--accent-cyan)',   active:true,  label:'ORCHESTRATOR' },
    { id:'SENTINEL-1', x:30,  y:90,  color:'var(--accent-red)',    active:true,  label:'SENTINEL' },
    { id:'NOVA-7',     x:85,  y:100, color:'var(--accent-cyan)',   active:true,  label:'NOVA' },
    { id:'ECHO-2',     x:150, y:90,  color:'var(--accent-green)',  active:true,  label:'ECHO' },
    { id:'WEAVER-4',   x:210, y:100, color:'var(--accent-purple)', active:true,  label:'WEAVER' },
    { id:'HERALD-3',   x:55,  y:145, color:'var(--accent-orange)', active:true,  label:'HERALD' },
    { id:'FORGE-5',    x:120, y:150, color:'var(--accent-purple)', active:false, label:'FORGE' },
    { id:'ATLAS-6',    x:185, y:145, color:'var(--accent-green)',  active:true,  label:'ATLAS' },
    { id:'NEXUS-12',   x:120, y:95,  color:'var(--accent-purple)', active:true,  label:'NEXUS' },
  ]
  const edges = [
    ['ORCH','SENTINEL-1'],['ORCH','NOVA-7'],['ORCH','ECHO-2'],['ORCH','WEAVER-4'],
    ['ORCH','NEXUS-12'],['NEXUS-12','HERALD-3'],['NEXUS-12','FORGE-5'],['NEXUS-12','ATLAS-6'],
  ]
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))
  return (
    <svg width="100%" viewBox="0 0 240 170" style={{ overflow:'visible' }}>
      {edges.map(([a,b],i) => {
        const na = nodeMap[a], nb = nodeMap[b]
        if (!na || !nb) return null
        return <line key={i} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
          stroke="var(--border)" strokeWidth={0.8} strokeDasharray="3,3" opacity={0.6} />
      })}
      {nodes.map(n => <TopoNode key={n.id} {...n} />)}
    </svg>
  )
}

/* ── Security Controls ─────────────────────────────────────────── */
const CONTROLS = [
  { label:'Human Approval Gate',  key:'approval',  default:true },
  { label:'Tool ACL Enforcement', key:'acl',        default:true },
  { label:'Budget Hard Limit',    key:'budget',     default:true },
  { label:'Audit Trail (OTLP)',   key:'audit',      default:true },
  { label:'Auto-Rollback',        key:'rollback',   default:false },
  { label:'Quarantine Mode',      key:'quarantine', default:false },
]

function SecurityControls() {
  const [toggles, setToggles] = useState(() =>
    Object.fromEntries(CONTROLS.map(c => [c.key, c.default]))
  )
  const toggle = (key) => setToggles(t => ({ ...t, [key]: !t[key] }))
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {CONTROLS.map(c => (
        <div key={c.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-secondary)' }}>
            {c.label}
          </span>
          <div onClick={() => toggle(c.key)}
            style={{ width:32, height:16, borderRadius:8, cursor:'pointer', transition:'all 0.2s',
              background: toggles[c.key] ? 'rgba(0,255,136,0.3)' : 'rgba(122,156,200,0.1)',
              border: `1px solid ${toggles[c.key] ? 'var(--accent-green)' : 'var(--border)'}`,
              position:'relative' }}>
            <div style={{ position:'absolute', top:2, left: toggles[c.key] ? 17 : 2, width:10, height:10,
              borderRadius:'50%', transition:'all 0.2s',
              background: toggles[c.key] ? 'var(--accent-green)' : 'var(--text-dim)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Permission Levels ─────────────────────────────────────────── */
const PERMISSION_LEVELS = [
  { label:'Read-Only', color:'var(--accent-green)', width:25 },
  { label:'Read/Write', color:'var(--accent-cyan)', width:50 },
  { label:'Execute', color:'var(--accent-orange)', width:75 },
  { label:'Deploy (GATED)', color:'var(--accent-red)', width:100 },
]

/* ── Main Component ────────────────────────────────────────────── */
export default function RightSidebar({ agents, budgetReport }) {
  const data = agents.length ? agents : MOCK_AGENTS
  const totalBudget = data.reduce((s,a) => s + a.ptu_budget, 0)
  const totalConsumed = data.reduce((s,a) => s + a.ptu_consumed, 0)
  const ptuPct = Math.round((totalConsumed / totalBudget) * 100)

  // Per-service PTU from budget report or computed from mock
  const serviceStats = budgetReport?.agents
    ? Object.entries(budgetReport.agents).slice(0,4).map(([k,v]) => ({
        name: k.toUpperCase(), pct: Math.round((v.consumed / v.budget) * 100),
        color: 'var(--accent-cyan)', value: `${v.consumed}/${v.budget}`
      }))
    : [
        { name:'NOVA-7',   pct:75, color:'var(--accent-cyan)',   value:'6/8' },
        { name:'SENTINEL', pct:50, color:'var(--accent-red)',    value:'4/8' },
        { name:'WEAVER-4', pct:83, color:'var(--accent-purple)', value:'5/6' },
        { name:'HERALD-3', pct:50, color:'var(--accent-orange)', value:'3/6' },
      ]

  return (
    <aside style={{ background:'var(--bg-deep)', borderLeft:'1px solid var(--border)',
      padding:16, overflowY:'auto', display:'flex', flexDirection:'column', gap:16 }}>

      {/* ── PTU Master Gauge ── */}
      <div>
        <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:10, color:'var(--text-dim)',
          letterSpacing:3, textTransform:'uppercase', marginBottom:10,
          paddingBottom:8, borderBottom:'1px solid var(--border)' }}>
          ⬡ PTU BUDGET · MASTER
        </div>
        <div style={{ display:'flex', justifyContent:'center', marginBottom:8 }}>
          <RingGauge pct={ptuPct} color={ptuPct>80?'var(--accent-red)':ptuPct>60?'var(--accent-orange)':'var(--accent-cyan)'}
            label="Total PTU" value={`${totalConsumed}/${totalBudget}`} size={90} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-around', flexWrap:'wrap', gap:8 }}>
          {serviceStats.map(s => (
            <RingGauge key={s.name} pct={s.pct} color={s.pct>80?'var(--accent-red)':s.color}
              label={s.name} value={s.value} size={60} />
          ))}
        </div>
      </div>

      {/* ── Topology Map ── */}
      <div>
        <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:10, color:'var(--text-dim)',
          letterSpacing:3, textTransform:'uppercase', marginBottom:8,
          paddingBottom:8, borderBottom:'1px solid var(--border)' }}>
          ⬡ AGENT TOPOLOGY
        </div>
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:6, padding:8 }}>
          <TopologyMap agents={data} />
        </div>
      </div>

      {/* ── Security Controls ── */}
      <div>
        <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:10, color:'var(--text-dim)',
          letterSpacing:3, textTransform:'uppercase', marginBottom:8,
          paddingBottom:8, borderBottom:'1px solid var(--border)' }}>
          ⬡ SECURITY CONTROLS
        </div>
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:6, padding:10 }}>
          <SecurityControls />
        </div>
      </div>

      {/* ── Permission Levels ── */}
      <div>
        <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:10, color:'var(--text-dim)',
          letterSpacing:3, textTransform:'uppercase', marginBottom:8,
          paddingBottom:8, borderBottom:'1px solid var(--border)' }}>
          ⬡ PERMISSION LEVELS
        </div>
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:6, padding:10,
          display:'flex', flexDirection:'column', gap:8 }}>
          {PERMISSION_LEVELS.map(p => (
            <div key={p.label}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                <span style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:p.color }}>{p.label}</span>
              </div>
              <div style={{ height:4, background:'var(--bg-deep)', borderRadius:2, overflow:'hidden',
                border:'1px solid var(--border)' }}>
                <div style={{ height:'100%', width:`${p.width}%`, background:p.color, borderRadius:2,
                  boxShadow:`0 0 6px ${p.color}` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── System Stats ── */}
      <div>
        <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:10, color:'var(--text-dim)',
          letterSpacing:3, textTransform:'uppercase', marginBottom:8,
          paddingBottom:8, borderBottom:'1px solid var(--border)' }}>
          ⬡ SYSTEM STATS
        </div>
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:6,
          padding:10, display:'flex', flexDirection:'column', gap:6 }}>
          {[
            { label:'Active Agents',   value: data.filter(a=>a.state!=='idle'&&a.state!=='paused').length, color:'var(--accent-cyan)' },
            { label:'Working Now',     value: data.filter(a=>a.state==='working').length,                  color:'var(--accent-orange)' },
            { label:'Alerts',          value: data.filter(a=>a.state==='alert').length,                    color:'var(--accent-red)' },
            { label:'Total Tasks 24h', value: data.reduce((s,a)=>s+a.tasks_completed_24h,0),               color:'var(--accent-green)' },
          ].map(stat => (
            <div key={stat.label} style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-secondary)' }}>
                {stat.label}
              </span>
              <span style={{ fontFamily:'Orbitron, sans-serif', fontSize:11, fontWeight:700, color:stat.color }}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      </div>

    </aside>
  )
}
