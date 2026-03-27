import { useState } from 'react'
import { MOCK_AGENTS } from '../data/mockData'
import {
  restartService, updateAgentConfig, updateAgentSkills,
  resetBudget, scaleAgent, pauseAgent, resumeAgent,
} from '../hooks/useApi'

/* ── helpers ──────────────────────────────────────────────────── */
const btn = (color = 'cyan', small = false) => ({
  fontFamily: 'Share Tech Mono, monospace',
  fontSize: small ? 9 : 10,
  padding: small ? '2px 8px' : '5px 14px',
  borderRadius: 4,
  cursor: 'pointer',
  border: `1px solid rgba(${color === 'cyan' ? '0,212,255' : color === 'green' ? '0,255,136' : color === 'red' ? '255,48,85' : color === 'orange' ? '255,107,43' : '168,85,247'},0.4)`,
  background: `rgba(${color === 'cyan' ? '0,212,255' : color === 'green' ? '0,255,136' : color === 'red' ? '255,48,85' : color === 'orange' ? '255,107,43' : '168,85,247'},0.1)`,
  color: `var(--accent-${color === 'cyan' ? 'cyan' : color === 'green' ? 'green' : color === 'red' ? 'red' : color === 'orange' ? 'orange' : 'purple'})`,
  transition: 'all 0.15s',
})

const sectionHead = {
  fontFamily: 'Share Tech Mono, monospace', fontSize: 10, color: 'var(--text-dim)',
  letterSpacing: 3, textTransform: 'uppercase', marginBottom: 12,
  paddingBottom: 8, borderBottom: '1px solid var(--border)',
}

const card = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 8, padding: 14, marginBottom: 10,
}

const inputStyle = {
  background: 'var(--bg-deep)', border: '1px solid var(--border-bright)',
  color: 'var(--text-primary)', fontFamily: 'Share Tech Mono, monospace',
  fontSize: 11, padding: '4px 8px', borderRadius: 4, width: '100%', boxSizing: 'border-box',
}

const SKILL_OPTIONS = [
  'Splunk SIEM','Splunk APM','ELK Search','Log Patterns',
  'Dynatrace','Dynatrace APM','Topology','Causality',
  'ServiceNow','CMDB','Incident Mgmt',
  'GitHub MCP','CI/CD','Rollback',
  'WebEx','MS Teams','Alert Routing',
  'Email Inbox','Auto-Reply',
  'API Discovery','REST APIs','GraphQL','Endpoint Map',
  'RCA Engine','Threat Intel',
  'RBAC Audit','Compliance','Access Review',
  'PagerDuty','On-Call','Escalation',
  'Multi-Agent','Workflow','Coordination',
  'Azure ARM','Terraform',
]

const SERVICES = [
  { key: 'orchestrator', label: 'Orchestrator',     port: 8000, color: 'cyan' },
  { key: 'budget',       label: 'Budget Controller', port: 8100, color: 'green' },
  { key: 'mcp',          label: 'MCP Gateway',       port: 9000, color: 'purple' },
  { key: 'nova-7',       label: 'NOVA-7 Agent',      port: 8080, color: 'orange' },
]

const AGENT_TABS = ['SENTINEL-1','NOVA-7','ECHO-2','WEAVER-4','HERALD-3','FORGE-5',
                    'ATLAS-6','ORACLE-8','PRISM-9','RELAY-10','CIPHER-11','NEXUS-12']

const COLOR_MAP = {
  'SENTINEL-1':'var(--accent-red)', 'NOVA-7':'var(--accent-cyan)', 'ECHO-2':'var(--accent-green)',
  'WEAVER-4':'var(--accent-purple)', 'HERALD-3':'var(--accent-orange)', 'FORGE-5':'var(--accent-purple)',
  'ATLAS-6':'var(--accent-green)', 'ORACLE-8':'var(--accent-cyan)', 'PRISM-9':'var(--accent-cyan)',
  'RELAY-10':'var(--accent-orange)', 'CIPHER-11':'var(--accent-red)', 'NEXUS-12':'var(--accent-purple)',
}

const DEFAULT_SKILLS = {
  'SENTINEL-1':['Threat Intel','Splunk SIEM','ServiceNow'],
  'NOVA-7':['RCA Engine','Dynatrace','Splunk APM'],
  'ECHO-2':['WebEx','MS Teams','Alert Routing'],
  'WEAVER-4':['Dynatrace','Topology','Causality'],
  'HERALD-3':['Email Inbox','ServiceNow','Auto-Reply'],
  'FORGE-5':['GitHub MCP','CI/CD','Rollback'],
  'ATLAS-6':['API Discovery','CMDB','Topology'],
  'ORACLE-8':['REST APIs','GraphQL','Endpoint Map'],
  'PRISM-9':['Splunk APM','ELK Search','Log Patterns'],
  'RELAY-10':['PagerDuty','On-Call','Escalation'],
  'CIPHER-11':['RBAC Audit','Compliance','Access Review'],
  'NEXUS-12':['Multi-Agent','Workflow','Coordination'],
}

/* ── Toast notification ───────────────────────────────────────── */
function Toast({ msg, type }) {
  if (!msg) return null
  const color = type === 'ok' ? 'var(--accent-green)' : type === 'err' ? 'var(--accent-red)' : 'var(--accent-cyan)'
  return (
    <div style={{ position:'fixed', bottom:50, right:24, zIndex:9999,
      background:'var(--bg-card)', border:`1px solid ${color}`,
      borderRadius:6, padding:'8px 16px', fontFamily:'Share Tech Mono, monospace',
      fontSize:11, color, animation:'fadeIn 0.3s ease', boxShadow:`0 0 20px ${color}44` }}>
      {type === 'ok' ? '✓' : type === 'err' ? '✗' : 'ℹ'} {msg}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SECTION 1 — SERVICE CONTROLS
══════════════════════════════════════════════════════════════ */
function ServiceControls({ health }) {
  const [restarting, setRestarting] = useState({})
  const [toast, setToast]   = useState(null)

  const notify = (msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const doRestart = async (key, label) => {
    setRestarting(r => ({ ...r, [key]: true }))
    const res = await restartService(key)
    setRestarting(r => ({ ...r, [key]: false }))
    notify(res.ok ? `${label} restarted` : `${label} offline — restart queued`, res.ok ? 'ok' : 'warn')
  }

  const statusFor = (key) => {
    if (key === 'orchestrator') return health.orchestrator
    if (key === 'budget')       return health.budget
    if (key === 'mcp')          return health.mcp
    return null   // agent — unknown until polled separately
  }

  return (
    <div>
      <div style={sectionHead}>⬡ SERVICE CONTROLS</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        {SERVICES.map(svc => {
          const up = statusFor(svc.key)
          const color = svc.color
          return (
            <div key={svc.key} style={{ ...card, marginBottom:0,
              borderColor: up === true ? 'rgba(0,255,136,0.25)' : up === false ? 'rgba(255,48,85,0.25)' : 'var(--border)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <span style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:700, fontSize:14, color:`var(--accent-${color})` }}>
                  {svc.label}
                </span>
                <span style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, padding:'2px 7px', borderRadius:10,
                  background: up === true ? 'rgba(0,255,136,0.15)' : up === false ? 'rgba(255,48,85,0.15)' : 'rgba(122,156,200,0.1)',
                  color: up === true ? 'var(--accent-green)' : up === false ? 'var(--accent-red)' : 'var(--text-dim)' }}>
                  {up === true ? 'ONLINE' : up === false ? 'OFFLINE' : 'UNKNOWN'}
                </span>
              </div>
              <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-dim)', marginBottom:10 }}>
                PORT :{svc.port}
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button style={btn(color, true)}
                  disabled={restarting[svc.key]}
                  onClick={() => doRestart(svc.key, svc.label)}>
                  {restarting[svc.key] ? '↻ RESTARTING…' : '↻ RESTART'}
                </button>
                <button style={btn('red', true)}
                  onClick={() => notify(`${svc.label} stop not allowed from UI`, 'err')}>
                  ■ STOP
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Restart All */}
      <div style={{ marginTop:12, display:'flex', gap:8 }}>
        <button style={{ ...btn('orange'), width:'100%', textAlign:'center' }}
          onClick={async () => {
            notify('Restarting all services…', 'info')
            for (const svc of SERVICES) await doRestart(svc.key, svc.label)
            notify('All services restart commands sent', 'ok')
          }}>
          ↻ RESTART ALL SERVICES
        </button>
      </div>
      {toast && <Toast {...toast} />}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SECTION 2 — AGENT CONFIGURATION
══════════════════════════════════════════════════════════════ */
function AgentConfig({ agents }) {
  const data = agents.length ? agents : MOCK_AGENTS
  const [configs, setConfigs] = useState(() =>
    Object.fromEntries(data.map(a => [a.agent_name, {
      ptu_budget: a.ptu_budget,
      state: a.state,
      replicas: 1,
      autonomous: true,
      persona: a.persona,
    }]))
  )
  const [saving, setSaving] = useState({})
  const [toast, setToast]   = useState(null)

  const notify = (msg, type = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const update = (name, field, value) =>
    setConfigs(c => ({ ...c, [name]: { ...c[name], [field]: value } }))

  const save = async (name) => {
    setSaving(s => ({ ...s, [name]: true }))
    const res = await updateAgentConfig(name.toLowerCase(), configs[name])
    setSaving(s => ({ ...s, [name]: false }))
    notify(res.ok ? `${name} config saved` : `${name} — backend offline, config staged locally`, res.ok ? 'ok' : 'warn')
  }

  const doScale = async (name) => {
    const res = await scaleAgent(name.toLowerCase(), configs[name]?.replicas ?? 1)
    notify(res.ok ? `${name} scaled to ${configs[name]?.replicas} replica(s)` : `Scale queued (backend offline)`, res.ok ? 'ok' : 'warn')
  }

  const doResetBudget = async (name) => {
    const res = await resetBudget(name.toLowerCase())
    notify(res.ok ? `${name} PTU budget reset` : `Budget reset queued (backend offline)`, res.ok ? 'ok' : 'warn')
  }

  const doPause = async (a) => {
    if (configs[a.agent_name]?.state === 'paused') {
      await resumeAgent(a.agent_name.toLowerCase())
      update(a.agent_name, 'state', 'idle')
      notify(`${a.agent_name} resumed`)
    } else {
      await pauseAgent(a.agent_name.toLowerCase())
      update(a.agent_name, 'state', 'paused')
      notify(`${a.agent_name} paused`, 'warn')
    }
  }

  return (
    <div>
      <div style={sectionHead}>⬡ AGENT CONFIGURATION</div>
      {data.map(agent => {
        const cfg = configs[agent.agent_name] || {}
        const color = COLOR_MAP[agent.agent_name] || 'var(--accent-cyan)'
        const isPaused = cfg.state === 'paused'
        return (
          <div key={agent.agent_name} style={{ ...card, borderLeft:`3px solid ${color}` }}>
            {/* Header row */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div>
                <span style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:700, fontSize:15, color }}>{agent.agent_name}</span>
                <span style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-dim)', marginLeft:8 }}>{agent.persona}</span>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button style={btn(isPaused ? 'green' : 'orange', true)} onClick={() => doPause(agent)}>
                  {isPaused ? '▶ RESUME' : '⏸ PAUSE'}
                </button>
                <button style={btn('red', true)} onClick={() => doResetBudget(agent.agent_name)}>
                  ↺ RESET PTU
                </button>
              </div>
            </div>

            {/* Config fields */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10, marginBottom:10 }}>
              {/* PTU Budget */}
              <div>
                <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-dim)', marginBottom:4 }}>PTU BUDGET</div>
                <input type="number" min={1} max={20} style={inputStyle} value={cfg.ptu_budget ?? agent.ptu_budget}
                  onChange={e => update(agent.agent_name, 'ptu_budget', parseInt(e.target.value))} />
              </div>

              {/* State */}
              <div>
                <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-dim)', marginBottom:4 }}>STATE</div>
                <select style={{ ...inputStyle, appearance:'none' }} value={cfg.state ?? agent.state}
                  onChange={e => update(agent.agent_name, 'state', e.target.value)}>
                  {['active','idle','paused','working','alert'].map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                </select>
              </div>

              {/* Replicas */}
              <div>
                <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-dim)', marginBottom:4 }}>REPLICAS</div>
                <div style={{ display:'flex', gap:4 }}>
                  <input type="number" min={0} max={10} style={{ ...inputStyle, flex:1 }} value={cfg.replicas ?? 1}
                    onChange={e => update(agent.agent_name, 'replicas', parseInt(e.target.value))} />
                  <button style={{ ...btn('purple', true), whiteSpace:'nowrap' }}
                    onClick={() => doScale(agent.agent_name)}>SET</button>
                </div>
              </div>

              {/* Autonomous */}
              <div>
                <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-dim)', marginBottom:4 }}>AUTONOMOUS</div>
                <div onClick={() => update(agent.agent_name, 'autonomous', !cfg.autonomous)}
                  style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', paddingTop:4 }}>
                  <div style={{ width:36, height:18, borderRadius:9,
                    background: cfg.autonomous ? 'rgba(0,255,136,0.25)' : 'rgba(122,156,200,0.1)',
                    border:`1px solid ${cfg.autonomous ? 'var(--accent-green)' : 'var(--border)'}`,
                    position:'relative', transition:'all 0.2s' }}>
                    <div style={{ position:'absolute', top:3, left: cfg.autonomous ? 19 : 3, width:10, height:10,
                      borderRadius:'50%', background: cfg.autonomous ? 'var(--accent-green)' : 'var(--text-dim)',
                      transition:'all 0.2s' }} />
                  </div>
                  <span style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9,
                    color: cfg.autonomous ? 'var(--accent-green)' : 'var(--text-dim)' }}>
                    {cfg.autonomous ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>
            </div>

            {/* Persona */}
            <div style={{ marginBottom:10 }}>
              <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-dim)', marginBottom:4 }}>PERSONA / ROLE</div>
              <input style={inputStyle} value={cfg.persona ?? agent.persona}
                onChange={e => update(agent.agent_name, 'persona', e.target.value)} />
            </div>

            {/* Save */}
            <button style={{ ...btn('cyan', true) }} disabled={saving[agent.agent_name]}
              onClick={() => save(agent.agent_name)}>
              {saving[agent.agent_name] ? '↻ SAVING…' : '✓ SAVE CONFIG'}
            </button>
          </div>
        )
      })}
      {toast && <Toast {...toast} />}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SECTION 3 — SKILL EDITOR
══════════════════════════════════════════════════════════════ */
function SkillEditor({ agents }) {
  const data = agents.length ? agents : MOCK_AGENTS
  const [selected, setSelected] = useState(AGENT_TABS[0])
  const [skills, setSkills] = useState(() =>
    Object.fromEntries(AGENT_TABS.map(n => [n, [...(DEFAULT_SKILLS[n] || [])]]))
  )
  const [newSkill, setNewSkill] = useState('')
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState(null)

  const notify = (msg, type = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const removeSkill = (agent, sk) =>
    setSkills(s => ({ ...s, [agent]: s[agent].filter(x => x !== sk) }))

  const addSkill = (agent, sk) => {
    if (!sk || skills[agent].includes(sk)) return
    setSkills(s => ({ ...s, [agent]: [...s[agent], sk] }))
    setNewSkill('')
  }

  const saveSkills = async () => {
    setSaving(true)
    const res = await updateAgentSkills(selected.toLowerCase(), skills[selected])
    setSaving(false)
    notify(res.ok ? `${selected} skills saved` : `${selected} skills staged locally (backend offline)`, res.ok ? 'ok' : 'warn')
  }

  const color = COLOR_MAP[selected] || 'var(--accent-cyan)'

  return (
    <div>
      <div style={sectionHead}>⬡ SKILL EDITOR</div>

      {/* Agent selector */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16 }}>
        {AGENT_TABS.map(name => (
          <button key={name} onClick={() => setSelected(name)}
            style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, padding:'4px 10px', borderRadius:4, cursor:'pointer',
              background: selected === name ? `${COLOR_MAP[name]}22` : 'var(--bg-card)',
              border: `1px solid ${selected === name ? COLOR_MAP[name] : 'var(--border)'}`,
              color: selected === name ? COLOR_MAP[name] : 'var(--text-dim)',
              transition:'all 0.15s' }}>
            {name}
          </button>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:700, fontSize:14, color, marginBottom:12 }}>
          {selected} — Active Skills
        </div>

        {/* Current skills */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14, minHeight:32 }}>
          {skills[selected]?.map(sk => (
            <span key={sk} style={{ display:'flex', alignItems:'center', gap:4, fontSize:9, padding:'3px 8px',
              borderRadius:3, fontFamily:'Share Tech Mono, monospace',
              background:`${color}14`, border:`1px solid ${color}33`, color }}>
              {sk}
              <span onClick={() => removeSkill(selected, sk)}
                style={{ cursor:'pointer', color:'var(--accent-red)', fontSize:10, lineHeight:1 }}>✕</span>
            </span>
          ))}
          {!skills[selected]?.length && (
            <span style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-dim)' }}>No skills assigned</span>
          )}
        </div>

        {/* Add skill */}
        <div style={{ display:'flex', gap:6, marginBottom:12 }}>
          <select style={{ ...inputStyle, flex:1 }} value={newSkill}
            onChange={e => setNewSkill(e.target.value)}>
            <option value="">— select skill to add —</option>
            {SKILL_OPTIONS.filter(s => !skills[selected]?.includes(s)).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button style={btn('green', true)} onClick={() => addSkill(selected, newSkill)}>+ ADD</button>
        </div>

        {/* Custom skill */}
        <div style={{ display:'flex', gap:6, marginBottom:14 }}>
          <input placeholder="Custom skill name…" style={{ ...inputStyle, flex:1 }}
            value={newSkill.startsWith('__') ? newSkill.slice(2) : ''}
            onFocus={() => setNewSkill('__')}
            onChange={e => setNewSkill('__' + e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addSkill(selected, newSkill.slice(2)) }} />
          <button style={btn('cyan', true)} onClick={() => addSkill(selected, newSkill.startsWith('__') ? newSkill.slice(2) : newSkill)}>
            + CUSTOM
          </button>
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <button style={btn('cyan')} onClick={saveSkills} disabled={saving}>
            {saving ? '↻ SAVING…' : '✓ SAVE SKILLS'}
          </button>
          <button style={btn('red', true)}
            onClick={() => { setSkills(s => ({ ...s, [selected]: [] })); notify(`${selected} skills cleared`, 'warn') }}>
            CLEAR ALL
          </button>
          <button style={btn('orange', true)}
            onClick={() => { setSkills(s => ({ ...s, [selected]: [...(DEFAULT_SKILLS[selected] || [])] })); notify('Skills reset to defaults') }}>
            RESET DEFAULTS
          </button>
        </div>
      </div>
      {toast && <Toast {...toast} />}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SECTION 4 — PTU BUDGET MANAGER
══════════════════════════════════════════════════════════════ */
function BudgetManager({ agents, budgetReport }) {
  const data = agents.length ? agents : MOCK_AGENTS
  const [caps, setCaps] = useState(() =>
    Object.fromEntries(data.map(a => [a.agent_name, a.ptu_budget]))
  )
  const [toast, setToast] = useState(null)
  const notify = (msg, type = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const totalCap = Object.values(caps).reduce((s, v) => s + (v || 0), 0)
  const POOL = 40

  return (
    <div>
      <div style={sectionHead}>⬡ PTU BUDGET MANAGER</div>

      {/* Pool overview */}
      <div style={{ ...card, display:'flex', gap:20, marginBottom:16 }}>
        {[
          { label:'Total Pool',    val:POOL,              color:'var(--accent-cyan)' },
          { label:'Allocated',     val:totalCap,          color: totalCap > POOL ? 'var(--accent-red)' : 'var(--accent-orange)' },
          { label:'Reserve',       val:Math.max(0,POOL-totalCap), color:'var(--accent-green)' },
          { label:'Agents',        val:data.length,       color:'var(--accent-purple)' },
        ].map(s => (
          <div key={s.label} style={{ textAlign:'center', flex:1 }}>
            <div style={{ fontFamily:'Orbitron, sans-serif', fontSize:18, fontWeight:700, color:s.color }}>{s.val}</div>
            <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-dim)', letterSpacing:1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {totalCap > POOL && (
        <div style={{ ...card, borderColor:'var(--accent-red)', background:'rgba(255,48,85,0.05)', marginBottom:12,
          fontFamily:'Share Tech Mono, monospace', fontSize:10, color:'var(--accent-red)' }}>
          ⚠ Total allocation ({totalCap} PTU) exceeds pool ({POOL} PTU). Reduce agent caps.
        </div>
      )}

      {/* Per-agent bars */}
      {data.map(agent => {
        const cap = caps[agent.agent_name] ?? agent.ptu_budget
        const consumed = agent.ptu_consumed ?? 0
        const pct = Math.min(Math.round((consumed / cap) * 100), 100)
        const color = COLOR_MAP[agent.agent_name] || 'var(--accent-cyan)'
        return (
          <div key={agent.agent_name} style={{ marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontFamily:'Share Tech Mono, monospace', fontSize:10, color, minWidth:100 }}>{agent.agent_name}</span>
                <span style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-dim)' }}>
                  {consumed}/{cap} PTU ({pct}%)
                </span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <input type="range" min={1} max={20} value={cap}
                  onChange={e => setCaps(c => ({ ...c, [agent.agent_name]: parseInt(e.target.value) }))}
                  style={{ width:80, accentColor: color.replace('var(','').replace(')','') }} />
                <input type="number" min={1} max={20} value={cap}
                  onChange={e => setCaps(c => ({ ...c, [agent.agent_name]: parseInt(e.target.value) }))}
                  style={{ ...inputStyle, width:44, textAlign:'center', padding:'2px 4px' }} />
                <button style={btn('orange', true)} onClick={async () => {
                  const res = await resetBudget(agent.agent_name.toLowerCase())
                  notify(res.ok ? `${agent.agent_name} PTU reset` : `Reset queued (offline)`, res.ok ? 'ok' : 'warn')
                }}>↺</button>
              </div>
            </div>
            <div style={{ height:5, background:'var(--bg-deep)', borderRadius:3, overflow:'hidden', border:'1px solid var(--border)' }}>
              <div style={{ height:'100%', borderRadius:3, transition:'width 0.4s',
                width:`${(cap / POOL) * 100}%`, background:'var(--border-bright)', opacity:0.4 }} />
            </div>
            <div style={{ height:5, background:'transparent', borderRadius:3, overflow:'hidden', marginTop:-5 }}>
              <div style={{ height:'100%', borderRadius:3, transition:'width 0.4s',
                width:`${pct * (cap / POOL)}%`,
                background: pct > 80 ? 'var(--accent-red)' : pct > 60 ? 'var(--accent-orange)' : color }} />
            </div>
          </div>
        )
      })}

      <button style={{ ...btn('cyan'), width:'100%', textAlign:'center', marginTop:8 }}
        onClick={async () => {
          for (const agent of data) {
            await updateAgentConfig(agent.agent_name.toLowerCase(), { ptu_budget: caps[agent.agent_name] })
          }
          notify('All PTU caps saved', 'ok')
        }}>
        ✓ SAVE ALL BUDGETS
      </button>
      {toast && <Toast {...toast} />}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   ROOT — AdminPanel
══════════════════════════════════════════════════════════════ */
const TABS = [
  { key:'services', label:'⬡ SERVICES' },
  { key:'agents',   label:'⬡ AGENTS' },
  { key:'skills',   label:'⬡ SKILLS' },
  { key:'budget',   label:'⬡ BUDGET' },
]

export default function AdminPanel({ agents, health, budgetReport }) {
  const [tab, setTab] = useState('services')

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--bg-void)' }}>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:2, padding:'8px 24px 0', background:'var(--bg-deep)',
        borderBottom:'1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ fontFamily:'Share Tech Mono, monospace', fontSize:10, padding:'6px 18px',
              letterSpacing:2, cursor:'pointer', border:'1px solid var(--border)',
              borderBottom: tab === t.key ? '1px solid var(--bg-void)' : '1px solid var(--border)',
              borderRadius:'4px 4px 0 0', marginBottom:-1,
              background: tab === t.key ? 'var(--bg-void)' : 'var(--bg-deep)',
              color: tab === t.key ? 'var(--accent-cyan)' : 'var(--text-dim)',
              transition:'all 0.15s' }}>
            {t.label}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <div style={{ fontFamily:'Share Tech Mono, monospace', fontSize:9, color:'var(--text-dim)',
          alignSelf:'center', paddingRight:4 }}>
          PRAETOR ADMIN CONSOLE v1.0
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', padding:24 }}>
        {tab === 'services' && <ServiceControls health={health} />}
        {tab === 'agents'   && <AgentConfig agents={agents} />}
        {tab === 'skills'   && <SkillEditor agents={agents} />}
        {tab === 'budget'   && <BudgetManager agents={agents} budgetReport={budgetReport} />}
      </div>
    </div>
  )
}
