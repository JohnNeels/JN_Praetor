import { useState } from 'react'
import { useAgents, useBudget, useHealth } from './hooks/useApi'
import { MOCK_AGENTS, MOCK_INCIDENTS } from './data/mockData'
import Header       from './components/Header'
import AgentSidebar from './components/AgentSidebar'
import CenterPanel  from './components/CenterPanel'
import RightSidebar from './components/RightSidebar'
import NotifyBar    from './components/NotifyBar'
import AdminPanel   from './components/AdminPanel'

export default function App() {
  const { agents: liveAgents, ready } = useAgents()
  const budgetReport = useBudget()
  const health = useHealth()
  const [view, setView] = useState('dashboard')  // 'dashboard' | 'admin'

  const agents    = ready && liveAgents.length ? liveAgents : MOCK_AGENTS
  const incidents = MOCK_INCIDENTS

  const agentCount    = agents.filter(a => a.state !== 'idle').length
  const openIncidents = incidents.filter(i => ['p1','p2'].includes(i.sev)).length
  const ptuUsed       = agents.reduce((s, a) => s + a.ptu_consumed, 0)
  const resolvedToday = agents.reduce((s, a) => s + a.tasks_completed_24h, 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden',
      background:'var(--bg-void)', color:'var(--text-primary)' }}>

      <Header
        health={health}
        agentCount={agentCount}
        openIncidents={openIncidents}
        ptuUsed={ptuUsed}
        resolvedToday={resolvedToday}
      />

      {/* ── Top nav ── */}
      <div style={{ display:'flex', alignItems:'center', gap:0,
        background:'var(--bg-deep)', borderBottom:'2px solid var(--border)',
        paddingLeft:16, flexShrink:0 }}>
        {[
          { key:'dashboard', label:'⬡ DASHBOARD', color:'var(--accent-cyan)' },
          { key:'admin',     label:'⚙ ADMIN',     color:'var(--accent-orange)' },
        ].map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            style={{ fontFamily:'Share Tech Mono, monospace', fontSize:11, padding:'10px 22px',
              letterSpacing:2, cursor:'pointer', border:'none', background:'transparent',
              color: view === t.key ? t.color : 'var(--text-dim)',
              borderBottom: view === t.key ? `2px solid ${t.color}` : '2px solid transparent',
              marginBottom:-2, transition:'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {view === 'dashboard' ? (
        <div style={{ display:'grid', gridTemplateColumns:'260px 1fr 220px', flex:1, overflow:'hidden' }}>
          <AgentSidebar agents={agents} />
          <CenterPanel  agents={agents} incidents={incidents} budgetReport={budgetReport} />
          <RightSidebar agents={agents} budgetReport={budgetReport} />
        </div>
      ) : (
        <AdminPanel agents={agents} health={health} budgetReport={budgetReport} />
      )}

      <NotifyBar />
    </div>
  )
}
