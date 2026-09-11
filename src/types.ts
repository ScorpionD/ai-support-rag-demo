export interface Article {
  id: string
  title: string
  category: string
  question: string
  content: string
  keywords: string[]
  updated: string
}
export type AnswerStatus = 'grounded' | 'needs-human' | 'not-covered'
export interface SupportAnswer {
  id: string
  text: string
  status: AnswerStatus
  sources: Article[]
  mode: 'mock'
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
  delivery: 'not-sent'
}
export interface SupportService {
  ask: (request: SupportRequest, options?: RequestOptions) => Promise<SupportAnswer>
  createHandoff: (input: HandoffInput) => HandoffDraft
}
