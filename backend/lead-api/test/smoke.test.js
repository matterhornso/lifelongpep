import assert from 'node:assert/strict'
import worker from '../src/index.js'

function createMockDb() {
  const leads = new Map()
  const events = []
  const notes = []
  const rateLimits = new Map()

  return {
    prepare(sql) {
      const executeAll = async (args = []) => {
        if (sql.includes('FROM lead_notes')) return { results: notes.filter(note => note.lead_id === args[0]) }
        if (sql.includes('FROM lead_events')) return { results: events.filter(event => event.lead_id === args[0]) }
        if (sql.includes('GROUP BY status')) {
          const counts = new Map()
          for (const lead of leads.values()) counts.set(lead.status, (counts.get(lead.status) || 0) + 1)
          return { results: Array.from(counts, ([status, count]) => ({ status, count })) }
        }
        if (sql.includes('GROUP BY intent')) {
          const counts = new Map()
          for (const lead of leads.values()) counts.set(lead.intent, (counts.get(lead.intent) || 0) + 1)
          return { results: Array.from(counts, ([intent, count]) => ({ intent, count })) }
        }
        return { results: Array.from(leads.values()) }
      }
      const executeFirst = async (args = []) => {
        if (sql.includes('SELECT hits FROM rate_limits')) return rateLimits.get(args[0]) || null
        if (sql.includes('WHERE idempotency_key = ?')) {
          return Array.from(leads.values()).find(lead => lead.idempotency_key === args[0]) || null
        }
        if (sql.includes('SELECT id FROM leads WHERE id = ?')) return leads.has(args[0]) ? { id: args[0] } : null
        if (sql.includes('SELECT * FROM leads WHERE id = ?')) return leads.get(args[0]) || null
        if (sql.includes('SELECT id, intent, lead_type, status')) return leads.get(args[0]) || null
        if (sql.includes('COUNT(*) AS count')) return { count: leads.size }
        return null
      }
      return {
        async all() {
          return executeAll()
        },
        async first() {
          return executeFirst()
        },
        bind(...args) {
          return {
            async run() {
              if (sql.includes('INSERT INTO rate_limits')) {
                const [bucket, windowStart] = args
                const current = rateLimits.get(bucket) || { bucket, hits: 0, window_start: windowStart }
                current.hits += 1
                rateLimits.set(bucket, current)
                return { success: true }
              }
              if (sql.includes('INSERT INTO leads')) {
                const [
                  id, email, name, phone, city, country, intent, leadType, source, landingPath,
                  priority, payloadJson, userAgent, ipHash, idempotencyKey, consentToContact, consentToStore
                ] = args
                leads.set(id, {
                  id, email, name, phone, city, country, intent, lead_type: leadType, source,
                  landing_path: landingPath, status: 'received', priority, assigned_to: null,
                  payload_json: payloadJson, user_agent: userAgent, ip_hash: ipHash,
                  idempotency_key: idempotencyKey, consent_to_contact: consentToContact,
                  consent_to_store: consentToStore, created_at: '2026-06-17 00:00:00',
                  updated_at: '2026-06-17 00:00:00'
                })
                return { success: true }
              }
              if (sql.includes('INSERT INTO lead_events')) {
                const [id, leadId, eventType, actor, payloadJson] = args
                events.push({ id, lead_id: leadId, event_type: eventType, actor, payload_json: payloadJson, created_at: '2026-06-17 00:00:00' })
                return { success: true }
              }
              if (sql.includes('INSERT INTO lead_notes')) {
                const [id, leadId, note, author] = args
                notes.push({ id, lead_id: leadId, note, author, created_at: '2026-06-17 00:00:00' })
                return { success: true }
              }
              if (sql.includes('UPDATE leads')) {
                const [status, priority, assignedTo, id] = args
                const lead = leads.get(id)
                lead.status = status
                lead.priority = priority
                lead.assigned_to = assignedTo
                lead.updated_at = '2026-06-17 00:01:00'
                return { success: true }
              }
              return { success: true }
            },
            async first() {
              return executeFirst(args)
            },
            async all() {
              return executeAll(args)
            }
          }
        }
      }
    }
  }
}

const env = {
  DB: createMockDb(),
  ADMIN_TOKEN: 'secret',
  IP_HASH_SALT: 'test-salt'
}

function req(path, init = {}) {
  return new Request(`https://api.lifelongpep.fit${path}`, {
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://lifelongpep.fit', ...(init.headers || {}) },
    ...init
  })
}

const createRes = await worker.fetch(req('/v1/leads', {
  method: 'POST',
  body: JSON.stringify({ email: 'test@example.com', intent: 'glp1-readiness', lead_type: 'glp1-consult-request', city: 'Mumbai' })
}), env, { waitUntil() {} })
assert.equal(createRes.status, 201)
const created = await createRes.json()
assert.equal(created.ok, true)

const duplicateRes = await worker.fetch(req('/v1/leads', {
  method: 'POST',
  body: JSON.stringify({ email: 'test@example.com', intent: 'glp1-readiness', lead_type: 'glp1-consult-request', city: 'Mumbai' })
}), env, { waitUntil() {} })
assert.equal(duplicateRes.status, 200)
assert.equal((await duplicateRes.json()).duplicate, true)

const adminHeaders = { Authorization: 'Bearer secret' }
const listRes = await worker.fetch(req('/v1/admin/leads', { headers: adminHeaders }), env)
assert.equal(listRes.status, 200)
assert.equal((await listRes.json()).total, 1)

const patchRes = await worker.fetch(req(`/v1/admin/leads/${created.request_id}`, {
  method: 'PATCH',
  headers: adminHeaders,
  body: JSON.stringify({ status: 'qualified', priority: 'high', assigned_to: 'founder' })
}), env)
assert.equal(patchRes.status, 200)
assert.equal((await patchRes.json()).lead.status, 'qualified')

const noteRes = await worker.fetch(req(`/v1/admin/leads/${created.request_id}/notes`, {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({ note: 'Call tomorrow', author: 'founder' })
}), env)
assert.equal(noteRes.status, 200)
assert.equal((await noteRes.json()).notes.length, 1)

const metricsRes = await worker.fetch(req('/v1/admin/metrics', { headers: adminHeaders }), env)
assert.equal(metricsRes.status, 200)
assert.equal((await metricsRes.json()).total, 1)

const csvRes = await worker.fetch(req('/v1/admin/leads.csv', { headers: adminHeaders }), env)
assert.equal(csvRes.status, 200)
assert.match(await csvRes.text(), /test@example.com/)

console.log('lead-api smoke tests passed')
