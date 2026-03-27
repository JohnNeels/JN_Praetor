export const MOCK_AGENTS = [
  { agent_name:'SENTINEL-1', persona:'Security Watchdog',    state:'alert',   ptu_consumed:4, ptu_budget:8,  current_task:'Analyzing Splunk SIEM alerts', tasks_completed_24h:18, emoji:'🛡️', color:'red',    colorVar:'var(--accent-red)' },
  { agent_name:'NOVA-7',     persona:'RCA Analyst',          state:'working', ptu_consumed:6, ptu_budget:8,  current_task:'RCA on INC0084521 — prod-api-03', tasks_completed_24h:9, emoji:'🔬', color:'analyst', colorVar:'var(--accent-cyan)' },
  { agent_name:'ECHO-2',     persona:'Alert Listener',       state:'active',  ptu_consumed:2, ptu_budget:4,  current_task:null,                tasks_completed_24h:41, emoji:'📡', color:'monitor', colorVar:'var(--accent-green)' },
  { agent_name:'WEAVER-4',   persona:'Correlation Engine',   state:'working', ptu_consumed:5, ptu_budget:6,  current_task:'Dynatrace cross-signal correlation', tasks_completed_24h:7, emoji:'🧩', color:'analyst', colorVar:'var(--accent-purple)' },
  { agent_name:'HERALD-3',   persona:'Comms Analyst',        state:'active',  ptu_consumed:3, ptu_budget:6,  current_task:null,                tasks_completed_24h:12, emoji:'✉️', color:'responder', colorVar:'var(--accent-orange)' },
  { agent_name:'FORGE-5',    persona:'DevOps Executor',      state:'idle',    ptu_consumed:1, ptu_budget:6,  current_task:null,                tasks_completed_24h:4, emoji:'⚙️',  color:'ops',     colorVar:'var(--accent-purple)' },
  { agent_name:'ATLAS-6',    persona:'Infra Mapper',         state:'active',  ptu_consumed:2, ptu_budget:4,  current_task:null,                tasks_completed_24h:6, emoji:'🗺️', color:'monitor', colorVar:'var(--accent-green)' },
  { agent_name:'ORACLE-8',   persona:'API Analyst',          state:'idle',    ptu_consumed:0, ptu_budget:4,  current_task:null,                tasks_completed_24h:2, emoji:'🔮', color:'analyst', colorVar:'var(--accent-cyan)' },
  { agent_name:'PRISM-9',    persona:'Log Miner',            state:'idle',    ptu_consumed:1, ptu_budget:6,  current_task:null,                tasks_completed_24h:5, emoji:'🔍', color:'analyst', colorVar:'var(--accent-cyan)' },
  { agent_name:'RELAY-10',   persona:'Escalation Mgr',       state:'active',  ptu_consumed:0, ptu_budget:2,  current_task:null,                tasks_completed_24h:3, emoji:'📟', color:'responder', colorVar:'var(--accent-orange)' },
  { agent_name:'CIPHER-11',  persona:'Compliance',           state:'idle',    ptu_consumed:0, ptu_budget:2,  current_task:null,                tasks_completed_24h:1, emoji:'🔐', color:'security', colorVar:'var(--accent-red)' },
  { agent_name:'NEXUS-12',   persona:'Agent Coordinator',    state:'active',  ptu_consumed:1, ptu_budget:4,  current_task:null,                tasks_completed_24h:8, emoji:'🕸️', color:'ops',     colorVar:'var(--accent-purple)' },
]

export const MOCK_INCIDENTS = [
  { sev:'p1', id:'INC0084521', title:'prod-api-03: CPU spike 94% — service degradation', source:'Splunk → ServiceNow', agent:'NOVA-7',   status:'RCA IN PROGRESS', statusColor:'orange' },
  { sev:'p1', id:'INC0084518', title:'Storage node sn-07 degraded — RAID rebuild triggered', source:'WebEx Alert',   agent:'ECHO-2',   status:'ESCALATED',      statusColor:'red' },
  { sev:'p2', id:'INC0084509', title:'Dynatrace: p95 latency +340ms on checkout-service', source:'Dynatrace APM',   agent:'WEAVER-4', status:'CORRELATING',     statusColor:'orange' },
  { sev:'p2', id:'INC0084503', title:'Email: VIP complaint — login failures ×40 in 1hr',  source:'Email → ServiceNow', agent:'HERALD-3', status:'RESPONDING',   statusColor:'cyan' },
  { sev:'p3', id:'INC0084497', title:'GitHub: Deploy pipeline failed — build #2847 error', source:'GitHub MCP',    agent:'FORGE-5',  status:'QUEUED',          statusColor:'dim' },
]

export const MOCK_ACTIVITY = [
  { time:'14:32:07', agent:'NOVA-7',    color:'var(--accent-cyan)',   msg:'Pulled <b>1,240 Splunk events</b> for INC0084521 — identified memory leak in prod-api-03 microservice v2.4.1' },
  { time:'14:31:55', agent:'ECHO-2',    color:'var(--accent-green)',  msg:'WebEx alert ingested: <b>storage-sn-07 DEGRADED</b> — routed to SENTINEL-1 + created ServiceNow P1' },
  { time:'14:31:43', agent:'WEAVER-4',  color:'var(--accent-purple)', msg:'Dynatrace trace correlated: <b>checkout-service latency</b> linked to db connection pool exhaustion' },
  { time:'14:30:21', agent:'HERALD-3',  color:'var(--accent-orange)', msg:'Email auto-response drafted for VIP account <b>acme-corp</b> — awaiting approval gate' },
  { time:'14:29:58', agent:'SENTINEL-1',color:'var(--accent-red)',    msg:'Splunk SIEM: <b>3 threat signatures</b> cleared as false positive — updated suppression rule SIG-4492' },
  { time:'14:28:12', agent:'FORGE-5',   color:'var(--accent-purple)', msg:'GitHub MCP: Read build logs for <b>pipeline #2847</b> — missing env variable CI_DEPLOY_KEY detected' },
  { time:'14:26:30', agent:'ATLAS-6',   color:'var(--accent-green)',  msg:'API discovery scan complete: <b>214 endpoints</b> mapped across 18 microservices — topology graph updated' },
]

export const INTEGRATIONS = [
  { icon:'📊', name:'Splunk',     status:'LIVE',    badge:'MCP',   on:true },
  { icon:'🔭', name:'Dynatrace', status:'LIVE',    badge:'API',   on:true },
  { icon:'🐙', name:'GitHub',    status:'LIVE',    badge:'MCP',   on:true },
  { icon:'💬', name:'WebEx',     status:'LIVE',    badge:'WS',    on:true },
  { icon:'🟦', name:'MS Teams',  status:'LIVE',    badge:'API',   on:true },
  { icon:'🎫', name:'ServiceNow',status:'LIVE',    badge:'REST',  on:true },
  { icon:'📧', name:'Exchange',  status:'LIVE',    badge:'GRAPH', on:true },
  { icon:'☁️', name:'Azure',     status:'PENDING', badge:'MCP',   on:false },
  { icon:'🏗️', name:'Terraform', status:'PENDING', badge:'MCP',   on:false },
]

export const ACL_MATRIX = {
  headers: ['Splunk','Dynatrace','GitHub','WebEx','Teams','ServiceNow','Email','Terraform','Azure','Deploy'],
  rows: [
    { agent:'SENTINEL-1', perms:['R/W','R','R','R/W','R/W','R/W','—','—','R','—'] },
    { agent:'NOVA-7',     perms:['R/W','R/W','R','—','—','R/W','—','—','R','—'] },
    { agent:'ECHO-2',     perms:['R','—','—','R/W','R/W','W','—','—','—','—'] },
    { agent:'WEAVER-4',   perms:['R','R/W','—','—','—','R','—','—','R','—'] },
    { agent:'HERALD-3',   perms:['—','—','—','—','R','R/W','R/W','—','—','—'] },
    { agent:'FORGE-5',    perms:['—','—','R/W','—','W','R/W','—','R','—','GATED'] },
    { agent:'ATLAS-6',    perms:['R','R','R','—','—','R','—','R','R/W','—'] },
  ],
}
