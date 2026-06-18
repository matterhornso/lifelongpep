import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const API_BASE = (process.env.LIFELONGPEP_API_BASE || 'https://api.lifelongpep.fit').replace(/\/$/, '')
const GUARDRAIL = 'Pre-launch interest capture only. No medical advice, diagnosis, prescription, payment, fulfillment, or live booking.'

const server = new McpServer({
  name: 'lifelongpep',
  version: '0.1.0'
})

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {})
    }
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || `lifelongpep API error ${res.status}`)
  }
  return body
}

function text(data) {
  return {
    content: [
      {
        type: 'text',
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2)
      }
    ]
  }
}

server.tool(
  'lifelongpep_get_capabilities',
  'Return lifelongpep agent capabilities, launch status, and guardrails.',
  {},
  async () => {
    const data = await api('/v1/capabilities')
    return text({ ...data, guardrail: GUARDRAIL })
  }
)

server.tool(
  'lifelongpep_submit_agent_intake',
  'Submit user-approved agent intake for pre-launch GLP-1 readiness or metabolic longevity consult interest.',
  {
    email: z.string().email(),
    name: z.string().optional(),
    agent_platform: z.string().optional(),
    preferred_interface: z.enum(['mcp', 'api', 'cli', 'email']).optional(),
    primary_intent: z.string().optional(),
    country: z.string().default('India'),
    user_approved_summary: z.string().optional(),
    requested_next_step: z.string().optional()
  },
  async input => {
    const data = await api('/v1/leads', {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        intent: 'agent',
        lead_type: 'agent-intake',
        source: 'mcp',
        medical_guardrail: GUARDRAIL
      })
    })
    return text(data)
  }
)

server.tool(
  'lifelongpep_submit_glp1_consult_request',
  'Submit pre-launch interest for doctor-gated GLP-1 readiness consult access in India.',
  {
    email: z.string().email(),
    name: z.string().optional(),
    city_or_coverage: z.string().optional(),
    research_stage: z.string().optional(),
    main_priority: z.string().optional(),
    submitted_by: z.string().default('agent-assisted'),
    notes: z.string().optional()
  },
  async input => {
    const data = await api('/v1/leads', {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        intent: 'glp1-readiness',
        lead_type: 'glp1-consult-request',
        source: 'mcp',
        medical_guardrail: GUARDRAIL
      })
    })
    return text(data)
  }
)

server.tool(
  'lifelongpep_get_request_status',
  'Check the public status of a lifelongpep pre-launch request.',
  {
    request_id: z.string()
  },
  async input => {
    const data = await api(`/v1/leads/${encodeURIComponent(input.request_id)}/status`)
    return text(data)
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
