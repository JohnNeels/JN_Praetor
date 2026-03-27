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

// ── Admin API ────────────────────────────────────────────────────

export async function restartService(service) {
  // service: 'orchestrator' | 'budget' | 'mcp' | agent name
  const base = service === 'budget' ? BUDGET : ORCHESTRATOR
  const path = service === 'budget' ? '/admin/restart'
    : service === 'mcp'             ? 'http://localhost:9000/admin/restart'
    : service === 'orchestrator'    ? `${ORCHESTRATOR}/admin/restart`
    : `${ORCHESTRATOR}/agents/${service}/restart`
  try {
    const r = await fetch(service === 'mcp' ? path : (service === 'budget' ? `${BUDGET}/admin/restart` : path),
      { method: 'POST' })
    return { ok: r.ok, status: r.status }
  } catch { return { ok: false, status: 0 } }
}

export async function updateAgentConfig(name, config) {
  // config: { ptu_budget, state, autonomous, persona }
  try {
    const r = await fetch(`${ORCHESTRATOR}/agents/${name}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    return { ok: r.ok, data: r.ok ? await r.json() : null }
  } catch { return { ok: false, data: null } }
}

export async function updateAgentSkills(name, skills) {
  try {
    const r = await fetch(`${ORCHESTRATOR}/agents/${name}/skills`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skills }),
    })
    return { ok: r.ok }
  } catch { return { ok: false } }
}

export async function resetBudget(name) {
  try {
    const r = await fetch(`${BUDGET}/budget/reset/${name}`, { method: 'POST' })
    return { ok: r.ok }
  } catch { return { ok: false } }
}

export async function scaleAgent(name, replicas) {
  try {
    const r = await fetch(`${ORCHESTRATOR}/agents/${name}/scale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replicas }),
    })
    return { ok: r.ok }
  } catch { return { ok: false } }
}
