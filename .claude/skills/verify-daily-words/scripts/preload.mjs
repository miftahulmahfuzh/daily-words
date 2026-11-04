// Loaded into every Node process a verify run starts (NODE_OPTIONS=--import <this file>): the
// `next dev` server and its workers, drizzle-kit, the seeder. Inert unless DW_VERIFY_STANDIN is
// set, which only verify.sh does.
//
// Two jobs:
//
// 1. The paid-call budget. A fetch to a host in DW_VERIFY_PAID_HOSTS (z.ai -> pool `llm`, the
//    embeddings provider -> pool `embed`) first takes one call from the stand-in's counter. When
//    the pool is empty, or the run is still seeding, the fetch rejects as a network error, which is
//    how the app sees a vendor outage (lib/llm turns it into its own failure state).
//
// 2. Egress control. Every other host that is not loopback and not in DW_VERIFY_ALLOW_HOSTS is
//    refused and logged ("dw-verify: egress BLOCKED"). Node's fetch ignores HTTP(S)_PROXY, so
//    globalThis.fetch is wrapped (Next wraps it later; this stays underneath). node:http and
//    node:https are wrapped too, because web-push posts with https.request: a push to anything but
//    the run's own loopback sink throws before a socket opens. Best effort: a native addon or a
//    raw net.connect is not covered (postgres-js uses net, and only ever to the run's database).
import http from 'node:http'
import https from 'node:https'

const standin = process.env.DW_VERIFY_STANDIN
if (standin) {
  const list = (v) =>
    (v ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean)
  const allow = new Set(list(process.env.DW_VERIFY_ALLOW_HOSTS))
  const paid = new Map(list(process.env.DW_VERIFY_PAID_HOSTS).map((e) => e.split('=')))
  const loopback = (h) =>
    h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]' || h === '0.0.0.0'
  const real = globalThis.fetch

  globalThis.fetch = async function verifyFetch(input, init) {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url
    let url
    try {
      url = new URL(href)
    } catch {
      return real(input, init)
    }
    const method = init?.method || (typeof input === 'object' && input?.method) || 'GET'
    if (
      url.protocol === 'data:' ||
      url.protocol === 'blob:' ||
      loopback(url.hostname) ||
      allow.has(url.hostname)
    )
      return real(input, init)
    const pool = paid.get(url.hostname)
    if (pool) {
      const res = await real(
        `${standin}/budget/take?pool=${pool}&what=${encodeURIComponent(method + ' ' + url.pathname)}`,
        { method: 'POST' },
      )
      if (res.ok) return real(input, init)
      const why = (await res.json().catch(() => ({}))).why ?? res.status
      console.error(`dw-verify: paid call REFUSED ${method} ${url.origin}${url.pathname}: ${why}`)
      throw new TypeError(`dw-verify: paid call refused (${why})`)
    }
    console.error(`dw-verify: egress BLOCKED ${method} ${url.origin}${url.pathname}`)
    throw new TypeError(`dw-verify: egress to ${url.host} is blocked in a verify run`)
  }

  // request(url[, options][, cb]) | request(options[, cb]): find the host either way.
  const hostOf = (a, b) => {
    if (typeof a === 'string' || a instanceof URL) {
      try {
        return new URL(a).hostname
      } catch {
        return ''
      }
    }
    const o = a ?? b ?? {}
    return String(o.hostname ?? o.host ?? 'localhost').replace(/:\d+$/, '')
  }
  for (const [name, mod] of [
    ['http', http],
    ['https', https],
  ]) {
    for (const fn of ['request', 'get']) {
      const orig = mod[fn]
      mod[fn] = function guarded(a, b, c) {
        const host = hostOf(a, b)
        if (loopback(host) || allow.has(host)) return orig.call(this, a, b, c)
        console.error(`dw-verify: egress BLOCKED ${name}.${fn} ${host}`)
        throw new Error(`dw-verify: egress to ${host} is blocked in a verify run`)
      }
    }
  }
}
