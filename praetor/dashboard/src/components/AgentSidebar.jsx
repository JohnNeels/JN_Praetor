import { useState, useEffect, useRef } from 'react'
import { pauseAgent, resumeAgent } from '../hooks/useApi'

const COLOR_MAP = {
  'SENTINEL-1':'var(--accent-red)', 'NOVA-7':'var(--accent-cyan)', 'ECHO-2':'var(--accent-green)',
  'WEAVER-4':'var(--accent-purple)', 'HERALD-3':'var(--accent-orange)', 'FORGE-5':'var(--accent-purple)',
  'ATLAS-6':'var(--accent-green)', 'ORACLE-8':'var(--accent-cyan)', 'PRISM-9':'var(--accent-cyan)',
  'RELAY-10':'var(--accent-orange)', 'CIPHER-11':'var(--accent-red)', 'NEXUS-12':'var(--accent-purple)',
}
const EMOJI_MAP = {
  'SENTINEL-1':'🛡️','NOVA-7':'🔬','ECHO-2':'📡','WEAVER-4':'🧩','HERALD-3':'✉️','FORGE-5':'⚙️',
  'ATLAS-6':'🗺️','ORACLE-8':'🔮','PRISM-9':'🔍','RELAY-10':'📟','CIPHER-11':'🔐','NEXUS-12':'🕸️',
}
const SKILL_MAP = {
  'SENTINEL-1':['Threat Intel','Splunk SIEM','ServiceNow'],
  'NOVA-7':['RCA Engine','Dynatrace','Splunk APM'],
  'ECHO-2':['WebEx','MS Teams','Alert Routing'],
  'WEAVER-4':['Dynatrace','Topology','Causality'],
  'HERALD-3':['Email Inbox','ServiceNow','Auto-Reply'],
  'FORGE-5':['GitHub MCP','CI/CD','Rollback'],
  'ATLAS-6':['API Discovery','CMDB','Topology'],
  'ORACLE-8':['REST APIs','GraphQL','Endpoint Map'],
  'PRISM-9':['Splunk','ELK Search','Log Patterns'],
  'RELAY-10':['PagerDuty','On-Call','Escalation'],
  'CIPHER-11':['RBAC Audit','Compliance','Access Review'],
  'NEXUS-12':['Multi-Agent','Workflow','Coordination'],
}

function Sparkline({ color }) {
  const [bars, setBars] = useState(() => Array.from({length:12}, () => Math.floor(Math.random()*18)+2))
  useEffect(() => {
    const t = setInterval(() => setBars(Array.from({length:12}, () => Math.floor(Math.random()*18)+2)), 2000)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:20 }}>
      {bars.map((h,i) => (
        <div key={i} style={{ width:3, height:h, borderRadius:1, background:color, opacity:0.6, transition:'height 0.3s ease' }} />
      ))}
    </div>
  )
}

function StateBadge({ state }) {
  const map = {
    active:  { bg:'rgba(0,255,136,0.15)',  color:'var(--accent-green)',  label:'ACTIVE' },
    working: { bg:'rgba(255,107,43,0.15)', color:'var(--accent-orange)', label:'WORKING' },
    idle:    { bg:'rgba(122,156,200,0.1)', color:'var(--text-secondary)', label:'IDLE' },
    alert:   { bg:'rgba(255,48,85,0.15)',  color:'var(--accent-red)',    label:'ALERT' },
    paused:  { bg:'rgba(168,85,247,0.15)', color:'var(--accent-purple)', label:'PAUSED' },
    error:   { bg:'rgba(255,48,85,0.2)',   color:'var(--accent-red)',    label:'ERROR' },
  }
  const s = map[state] || map.idle
  return <span style={{ fontSize:10, fontFamily:'Share Tech Mono, monospace', padding:'2px 7px', borderRadius:10, background:s.bg, color:s.color }}>{s.label}</span>
}

export default function AgentSidebar({ agents }) {
  const [selected, setSelected] = useState(null)

  const PRIMARY = agents.filter(a => ['SENTINEL-1','NOVA-7','ECHO-2','WEAVER-4','HERALD-3','FORGE-5','ATLAS-6'].includes(a.agent_name))
  const STANDBY = agents.filter(a => ['ORACLE-8','PRISM-9','RELAY-10','CIPHER-11','NEXUS-12'].includes(a.agent_name))

  const handleAction = async (name, state) => {
    try {
      if (state === 'paused') await resumeAgent(name.toLowerCase())
      else await pauseAgent(name.toLowerCase())
    } catch { /* offline */ }
  }

  return (
    <aside style={{ background:'var(--bg-deep)', borderRight:'1px solid var(--border)', padding:16, overflowY:'auto' }}>
      <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:10, color:'var(--text-dim)', letterSpacing:3,
        textTransform:'uppercase', marginBottom:12, paddingBottom:8, borderBottom:'1px solid var(--border)' }}>
        ⬡ AGENT ARMY · ITOPS DIVISION
      </div>

      {PRIMARY.map(agent => {
        const color = COLOR_MAP[agent.agent_name] || 'var(--accent-cyan)'
        const pct = Math.round((agent.ptu_consumed / agent.ptu_budget) * 100)
        const isSelected = selected === agent.agent_name
        const isWorking = agent.state === 'working'
        return (
          <div key={agent.agent_name}
            onClick={() => setSelected(isSelected ? null : agent.agent_name)}
            style={{ background: isSelected ? 'var(--bg-hover)' : 'var(--bg-card)',
              border: `1px solid ${isSelected ? color : 'var(--border)'}`,
              borderRadius:8, padding:12, marginBottom:8, cursor:'pointer',
              transition:'all 0.2s', position:'relative', overflow:'hidden',
              animation: isWorking ? 'processing 2s ease-in-out infinite' : 'none' }}>
            <div style={{ position:'absolute', left:0, top:0, bottom:0, width:3, background:color, boxShadow: isSelected ? `0 0 10px ${color}` : 'none' }} />
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, paddingLeft:6 }}>
              <div style={{ width:32, height:32, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:16, background:`${color}1a`, border:`1px solid ${color}33`, flexShrink:0 }}>
                {EMOJI_MAP[agent.agent_name]}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:700, fontSize:13, color:'var(--text-primary)',
                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{agent.agent_name}</div>
                <div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:'Share Tech Mono, monospace', letterSpacing:1 }}>{agent.persona}</div>
              </div>
              <StateBadge state={agent.state} />
            </div>
            <div style={{ paddingLeft:6, display:'flex', gap:4, flexWrap:'wrap', marginBottom:6 }}>
              {SKILL_MAP[agent.agent_name]?.map((sk,i) => (
                <span key={i} style={{ fontSize:9, padding:'1px 6px', borderRadius:3, fontFamily:'Share Tech Mono, monospace',
                  background:`${color}14`, border:`1px solid ${color}33`, color }}>{sk}</span>
              ))}
            </div>
            <div style={{ paddingLeft:6, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:10, color:'var(--text-dim)', fontFamily:'Share Tech Mono, monospace' }}>
                Budget: {agent.ptu_consumed}/{agent.ptu_budget} PTU
              </span>
              <Sparkline color={color} />
            </div>
            {/* PTU progress bar */}
            <div style={{ marginTop:6, marginLeft:6, height:3, background:'var(--bg-card)', borderRadius:2, border:'1px solid var(--border)', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${Math.min(pct,100)}%`, borderRadius:2, background: pct>80?'var(--accent-red)':pct>60?'var(--accent-orange)':'var(--accent-green)', transition:'width 0.5s ease' }} />
            </div>
            {isSelected && agent.current_task && (
              <div style={{ marginTop:8, paddingLeft:6, fontSize:10, color:'var(--text-secondary)', fontFamily:'Share Tech Mono, monospace',
                fontStyle:'italic', borderTop:'1px solid var(--border)', paddingTop:6 }}>
                ▶ {agent.current_task}
              </div>
            )}
            {isSelected && (
              <div style={{ marginTop:6, paddingLeft:6, display:'flex', gap:6 }}>
                <button onClick={e=>{e.stopPropagation();handleAction(agent.agent_name,agent.state)}}
                  style={{ fontSize:9, padding:'2px 8px', borderRadius:3, background:'rgba(0,212,255,0.1)',
                    border:'1px solid rgba(0,212,255,0.3)', color:'var(--accent-cyan)', cursor:'pointer', fontFamily:'Share Tech Mono, monospace' }}>
                  {agent.state === 'paused' ? 'RESUME' : 'PAUSE'}
                </button>
                <span style={{ fontSize:9, color:'var(--text-dim)', fontFamily:'Share Tech Mono, monospace', paddingTop:3 }}>
                  24h: {agent.tasks_completed_24h} tasks
                </span>
              </div>
            )}
          </div>
        )
      })}

      <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:10, color:'var(--text-dim)', letterSpacing:3,
        textTransform:'uppercase', margin:'12px 0 8px', paddingBottom:8, borderBottom:'1px solid var(--border)' }}>
        ⬡ STANDBY POOL ({STANDBY.length} agents)
      </div>
      <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 12px',
        fontFamily:'Share Tech Mono, monospace', fontSize:10, color:'var(--text-dim)', lineHeight:2 }}>
        {STANDBY.map(a => (
          <div key={a.agent_name} style={{ display:'flex', justifyContent:'space-between' }}>
            <span>{a.agent_name} · {a.persona}</span>
            <StateBadge state={a.state} />
          </div>
        ))}
      </div>
    </aside>
  )
}
