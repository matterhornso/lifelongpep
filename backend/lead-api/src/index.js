const ALLOWED_ORIGINS = new Set([
  'https://lifelongpep.fit',
  'https://www.lifelongpep.fit',
  'http://localhost:8799',
  'http://127.0.0.1:8799'
])

const LEAD_INTENTS = new Set([
  'early-consult',
  'glp1-readiness',
  'researching-peptides',
  'doctor',
  'partner',
  'agent',
  'issues',
  'agent-intake',
  'glp1-consult-request'
])

const LEAD_STATUSES = new Set([
  'received',
  'qualified',
  'contacted',
  'scheduled',
  'waitlisted',
  'closed',
  'spam'
])

const PUBLIC_GUARDRAIL = 'Pre-launch lead capture only. No medical advice, diagnosis, prescription, payment, fulfillment, or live booking.'

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || ''
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://lifelongpep.fit'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Idempotency-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  }
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request)
    }
  })
}

function csv(request, body, filename) {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      ...corsHeaders(request)
    }
  })
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function cleanText(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function nullableText(value, max = 500) {
  const text = cleanText(value, max)
  return text || null
}

function pickIntent(body) {
  const raw = cleanText(body.intent || body.primary_intent || body.lead_type || 'early-consult', 80)
  if (LEAD_INTENTS.has(raw)) return raw
  if (raw === 'glp1_readiness') return 'glp1-readiness'
  return raw || 'early-consult'
}

function pickLeadType(body, intent) {
  const raw = cleanText(body.lead_type || body.type || '', 80)
  if (raw) return raw
  if (intent === 'agent') return 'agent-intake'
  if (intent === 'glp1-readiness') return 'glp1-consult-request'
  return 'waitlist'
}

function pickPriority(body, intent) {
  const raw = cleanText(body.priority || body.urgency || '', 40).toLowerCase()
  if (['low', 'normal', 'high'].includes(raw)) return raw
  if (intent === 'doctor' || intent === 'partner' || intent === 'agent') return 'high'
  if (intent === 'glp1-readiness') return 'normal'
  return 'normal'
}

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || ''
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashIp(request, env) {
  const salt = env.IP_HASH_SALT || ''
  const ip = getClientIp(request)
  if (!ip || !salt) return null
  return sha256Hex(`${salt}:${ip}`)
}

async function buildIdempotencyKey(request, body, email, intent) {
  const explicit = cleanText(request.headers.get('Idempotency-Key') || body.idempotency_key || '', 160)
  if (explicit) return explicit
  const basis = [
    email,
    intent,
    cleanText(body.lead_type || '', 80),
    cleanText(body.landing_path || body.path || '', 200),
    new Date().toISOString().slice(0, 10)
  ].join('|')
  return sha256Hex(basis)
}

function requireDb(request, env) {
  if (!env.DB) return json(request, { ok: false, error: 'D1 binding DB is not configured' }, 500)
  return null
}

function requireAdmin(request, env) {
  const token = env.ADMIN_TOKEN
  if (!token) return { ok: false, response: json(request, { ok: false, error: 'ADMIN_TOKEN is not configured' }, 500) }
  const auth = request.headers.get('Authorization') || ''
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : request.headers.get('X-Admin-Token') || ''
  if (provided !== token) return { ok: false, response: json(request, { ok: false, error: 'Unauthorized' }, 401) }
  return { ok: true }
}

async function readJson(request) {
  try {
    return await request.json()
  } catch (err) {
    return null
  }
}

async function recordEvent(env, leadId, type, actor, payload = {}) {
  await env.DB.prepare(
    `INSERT INTO lead_events (id, lead_id, event_type, actor, payload_json)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), leadId, type, actor || 'system', JSON.stringify(payload)).run()
}

async function enforceRateLimit(request, env, key) {
  if (!env.DB || env.DISABLE_RATE_LIMIT === 'true') return null
  const ipHash = await hashIp(request, env)
  if (!ipHash) return null

  const limit = Number(env.PUBLIC_LEAD_RATE_LIMIT || 12)
  const windowSeconds = Number(env.PUBLIC_LEAD_RATE_WINDOW_SECONDS || 3600)
  const windowStart = Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds
  const bucket = `${key}:${ipHash}:${windowStart}`

  await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, hits, window_start, updated_at)
     VALUES (?, 1, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1, updated_at = CURRENT_TIMESTAMP`
  ).bind(bucket, windowStart).run()

  const row = await env.DB.prepare('SELECT hits FROM rate_limits WHERE bucket = ?').bind(bucket).first()
  if (row && row.hits > limit) {
    return json(request, { ok: false, error: 'Rate limit exceeded. Please try again later.' }, 429)
  }
  return null
}

function publicLead(row) {
  return {
    request_id: row.id,
    intent: row.intent,
    lead_type: row.lead_type,
    status: row.status,
    priority: row.priority,
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

function adminLead(row) {
  let payload = null
  try {
    payload = JSON.parse(row.payload_json || '{}')
  } catch (err) {
    payload = {}
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    city: row.city,
    country: row.country,
    intent: row.intent,
    lead_type: row.lead_type,
    source: row.source,
    landing_path: row.landing_path,
    status: row.status,
    priority: row.priority,
    assigned_to: row.assigned_to,
    consent_to_contact: Boolean(row.consent_to_contact),
    consent_to_store: Boolean(row.consent_to_store),
    created_at: row.created_at,
    updated_at: row.updated_at,
    payload
  }
}

async function notifyLead(env, lead) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_TO_EMAIL) return
  const from = env.NOTIFY_FROM_EMAIL || 'lifelongpep <hello@lifelongpep.fit>'
  const subject = `lifelongpep lead: ${lead.intent} (${lead.email})`
  const text = [
    `New lifelongpep lead`,
    ``,
    `Email: ${lead.email}`,
    `Name: ${lead.name || ''}`,
    `Intent: ${lead.intent}`,
    `Type: ${lead.lead_type}`,
    `Priority: ${lead.priority}`,
    `Source: ${lead.source || ''}`,
    `Landing path: ${lead.landing_path || ''}`,
    `Request ID: ${lead.id}`,
    ``,
    PUBLIC_GUARDRAIL
  ].join('\n')

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: env.NOTIFY_TO_EMAIL,
      subject,
      text
    })
  })
}

async function createLead(request, env, ctx) {
  const dbError = requireDb(request, env)
  if (dbError) return dbError

  const limited = await enforceRateLimit(request, env, 'public-leads')
  if (limited) return limited

  const body = await readJson(request)
  if (!body) return json(request, { ok: false, error: 'Invalid JSON body' }, 400)

  const email = normalizeEmail(body.email)
  if (!isValidEmail(email)) {
    return json(request, { ok: false, error: 'A valid email is required' }, 400)
  }

  const intent = pickIntent(body)
  const leadType = pickLeadType(body, intent)
  const idempotencyKey = await buildIdempotencyKey(request, body, email, intent)

  const existing = await env.DB.prepare(
    `SELECT id, intent, lead_type, status, priority, created_at, updated_at
     FROM leads WHERE idempotency_key = ?`
  ).bind(idempotencyKey).first()
  if (existing) {
    await recordEvent(env, existing.id, 'duplicate_submission', 'public', { source: body.source || null })
    return json(request, {
      ok: true,
      duplicate: true,
      ...publicLead(existing),
      message: 'Lead already received.',
      medical_guardrail: PUBLIC_GUARDRAIL
    }, 200)
  }

  const id = crypto.randomUUID()
  const source = nullableText(body.source || body.page_source || body.submitted_by || 'website', 300)
  const landingPath = nullableText(body.landing_path || body.path || '', 200)
  const name = nullableText(body.name || body.full_name || body.organization || '', 160)
  const phone = nullableText(body.phone || body.mobile || '', 60)
  const city = nullableText(body.city || body.city_or_coverage || '', 120)
  const country = nullableText(body.country || 'India', 80)
  const priority = pickPriority(body, intent)
  const consentToContact = body.consent_to_contact === false ? 0 : 1
  const consentToStore = body.consent_to_store === false ? 0 : 1
  const userAgent = nullableText(request.headers.get('User-Agent') || '', 500)
  const ipHash = await hashIp(request, env)
  const now = new Date().toISOString()
  const payload = {
    ...body,
    email,
    intent,
    lead_type: leadType,
    received_at: now,
    medical_guardrail: PUBLIC_GUARDRAIL
  }

  await env.DB.prepare(
    `INSERT INTO leads (
      id, email, name, phone, city, country, intent, lead_type, source, landing_path,
      status, priority, payload_json, user_agent, ip_hash, idempotency_key,
      consent_to_contact, consent_to_store
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    email,
    name,
    phone,
    city,
    country,
    intent,
    leadType,
    source,
    landingPath,
    priority,
    JSON.stringify(payload),
    userAgent,
    ipHash,
    idempotencyKey,
    consentToContact,
    consentToStore
  ).run()

  const lead = {
    id,
    email,
    name,
    intent,
    lead_type: leadType,
    source,
    landing_path: landingPath,
    status: 'received',
    priority,
    created_at: now,
    updated_at: now
  }
  await recordEvent(env, id, 'created', 'public', { intent, lead_type: leadType, source })
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(notifyLead(env, lead).catch(() => null))

  return json(request, {
    ok: true,
    request_id: id,
    status: 'received',
    message: 'Lead received. lifelongpep is pre-launch; this is not live booking or medical advice.',
    medical_guardrail: PUBLIC_GUARDRAIL
  }, 201)
}

async function getLeadStatus(request, env, id) {
  const dbError = requireDb(request, env)
  if (dbError) return dbError

  const row = await env.DB.prepare(
    'SELECT id, intent, lead_type, status, priority, created_at, updated_at FROM leads WHERE id = ?'
  ).bind(id).first()
  if (!row) return json(request, { ok: false, error: 'Request not found' }, 404)
  return json(request, {
    ok: true,
    ...publicLead(row)
  })
}

async function listAdminLeads(request, env) {
  const dbError = requireDb(request, env)
  if (dbError) return dbError
  const auth = requireAdmin(request, env)
  if (!auth.ok) return auth.response
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200)
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0)
  const status = nullableText(url.searchParams.get('status') || '', 40)
  const intent = nullableText(url.searchParams.get('intent') || '', 80)
  const q = nullableText(url.searchParams.get('q') || '', 120)

  const where = []
  const binds = []
  if (status) {
    where.push('status = ?')
    binds.push(status)
  }
  if (intent) {
    where.push('intent = ?')
    binds.push(intent)
  }
  if (q) {
    where.push('(email LIKE ? OR name LIKE ? OR city LIKE ?)')
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const rows = await env.DB.prepare(
    `SELECT * FROM leads ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...binds, limit, offset).all()
  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM leads ${whereSql}`
  ).bind(...binds).first()

  return json(request, {
    ok: true,
    limit,
    offset,
    total: count ? count.count : 0,
    leads: (rows.results || []).map(adminLead)
  })
}

async function getAdminLead(request, env, id) {
  const dbError = requireDb(request, env)
  if (dbError) return dbError
  const auth = requireAdmin(request, env)
  if (!auth.ok) return auth.response

  const row = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first()
  if (!row) return json(request, { ok: false, error: 'Lead not found' }, 404)
  const notes = await env.DB.prepare('SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC').bind(id).all()
  const events = await env.DB.prepare('SELECT * FROM lead_events WHERE lead_id = ? ORDER BY created_at DESC LIMIT 50').bind(id).all()
  return json(request, {
    ok: true,
    lead: adminLead(row),
    notes: notes.results || [],
    events: events.results || []
  })
}

async function updateAdminLead(request, env, id) {
  const dbError = requireDb(request, env)
  if (dbError) return dbError
  const auth = requireAdmin(request, env)
  if (!auth.ok) return auth.response
  const body = await readJson(request)
  if (!body) return json(request, { ok: false, error: 'Invalid JSON body' }, 400)

  const current = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first()
  if (!current) return json(request, { ok: false, error: 'Lead not found' }, 404)

  const status = cleanText(body.status || current.status, 40)
  if (!LEAD_STATUSES.has(status)) return json(request, { ok: false, error: 'Invalid status' }, 400)
  const priority = cleanText(body.priority || current.priority || 'normal', 40)
  if (!['low', 'normal', 'high'].includes(priority)) return json(request, { ok: false, error: 'Invalid priority' }, 400)
  const assignedTo = body.assigned_to === undefined ? current.assigned_to : nullableText(body.assigned_to, 160)

  await env.DB.prepare(
    `UPDATE leads
     SET status = ?, priority = ?, assigned_to = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(status, priority, assignedTo, id).run()
  await recordEvent(env, id, 'updated', 'admin', { from_status: current.status, status, priority, assigned_to: assignedTo })

  return getAdminLead(request, env, id)
}

async function addAdminNote(request, env, id) {
  const dbError = requireDb(request, env)
  if (dbError) return dbError
  const auth = requireAdmin(request, env)
  if (!auth.ok) return auth.response
  const body = await readJson(request)
  if (!body) return json(request, { ok: false, error: 'Invalid JSON body' }, 400)
  const note = cleanText(body.note, 2000)
  if (!note) return json(request, { ok: false, error: 'Note is required' }, 400)
  const author = nullableText(body.author || 'admin', 160)
  const lead = await env.DB.prepare('SELECT id FROM leads WHERE id = ?').bind(id).first()
  if (!lead) return json(request, { ok: false, error: 'Lead not found' }, 404)
  await env.DB.prepare(
    'INSERT INTO lead_notes (id, lead_id, note, author) VALUES (?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), id, note, author).run()
  await recordEvent(env, id, 'note_added', author || 'admin')
  return getAdminLead(request, env, id)
}

function escapeCsv(value) {
  const str = String(value ?? '')
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

async function exportAdminLeads(request, env) {
  const dbError = requireDb(request, env)
  if (dbError) return dbError
  const auth = requireAdmin(request, env)
  if (!auth.ok) return auth.response
  const rows = await env.DB.prepare(
    `SELECT id, email, name, phone, city, country, intent, lead_type, source, landing_path,
            status, priority, assigned_to, created_at, updated_at
     FROM leads ORDER BY created_at DESC LIMIT 5000`
  ).all()
  const headers = ['id', 'email', 'name', 'phone', 'city', 'country', 'intent', 'lead_type', 'source', 'landing_path', 'status', 'priority', 'assigned_to', 'created_at', 'updated_at']
  const lines = [headers.join(',')]
  for (const row of rows.results || []) {
    lines.push(headers.map(h => escapeCsv(row[h])).join(','))
  }
  return csv(request, lines.join('\n'), `lifelongpep-leads-${new Date().toISOString().slice(0, 10)}.csv`)
}

async function metrics(request, env) {
  const dbError = requireDb(request, env)
  if (dbError) return dbError
  const auth = requireAdmin(request, env)
  if (!auth.ok) return auth.response
  const byStatus = await env.DB.prepare('SELECT status, COUNT(*) AS count FROM leads GROUP BY status ORDER BY count DESC').all()
  const byIntent = await env.DB.prepare('SELECT intent, COUNT(*) AS count FROM leads GROUP BY intent ORDER BY count DESC').all()
  const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM leads WHERE created_at >= datetime('now', '-7 days')").first()
  const total = await env.DB.prepare('SELECT COUNT(*) AS count FROM leads').first()
  return json(request, {
    ok: true,
    total: total ? total.count : 0,
    last_7_days: recent ? recent.count : 0,
    by_status: byStatus.results || [],
    by_intent: byIntent.results || []
  })
}

function capabilities(request) {
  return json(request, {
    ok: true,
    status: 'pre-launch',
    public_endpoints: [
      'POST /v1/leads',
      'GET /v1/leads/:id/status',
      'GET /v1/capabilities'
    ],
    admin_endpoints: [
      'GET /v1/admin/leads',
      'GET /v1/admin/leads/:id',
      'PATCH /v1/admin/leads/:id',
      'POST /v1/admin/leads/:id/notes',
      'GET /v1/admin/leads.csv',
      'GET /v1/admin/metrics'
    ],
    supported_intents: Array.from(LEAD_INTENTS),
    supported_statuses: Array.from(LEAD_STATUSES),
    guardrails: [
      'Lead capture only.',
      'No medical advice, diagnosis, prescriptions, payments, fulfillment, or live booking.',
      'GLP-1 access is not guaranteed.',
      'Doctors decide independently after launch.'
    ]
  })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) })
    }

    if (url.pathname === '/health') {
      return json(request, { ok: true, service: 'lifelongpep-lead-api' })
    }

    if (url.pathname === '/v1/capabilities' && request.method === 'GET') {
      return capabilities(request)
    }

    if (url.pathname === '/v1/leads' && request.method === 'POST') {
      return createLead(request, env, ctx)
    }

    const publicStatusMatch = url.pathname.match(/^\/v1\/leads\/([^/]+)\/status$/)
    if (publicStatusMatch && request.method === 'GET') {
      return getLeadStatus(request, env, publicStatusMatch[1])
    }

    if (url.pathname === '/v1/admin/leads' && request.method === 'GET') {
      return listAdminLeads(request, env)
    }

    if (url.pathname === '/v1/admin/leads.csv' && request.method === 'GET') {
      return exportAdminLeads(request, env)
    }

    if (url.pathname === '/v1/admin/metrics' && request.method === 'GET') {
      return metrics(request, env)
    }

    const adminLeadMatch = url.pathname.match(/^\/v1\/admin\/leads\/([^/]+)$/)
    if (adminLeadMatch && request.method === 'GET') {
      return getAdminLead(request, env, adminLeadMatch[1])
    }
    if (adminLeadMatch && request.method === 'PATCH') {
      return updateAdminLead(request, env, adminLeadMatch[1])
    }

    const adminNoteMatch = url.pathname.match(/^\/v1\/admin\/leads\/([^/]+)\/notes$/)
    if (adminNoteMatch && request.method === 'POST') {
      return addAdminNote(request, env, adminNoteMatch[1])
    }

    return json(request, { ok: false, error: 'Not found' }, 404)
  }
}
