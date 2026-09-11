import type { Article, Message, SupportAnswer, SupportService } from '../types.ts'
async function api(path: string, data?: unknown, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(35000)
  const response = await fetch('/api/' + path, {
    method: data === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('The support service is temporarily unavailable. Please retry.')
  const value = await response.json()
  if (!response.ok)
    throw new Error(typeof value.error === 'string' ? value.error : 'Request failed. Please retry.')
  return value
}
function validAnswer(value: SupportAnswer) {
  return (
    value &&
    typeof value.id === 'string' &&
    typeof value.text === 'string' &&
    ['grounded', 'needs-human', 'not-covered'].includes(value.status) &&
    Array.isArray(value.sources)
  )
}
function validMessages(value: Message[]): value is Message[] {
  return (
    Array.isArray(value) &&
    value.length <= 40 &&
    value.every(
      (m) =>
        typeof m.id === 'string' &&
        typeof m.text === 'string' &&
        ['user', 'assistant'].includes(m.role) &&
        (!m.answer || validAnswer(m.answer)),
    )
  )
}
export const liveSupportService: SupportService = {
  async initialize(reset = false) {
    const [session, documents] = await Promise.all([api('session', { reset }), api('knowledge')])
    if (!validMessages(session.messages) || !Array.isArray(documents))
      throw new Error('The server returned an invalid session. Please reload.')
    const articles: Article[] = documents.map((doc) => ({
      ...doc,
      keywords: [],
      updated: new Date(doc.updated_at).toLocaleDateString('en-US'),
    }))
    return { messages: session.messages, articles }
  },
  async ask(request, options = {}) {
    const value = await api('messages', { question: request.question }, options.signal)
    if (!validAnswer(value) || !validMessages(value.messages))
      throw new Error('The answer could not be verified. Please retry or ask for human review.')
    return value
  },
  async createHandoff(input) {
    const value = await api('handoffs', input)
    if (
      typeof value.id !== 'string' ||
      !['delivered', 'pending', 'review'].includes(value.delivery)
    )
      throw new Error(
        'Delivery is unconfirmed. Retry the same details to check; duplicates are prevented.',
      )
    return value
  },
}
