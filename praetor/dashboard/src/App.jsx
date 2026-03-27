import { useAgents, useBudget, useHealth } from './hooks/useApi'
import { MOCK_AGENTS, MOCK_INCIDENTS } from './data/mockData'
import Header      from './components/Header'
import AgentSidebar from './components/AgentSidebar'
import CenterPanel  from './components/CenterPanel'
import RightSidebar from './components/RightSidebar'
import NotifyBar    from './components/NotifyBar'

export default function App() {
  const { agents: liveAgents, ready } = useAgents()
  const budgetReport = useBudget()
  const health = useHealth()

  const agents   = ready && liveAgents.length ? liveAgents : MOCK_AGENTS
  const incidents = MOCK_INCIDENTS   // swap in live API when available

  const agentCount    = agents.filter(a => a.state !== 'idle').length
  const openIncidents = incidents.filter(i => ['p1','p2'].includes(i.sev)).length
  const ptuUsed       = agents.reduce((s,a) => s + a.ptu_consumed, 0)
  const resolvedToday = agents.reduce((s,a) => s + a.tasks_completed_24h, 0)

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

      <div style={{ display:'grid', gridTemplateColumns:'260px 1fr 220px',
        flex:1, overflow:'hidden' }}>
        <AgentSidebar agents={agents} />
        <CenterPanel  agents={agents} incidents={incidents} budgetReport={budgetReport} />
        <RightSidebar agents={agents} budgetReport={budgetReport} />
      </div>

      <NotifyBar />
    </div>
  )
}
