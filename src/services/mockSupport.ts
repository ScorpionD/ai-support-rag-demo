import { knowledgeBase } from '../data/knowledgeBase.ts'
import type { HandoffInput, Message, SupportAnswer, SupportService } from '../types.ts'

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const contains = (text: string, keyword: string) => ` ${text} `.includes(` ${normalize(keyword)} `)
const humanRequest = /\b(human|agent|person|representative|speak to|talk to|contact support)\b/i
const unsupportedDetail =
  /\b(digital|subscription|membership|customized|personalized|perishable|used|opened|restocking|free return|return label|shipping cost|delivery cost|price|how much|vat|tax|customs|stock|inventory)\b/i
const privateAction =
  /\b(my order|order #|order number|cancel my|refund me|change my|update my|track my|delete my)\b/i
const instructionAttack =
  /\b(ignore|override|disregard|pretend|system prompt|developer message|make up|invent|reveal|password|api key)\b/i

function result(
  text: string,
  status: SupportAnswer['status'],
  sources: SupportAnswer['sources'] = [],
): SupportAnswer {
  return { id: crypto.randomUUID(), text, status, sources, mode: 'mock' }
}

export function qualifyQuestion(question: string, history: Message[] = []): SupportAnswer {
  const clean = question.trim()
  if (!clean || clean.length > 800)
    throw new Error('Please enter a question between 1 and 800 characters.')
  if (instructionAttack.test(clean))
    return result(
      'I can only share the published Northline demo policies. I cannot change a policy, invent details or disclose private information. A human can review a request outside this knowledge base.',
      'not-covered',
    )
  if (humanRequest.test(clean))
    return result(
      'You can prepare a handoff with your question and contact details. In this demo, it stays in this tab and is not sent to a real support team.',
      'needs-human',
    )
  const normalized = normalize(clean)
  if (/^(tell me more|more details|can you explain|please explain|and more)$/.test(normalized)) {
    const previous = [...history].reverse().find((m) => m.answer?.sources.length)?.answer
    if (previous)
      return result(
        'Here is the full policy from the previous answer. The demo knowledge base has no additional details.\n\n' +
          previous.sources.map((s) => s.content).join('\n\n'),
        previous.status,
        previous.sources,
      )
  }
  const ranked = knowledgeBase
    .map((article) => ({
      article,
      score: article.keywords.reduce(
        (sum, keyword) =>
          sum + (contains(normalized, keyword) ? (keyword.includes(' ') ? 3 : 1) : 0),
        0,
      ),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
  if (!ranked.length)
    return result(
      'I couldn’t find a published policy that answers this question. I don’t want to guess. You can browse the 10 demo articles or prepare a handoff for a human to review.',
      'not-covered',
    )
  // Cancellation after payment is about cancellation, not a request for payment methods.
  let selected = ranked
    .filter((r) => !(ranked.some((x) => x.article.id === 'NL-04') && r.article.id === 'NL-09'))
    .slice(0, 2)
    .map((r) => r.article)
  if (selected.some((s) => s.id === 'NL-08')) selected = selected.filter((s) => s.id !== 'NL-03')
  const uncertain =
    unsupportedDetail.test(clean) ||
    privateAction.test(clean) ||
    selected.some((s) => ['NL-06', 'NL-10'].includes(s.id))
  const prefix = uncertain
    ? 'I found related policies below, but I can’t confirm your specific request from this knowledge base. A human needs to review it.'
    : 'Here’s what the Northline demo knowledge base says:'
  return result(
    prefix + '\n\n' + selected.map((s) => s.content).join('\n\n'),
    uncertain ? 'needs-human' : 'grounded',
    selected,
  )
}

export function validateHandoff(input: HandoffInput): string | null {
  if (input.name.trim().length < 2 || input.name.trim().length > 80)
    return 'Enter a name between 2 and 80 characters.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 254)
    return 'Enter a valid email address.'
  if (input.company.length > 120) return 'Keep the company name under 120 characters.'
  if (input.message.trim().length < 10 || input.message.length > 1000)
    return 'Describe the request in 10–1,000 characters.'
  if (!input.consent) return 'Confirm that you are using fictional test details.'
  return null
}

export const mockSupportService: SupportService = {
  async ask(request, options = {}) {
    const signal = options.signal
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
      const abort = () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort)
        resolve()
      }, 700)
      signal?.addEventListener('abort', abort, { once: true })
    })
    if (options.simulateFailure)
      throw new Error(
        'The demo service is temporarily unavailable. Your question is still here. Try again or prepare a human handoff.',
      )
    return qualifyQuestion(request.question, request.history)
  },
  createHandoff(input) {
    const error = validateHandoff(input)
    if (error) throw new Error(error)
    return {
      ...input,
      name: input.name.trim(),
      email: input.email.trim(),
      id: `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      delivery: 'not-sent',
    }
  },
}
