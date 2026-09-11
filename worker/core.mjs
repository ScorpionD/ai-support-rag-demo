export const EMBEDDING_MODEL = '@cf/baai/bge-small-en-v1.5'
export const normalize = (value) =>
  value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
export function validateQuestion(value) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > 800 ||
    /[\u0000-\u0008]/.test(value)
  )
    throw new Error('Enter a question between 1 and 800 characters.')
  return value.trim()
}
export function validateContact(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid contact request.')
  const data = Object.fromEntries(
    ['name', 'email', 'company', 'message'].map((key) => [
      key,
      typeof value[key] === 'string' ? value[key].trim() : '',
    ]),
  )
  if (data.name.length < 2 || data.name.length > 80)
    throw new Error('Enter a name between 2 and 80 characters.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.email.length > 254)
    throw new Error('Enter a valid email address.')
  if (data.company.length > 120 || data.message.length < 10 || data.message.length > 1000)
    throw new Error('Describe the request in 10–1,000 characters.')
  if (value.consent !== true)
    throw new Error('Confirm consent to store and send your test request.')
  return { ...data, email: data.email.toLowerCase(), consent: true, isLead: value.isLead === true }
}
export function chunkText(text, max = 1000, overlap = 140) {
  if (typeof text !== 'string' || !text.trim() || text.length > 40000)
    throw new Error('Document must contain 1–40,000 characters.')
  const clean = text.replace(/\r\n/g, '\n').trim(),
    chunks = []
  let start = 0
  while (start < clean.length) {
    let end = Math.min(start + max, clean.length)
    if (end < clean.length) {
      const boundary = Math.max(clean.lastIndexOf('. ', end), clean.lastIndexOf('\n', end))
      if (boundary > start + max / 2) end = boundary + 1
    }
    chunks.push(clean.slice(start, end).trim())
    if (end === clean.length) break
    let next = Math.max(end - overlap, start + 1)
    while (next < end && !/\s/.test(clean[next - 1])) next++
    start = next
  }
  return chunks
}
export function validateDocument(doc, origin) {
  if (
    !doc ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(doc.id) ||
    typeof doc.title !== 'string' ||
    !doc.title.trim() ||
    doc.title.length > 160
  )
    throw new Error('A valid document id and title are required.')
  chunkText(doc.content)
  const url = doc.url ? new URL(doc.url, origin) : new URL('/api/sources/' + doc.id, origin)
  if (url.protocol !== 'https:') throw new Error('Source URLs must use HTTPS.')
  return {
    id: doc.id,
    title: doc.title.trim(),
    url: url.href,
    content: doc.content.trim(),
    category: String(doc.category || 'Knowledge').slice(0, 80),
    question: String(doc.question || '').slice(0, 800),
  }
}
export function sourceFromChunk(c) {
  return {
    id: c.document_id,
    chunkId: c.id,
    title: c.title,
    url: c.url,
    category: c.category,
    question: c.question,
    content: c.content,
    keywords: [],
    updated: c.updated_at,
  }
}
export function retrievalDecision(question, chunks, threshold = 0.66) {
  if (
    /\b(ignore|override|system prompt|developer message|invent|api key|password)\b/i.test(question)
  )
    return 'not-covered'
  if (
    /\b(human|representative|talk to|speak to|my order|cancel my|track my|refund me)\b/i.test(
      question,
    )
  )
    return 'needs-human'
  if (!chunks.length || chunks[0].similarity < 0.5) return 'not-covered'
  if (chunks[0].similarity < threshold) return 'needs-human'
  return 'grounded'
}
// An LLM cannot add free-form claims. Only exact, complete source sentences are accepted.
export function verifyExtraction(raw, chunks) {
  const value =
    typeof raw === 'string' ? JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')) : raw
  if (
    value.status !== 'grounded' ||
    !Array.isArray(value.quotes) ||
    !value.quotes.length ||
    value.quotes.length > 20
  )
    throw new Error('Model requested review or returned invalid JSON.')
  const seen = new Set(),
    used = [],
    texts = []
  for (const item of value.quotes) {
    const source = chunks.find((c) => c.id === item.chunk_id),
      quote = item.quote
    if (!source || typeof quote !== 'string' || quote.length < 3 || quote.length > 1400)
      throw new Error('Invalid citation.')
    const pos = source.content.indexOf(quote)
    if (
      pos < 0 ||
      (pos > 0 && !/[.!?\n]\s*$/.test(source.content.slice(0, pos))) ||
      (pos + quote.length < source.content.length && !/[.!?]$/.test(quote))
    )
      throw new Error('Citation does not match complete source sentences.')
    if (!seen.has(quote)) {
      texts.push(quote)
      seen.add(quote)
    }
    if (!used.some((c) => c.id === source.id)) used.push(source)
  }
  return { text: texts.join('\n\n'), sources: used.map(sourceFromChunk) }
}
export function sourceSentences(chunks) {
  let n = 0
  return chunks.flatMap((chunk) =>
    (chunk.content.match(/[\s\S]+?(?:[.!?](?=\s|$)|$)/g) || [])
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ id: 'S' + ++n, chunk_id: chunk.id, title: chunk.title, text })),
  )
}
export function verifySelection(raw, chunks) {
  const value =
    typeof raw === 'string' ? JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')) : raw
  const available = sourceSentences(chunks)
  if (
    value.status !== 'grounded' ||
    !Array.isArray(value.sentence_ids) ||
    !value.sentence_ids.length ||
    value.sentence_ids.length > 20
  )
    throw new Error('Model requested review or returned an invalid selection.')
  const selected = [...new Set(value.sentence_ids)].map((id) => available.find((s) => s.id === id))
  if (selected.some((s) => !s)) throw new Error('Unknown source sentence.')
  // Order by the source, never by a model-invented narrative; group adjacent sentences.
  const ordered = available.filter((s) => selected.includes(s))
  const groups = []
  for (const sentence of ordered) {
    const last = groups.at(-1)
    if (
      last?.chunk_id === sentence.chunk_id &&
      chunks.find((c) => c.id === last.chunk_id).content.includes(last.quote + ' ' + sentence.text)
    )
      last.quote += ' ' + sentence.text
    else groups.push({ chunk_id: sentence.chunk_id, quote: sentence.text })
  }
  return verifyExtraction({ status: 'grounded', quotes: groups }, chunks)
}
export function fallbackAnswer(status, chunks, reason = 'retrieval') {
  return {
    id: crypto.randomUUID(),
    mode: 'live',
    status,
    sources: chunks.slice(0, 2).map(sourceFromChunk),
    handoffRecommended: true,
    provider: 'sources-only',
    reason,
    text:
      status === 'not-covered'
        ? 'I couldn’t find a reliable answer in the company knowledge base. I won’t guess. You can ask a human to review this question.'
        : 'I found related sources, but I can’t confidently answer this question right now. Please check the sources below or ask for a human review.',
  }
}
