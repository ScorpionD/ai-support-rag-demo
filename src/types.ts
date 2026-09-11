export interface Article {
  id: string
  title: string
  category: string
  question: string
  content: string
  keywords: string[]
  updated: string
  url?: string
  chunkId?: string
}
export type AnswerStatus = 'grounded' | 'needs-human' | 'not-covered'
export interface SupportAnswer {
  id: string
  text: string
  status: AnswerStatus
  sources: Article[]
  mode: 'mock' | 'live'
  provider?: string
  processingMs?: number
  handoffRecommended?: boolean
  messages?: Message[]
  cached?: boolean
}
export interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  answer?: SupportAnswer
}
export interface SupportRequest {
  question: string
  history: Message[]
}
export interface RequestOptions {
  signal?: AbortSignal
  simulateFailure?: boolean
}
export interface HandoffInput {
  name: string
  email: string
  company: string
  message: string
  consent: boolean
  isLead: boolean
}
export interface HandoffDraft extends HandoffInput {
  id: string
  delivery: 'not-sent' | 'delivered' | 'pending' | 'review'
}
export interface SupportService {
  ask: (request: SupportRequest, options?: RequestOptions) => Promise<SupportAnswer>
  createHandoff: (input: HandoffInput) => HandoffDraft | Promise<HandoffDraft>
  initialize?: (reset?: boolean) => Promise<{ messages: Message[]; articles: Article[] }>
}
