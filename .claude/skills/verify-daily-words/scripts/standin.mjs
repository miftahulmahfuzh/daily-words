// node standin.mjs <run-dir> <http-port> <push-port> <llm-budget> <embed-budget>
//
// The loopback half of a verify run. Two listeners, both on 127.0.0.1:
//
//   http  GET  /health              liveness, for verify.sh doctor
//         GET  /budget              the paid-call counters
//         POST /budget/arm          seeding is over: paid calls may now spend the budget
//         POST /budget/take?pool=   one paid call (pool llm = z.ai, pool embed = OpenAI embeddings);
//                                   200 while the pool has calls left and the run is armed, 402 otherwise
//         POST /push/new[?gone=1]   mint a push "device": an ECDH P-256 pair and an auth secret, kept
//                                   in <run>/push/<id>.json; answers the subscription JSON a browser's
//                                   PushManager would hand the app (endpoint on the https listener)
//         GET  /push/inbox          every notification the sink received, decrypted
//
//   https POST /push/<id>           the push service. web-push posts here (RFC 8030) with the payload
//                                   encrypted to the device (RFC 8291, aes128gcm) and signed with the
//                                   run's VAPID key (RFC 8292). The sink checks the VAPID `k=` against
//                                   the run's public key, decrypts with the device's private key, and
//                                   appends the plaintext to <run>/push/inbox.jsonl. A device minted
//                                   with gone=1 answers 410, the way iOS answers a revoked endpoint.
//
// Why: lib/push/send.ts posts with node:https, and a real subscription endpoint is a real phone.
// Here the only endpoints that can exist are this sink's, so the hourly tick can be driven end to
// end and what it sent read back, without anything leaving the machine. The certificate is minted
// per run and trusted by the app through NODE_EXTRA_CA_CERTS; nothing else trusts it.
import { createServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import {
  createDecipheriv,
  createECDH,
  createHmac,
  randomBytes,
} from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [runDir, httpPortArg, pushPortArg, llmArg, embedArg] = process.argv.slice(2)
if (!runDir || !httpPortArg || !pushPortArg) {
  console.error('usage: node standin.mjs <run-dir> <http-port> <push-port> <llm> <embed>')
  process.exit(2)
}
const pushDir = path.join(runDir, 'push')
mkdirSync(pushDir, { recursive: true })
const inboxFile = path.join(pushDir, 'inbox.jsonl')
const stateFile = path.join(runDir, 'budget.json')
const vapidPublic = (readFileSync(path.join(runDir, 'secrets/vapid.env'), 'utf8').match(
  /^VAPID_PUBLIC_KEY=(.+)$/m,
) ?? [])[1]

/* ── budget ──────────────────────────────────────────────────────────────────────────────── */

const state = {
  armed: false,
  pools: {
    llm: { left: Number(llmArg ?? 0), spent: 0, refused: 0, calls: [] },
    embed: { left: Number(embedArg ?? 0), spent: 0, refused: 0, calls: [] },
  },
}
const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 1))
save()

function take(pool, what) {
  const p = state.pools[pool]
  if (!p) return { ok: false, why: `unknown pool ${pool}` }
  if (!state.armed) {
    p.refused++
    save()
    return { ok: false, why: 'seeding: paid calls are refused until the run is armed' }
  }
  if (p.left <= 0) {
    p.refused++
    save()
    return { ok: false, why: `${pool} budget spent (${p.spent} used)` }
  }
  p.left--
  p.spent++
  p.calls.push({ at: new Date().toISOString(), what })
  save()
  console.log(`paid ${pool} ${what} (left ${p.left})`)
  return { ok: true }
}

/* ── push devices ────────────────────────────────────────────────────────────────────────── */

const b64u = (buf) => Buffer.from(buf).toString('base64url')
const unb64u = (s) => Buffer.from(s, 'base64url')
const hmac = (key, data) => createHmac('sha256', key).update(data).digest()

function newDevice(gone) {
  const id = `${gone ? 'gone-' : ''}${randomBytes(9).toString('base64url')}`
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const device = {
    id,
    gone,
    privateKey: b64u(ecdh.getPrivateKey()),
    p256dh: b64u(ecdh.getPublicKey()),
    auth: b64u(randomBytes(16)),
  }
  writeFileSync(path.join(pushDir, `${id}.json`), JSON.stringify(device))
  return device
}

// RFC 8291 §3.4 + RFC 8188: one aes128gcm record, keyid = the sender's ephemeral public key.
function decrypt(device, body) {
  const salt = body.subarray(0, 16)
  const idlen = body[20]
  const asPublic = body.subarray(21, 21 + idlen)
  const ciphertext = body.subarray(21 + idlen)
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(unb64u(device.privateKey))
  const uaPublic = ecdh.getPublicKey()
  const shared = ecdh.computeSecret(asPublic)
  const prkKey = hmac(unb64u(device.auth), shared)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])])
  const ikm = hmac(prkKey, keyInfo)
  const prk = hmac(salt, ikm)
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16)
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12)
  const d = createDecipheriv('aes-128-gcm', cek, nonce)
  d.setAuthTag(ciphertext.subarray(ciphertext.length - 16))
  let plain = Buffer.concat([d.update(ciphertext.subarray(0, ciphertext.length - 16)), d.final()])
  let end = plain.length
  while (end > 0 && plain[end - 1] === 0) end--
  if (plain[end - 1] !== 2) throw new Error('no last-record delimiter')
  plain = plain.subarray(0, end - 1)
  return plain.toString('utf8')
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

/* ── http listener ───────────────────────────────────────────────────────────────────────── */

const pushPort = Number(pushPortArg)
const http = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  try {
    if (req.method === 'GET' && url.pathname === '/health')
      return json(res, 200, { ok: true, name: 'daily-words-verify-standin' })
    if (req.method === 'GET' && url.pathname === '/budget') return json(res, 200, state)
    if (req.method === 'POST' && url.pathname === '/budget/arm') {
      state.armed = true
      save()
      console.log('budget armed')
      return json(res, 200, state)
    }
    if (req.method === 'POST' && url.pathname === '/budget/take') {
      const r = take(url.searchParams.get('pool'), url.searchParams.get('what') ?? '')
      if (!r.ok)
        console.log(`paid ${url.searchParams.get('pool')} REFUSED ${url.searchParams.get('what') ?? ''}: ${r.why}`)
      return json(res, r.ok ? 200 : 402, r)
    }
    if (req.method === 'POST' && url.pathname === '/push/new') {
      const d = newDevice(url.searchParams.get('gone') === '1')
      console.log(`push device ${d.id}${d.gone ? ' (answers 410)' : ''}`)
      return json(res, 200, {
        endpoint: `https://127.0.0.1:${pushPort}/push/${d.id}`,
        keys: { p256dh: d.p256dh, auth: d.auth },
      })
    }
    if (req.method === 'GET' && url.pathname === '/push/inbox') {
      const lines = existsSync(inboxFile)
        ? readFileSync(inboxFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
        : []
      return json(res, 200, lines)
    }
    json(res, 404, { error: 'not found' })
  } catch (err) {
    console.error(err)
    json(res, 500, { error: String(err?.message ?? err) })
  }
})
http.listen(Number(httpPortArg), '127.0.0.1', () => console.log(`standin http :${httpPortArg}`))

/* ── https listener: the push service ────────────────────────────────────────────────────── */

const https = createHttpsServer(
  {
    key: readFileSync(path.join(runDir, 'secrets/push-key.pem')),
    cert: readFileSync(path.join(runDir, 'secrets/push-cert.pem')),
  },
  async (req, res) => {
    const m = /^\/push\/([A-Za-z0-9_-]+)$/.exec(new URL(req.url, 'https://127.0.0.1').pathname)
    const body = await readBody(req)
    const file = m && path.join(pushDir, `${m[1]}.json`)
    if (req.method !== 'POST' || !file || !existsSync(file)) {
      console.log(`push 404 ${req.method} ${req.url}`)
      res.writeHead(404).end()
      return
    }
    const device = JSON.parse(readFileSync(file, 'utf8'))
    const entry = {
      at: new Date().toISOString(),
      device: device.id,
      ttl: req.headers.ttl ?? null,
      urgency: req.headers.urgency ?? null,
      topic: req.headers.topic ?? null,
      encoding: req.headers['content-encoding'] ?? null,
      bytes: body.length,
    }
    const k = /k=([A-Za-z0-9_-]+)/.exec(req.headers.authorization ?? '')?.[1]
    entry.vapid = k === vapidPublic ? 'run key' : `MISMATCH (${k ?? 'none'})`
    if (device.gone) {
      entry.answered = 410
      appendFileSync(inboxFile, JSON.stringify(entry) + '\n')
      console.log(`push 410 ${device.id}`)
      res.writeHead(410).end()
      return
    }
    try {
      const text = decrypt(device, body)
      try {
        entry.payload = JSON.parse(text)
      } catch {
        entry.payload = text
      }
      entry.answered = 201
    } catch (err) {
      entry.error = `decrypt failed: ${err.message}`
      entry.answered = 400
    }
    appendFileSync(inboxFile, JSON.stringify(entry) + '\n')
    console.log(`push ${entry.answered} ${device.id} ${JSON.stringify(entry.payload ?? entry.error)}`)
    res.writeHead(entry.answered).end()
  },
)
https.listen(pushPort, '127.0.0.1', () => console.log(`standin push https :${pushPort}`))
