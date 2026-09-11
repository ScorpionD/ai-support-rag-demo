import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/index.mjs'
const source = {
  id: 'chunk',
  document_id: 'POLICY',
  title: 'Returns',
  url: 'https://demo.example/api/sources/POLICY',
  category: 'Orders',
  question: 'Returns?',
  content: 'Returns are accepted within 30 days. Items must be unused.',
  updated_at: '2026-09-11',
  similarity: 0.8,
}
async function scenario(modelResponse, modelStatus = 200) {
  const original = globalThis.fetch
  let savedAnswer
  let llmCalls = 0
  const cookies = []
  const budgets = []
  globalThis.fetch = async (input, options) => {
    const url = String(input)
    if (url.startsWith('https://openrouter.ai/')) {
      llmCalls++
      const payload = JSON.parse(options.body)
      assert.equal(payload.provider.max_price.prompt, 0)
      assert.ok(payload.model.endsWith(':free'))
      return Response.json(modelResponse, { status: modelStatus })
    }
    const path = url.split('/rest/v1/')[1]
    let value
    if (path.startsWith('chat_sessions')) value = [{ id: 'session' }]
    else if (path.startsWith('knowledge_documents')) value = [{ id: 'POLICY', revision: '1' }]
    else if (path === 'rpc/consume_budget') {
      budgets.push(JSON.parse(options.body))
      value = true
    } else if (path === 'rpc/claim_turn')
      value = { id: 'turn', mine: true, lease: 'lease', state: 'processing' }
    else if (path === 'rpc/match_chunks') value = [source]
    else if (path === 'rpc/complete_turn') {
      savedAnswer = JSON.parse(options.body).p_answer
      value = true
    } else if (path.startsWith('chat_messages'))
      value = savedAnswer
        ? [
            { id: 'u', role: 'user', text: 'What is the return policy?' },
            { id: 'a', role: 'assistant', text: savedAnswer.text, answer: savedAnswer },
          ]
        : []
    else throw new Error('Unexpected database operation: ' + path)
    return Response.json(value)
  }
  const env = {
    SUPABASE_URL: 'https://db.example',
    SUPABASE_SECRET_KEY: 'private-test',
    SESSION_PEPPER: 'pepper',
    PUBLIC_ORIGIN: 'https://demo.example',
    OPENROUTER_MODEL: 'test/model:free',
    LLM_ENABLED: 'true',
    OPENROUTER_API_KEY: 'private-test',
    RAG_RATE: { limit: async () => ({ success: true }) },
    AI: { run: async () => ({ data: [Array(384).fill(0.01)] }) },
  }
  try {
    const request = new Request('https://demo.example/api/messages', {
      method: 'POST',
      headers: {
        Origin: env.PUBLIC_ORIGIN,
        'Content-Type': 'application/json',
        Cookie: '__Host-rag-session=' + 'a'.repeat(64),
      },
      body: JSON.stringify({ question: 'What is the return policy?' }),
    })
    const response = await worker.fetch(request, env, {})
    return {
      http: response.status,
      value: await response.json(),
      savedAnswer,
      llmCalls,
      cookies,
      budgets,
    }
  } finally {
    globalThis.fetch = original
  }
}
test('complete backend flow persists verified LLM citations and canonical history', async () => {
  const r = await scenario({
    model: 'test/model:free',
    choices: [
      { message: { content: JSON.stringify({ status: 'grounded', sentence_ids: ['S1', 'S2'] }) } },
    ],
  })
  assert.equal(r.http, 200)
  assert.equal(r.value.status, 'grounded')
  assert.equal(r.value.provider, 'openrouter')
  assert.equal(r.savedAnswer.text, source.content)
  assert.equal(r.value.messages.length, 2)
  assert.equal(r.llmCalls, 1)
})
test('provider outage still persists an honest sources-only answer', async () => {
  const r = await scenario({ error: 'Unavailable' }, 503)
  assert.equal(r.http, 200)
  assert.equal(r.value.status, 'needs-human')
  assert.equal(r.value.provider, 'sources-only')
  assert.equal(r.savedAnswer.handoffRecommended, true)
  assert.equal(r.value.sources[0].id, 'POLICY')
})
test('fabricated policy and citation IDs are rejected and never stored as answers', async () => {
  const r = await scenario({
    choices: [
      { message: { content: JSON.stringify({ status: 'grounded', sentence_ids: ['forged'] }) } },
    ],
  })
  assert.equal(r.value.status, 'needs-human')
  assert.equal(r.value.provider, 'sources-only')
  assert.ok(!r.savedAnswer.text.includes('Unlimited refunds'))
})
test('malformed model output preserves fallback and source references', async () => {
  const r = await scenario({ choices: [{ message: { content: 'This is not valid JSON' } }] })
  assert.equal(r.value.status, 'needs-human')
  assert.equal(r.value.sources[0].id, 'POLICY')
  assert.equal(r.value.messages.length, 2)
})
