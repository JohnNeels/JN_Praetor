import { useState, useEffect, useCallback } from 'react'

const ORCHESTRATOR = 'http://localhost:8000'
const BUDGET = 'http://localhost:8100'

export function useAgents(interval = 5000) {
  const [agents, setAgents] = useState([])
  const [ready, setReady] = useState(false)

  const fetch_ = useCallback(async () => {
    try {
      const r = await fetch(`${ORCHESTRATOR}/agents`)
      if (r.ok) { setAgents(await r.json()); setReady(true) }
    } catch { /* backend offline — use mock data */ }
  }, [])

  useEffect(() => { fetch_(); const t = setInterval(fetch_, interval); return () => clearInterval(t) }, [fetch_, interval])
  return { agents, ready }
}

export function useBudget(interval = 4000) {
  const [report, setReport] = useState(null)

  const fetch_ = useCallback(async () => {
    try {
      const r = await fetch(`${BUDGET}/budget/report`)
      if (r.ok) setReport(await r.json())
    } catch { /* backend offline */ }
  }, [])

  useEffect(() => { fetch_(); const t = setInterval(fetch_, interval); return () => clearInterval(t) }, [fetch_, interval])
  return report
}

export function useHealth(interval = 8000) {
  const [health, setHealth] = useState({ orchestrator: false, budget: false, mcp: false })

  const check = useCallback(async () => {
    const check_ = async (url) => { try { const r = await fetch(url); return r.ok } catch { return false } }
    const [orch, bud, mcp] = await Promise.all([
      check_(`${ORCHESTRATOR}/health/live`),
      check_(`${BUDGET}/health/live`),
      check_('http://localhost:9000/health/live'),
    ])
    setHealth({ orchestrator: orch, budget: bud, mcp })
  }, [])

  useEffect(() => { check(); const t = setInterval(check, interval); return () => clearInterval(t) }, [check, interval])
  return health
}

export async function submitTask(task) {
  const r = await fetch(`${ORCHESTRATOR}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  })
  return r.json()
}

export async function pauseAgent(name) {
  return fetch(`${ORCHESTRATOR}/agents/${name}/pause`, { method: 'POST' })
}

export async function resumeAgent(name) {
  return fetch(`${ORCHESTRATOR}/agents/${name}/resume`, { method: 'POST' })
}
