// Opt-in integration check. Creates one synthetic session and deletes only that session.
import assert from 'node:assert/strict'
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)
  throw new Error('Set private Supabase server environment variables.')
async function db(path, method = 'GET', value) {
  const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/' + path, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SECRET_KEY,
      Authorization: 'Bearer ' + process.env.SUPABASE_SECRET_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  })
  if (!r.ok) throw new Error('Database check failed: ' + r.status)
  const text = await r.text()
  return text ? JSON.parse(text) : null
}
const rpc = (name, data) => db('rpc/' + name, 'POST', data)
const session = (await db('chat_sessions', 'POST', { token_hash: crypto.randomUUID() }))[0]
try {
  const args = {
    p_session: session.id,
    p_key: 'verification-race',
    p_question: 'Synthetic concurrency verification',
  }
  const claims = await Promise.all([rpc('claim_turn', args), rpc('claim_turn', args)])
  assert.equal(claims.filter((c) => c.mine).length, 1)
  const owner = claims.find((c) => c.mine)
  const fallback = {
    id: crypto.randomUUID(),
    mode: 'live',
    text: 'Test fallback only',
    status: 'needs-human',
    sources: [],
    reason: 'llm-unavailable-or-unverified',
    provider: 'sources-only',
  }
  assert.equal(
    await rpc('complete_turn', { p_id: owner.id, p_lease: owner.lease, p_answer: fallback }),
    true,
  )
  const replay = await rpc('claim_turn', args)
  assert.equal(replay.mine, false)
  assert.equal(replay.state, 'complete')
  await db('chat_turns?id=eq.' + owner.id, 'PATCH', { lease_until: '2020-01-01T00:00:00Z' })
  const retry = await rpc('claim_turn', args)
  assert.equal(retry.mine, true)
  assert.notEqual(retry.lease, owner.lease)
  assert.equal(
    await rpc('complete_turn', { p_id: owner.id, p_lease: owner.lease, p_answer: fallback }),
    false,
  )
  const recovered = {
    ...fallback,
    text: 'Test recovered source',
    reason: undefined,
    status: 'grounded',
    provider: 'openrouter',
  }
  assert.equal(
    await rpc('complete_turn', { p_id: retry.id, p_lease: retry.lease, p_answer: recovered }),
    true,
  )
  const messages = await db('chat_messages?session_id=eq.' + session.id + '&select=role,text')
  assert.equal(messages.length, 2)
  assert.equal(messages.find((m) => m.role === 'assistant').text, 'Test recovered source')
  console.log(
    'PASS: atomic concurrent claim, idempotent replay, stale lease fencing, temporary fallback recovery, two canonical messages.',
  )
} finally {
  await db('chat_sessions?id=eq.' + session.id, 'DELETE')
}
