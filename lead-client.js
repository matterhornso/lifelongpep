(function () {
  const DEFAULT_API_BASE = 'https://api.lifelongpep.fit'
  const API_BASE = window.LIFELONGPEP_API_BASE || DEFAULT_API_BASE

  function isProbablyUnavailable(err) {
    return !err || err.name === 'TypeError' || err.name === 'AbortError' || /fetch|network|failed|aborted/i.test(String(err.message || err))
  }

  async function submitLead(payload) {
    if (!API_BASE) return { ok: false, skipped: true }

    try {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 2500)
      const res = await fetch(API_BASE.replace(/\/$/, '') + '/v1/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      })
      window.clearTimeout(timeout)
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.ok === false) {
        const err = new Error(body.error || 'Lead API rejected the submission')
        err.response = body
        err.status = res.status
        throw err
      }
      return { ok: true, response: body }
    } catch (err) {
      if (isProbablyUnavailable(err)) {
        return { ok: false, fallback: true, error: err }
      }
      throw err
    }
  }

  window.lifelongpepLeadApi = {
    apiBase: API_BASE,
    submitLead
  }
})()
