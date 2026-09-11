import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  FileText,
  Headphones,
  Layers,
  LoaderCircle,
  LockKeyhole,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { knowledgeBase, sampleQuestions } from './data/knowledgeBase'
import { supportService, isLive } from './services/supportService'
import type { Article, HandoffDraft, HandoffInput, Message } from './types'
import Modal from './components/Modal'

const workflow = [
  [MessageSquare, 'Customer Question', 'A question, in their words.'],
  [Search, 'Knowledge Search', 'Find relevant company FAQs.'],
  [Layers, 'RAG Context', 'Keep the source in view.'],
  [Sparkles, 'LLM Answer', 'Check the answer against sources.'],
  [BookOpen, 'Source Citation', 'Open and verify the policy.'],
  [Headphones, 'Human Handoff', 'Let a person review the request.'],
] as const
const features = [
  [BookOpen, 'Knowledge-grounded answers', 'Responses use the company’s published demo FAQs.'],
  [FileText, 'Source citations', 'Every matched policy opens as a readable source.'],
  [ShieldCheck, 'Hallucination protection', 'Unknown questions get an honest “not covered.”'],
  [MessageSquare, 'Conversation history', 'Keep the context in a clear, ongoing conversation.'],
  [Headphones, 'Human handoff', 'Prepare an escalation with the customer’s question.'],
  [Users, 'Lead capture', 'Keep sales enquiries separate from support requests.'],
  [Layers, 'Fallback behavior', 'Helpful recovery when a question or service fails.'],
] as const
const emptyHandoff: HandoffInput = {
  name: '',
  email: '',
  company: '',
  message: '',
  consent: false,
  isLead: false,
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [articles, setArticles] = useState<Article[]>(isLive ? [] : knowledgeBase)
  const [ready, setReady] = useState(!isLive)
  const [handoffBusy, setHandoffBusy] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [failedQuestion, setFailedQuestion] = useState('')
  const [failNext, setFailNext] = useState(false)
  const [source, setSource] = useState<Article | 'all' | null>(null)
  const [handoffOpen, setHandoffOpen] = useState(false)
  const [handoff, setHandoff] = useState<HandoffInput>(emptyHandoff)
  const [handoffError, setHandoffError] = useState('')
  const [draft, setDraft] = useState<HandoffDraft | null>(null)
  const [newAnswer, setNewAnswer] = useState(false)
  const feed = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const controller = useRef<AbortController | null>(null)
  const sending = useRef(false)
  const autoScroll = useRef(true)
  const selectedArticle = source && source !== 'all' ? source : null
  const answers = messages.filter((message) => message.answer)

  useEffect(() => {
    if (autoScroll.current)
      feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' })
    else if (!busy && answers.length) setNewAnswer(true)
  }, [messages, busy, answers.length])
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    let mounted = true
    if (supportService.initialize)
      supportService
        .initialize()
        .then((result) => {
          if (mounted) {
            setMessages(result.messages)
            setArticles(result.articles)
            setReady(true)
          }
        })
        .catch(() => {
          if (mounted) setError('Could not restore your chat. Reload the page to reconnect.')
        })
    return () => {
      mounted = false
    }
  }, [])

  async function ask(question: string, retry = false) {
    const text = question.trim()
    if (sending.current || !ready) return
    if (!text || text.length > 800) {
      setError('Enter a question between 1 and 800 characters.')
      return
    }
    if (messages.length >= 40 && !retry) {
      setError('This demo keeps up to 20 questions. Start a new chat to continue.')
      return
    }
    sending.current = true
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    setError('')
    setFailedQuestion('')
    setInput('')
    autoScroll.current = true
    if (!retry)
      setMessages((previous) => [...previous, { id: crypto.randomUUID(), role: 'user', text }])
    const simulateFailure = failNext
    setFailNext(false)
    try {
      const answer = await supportService.ask(
        { question: text, history: messages },
        { signal: abort.signal, simulateFailure },
      )
      if (!abort.signal.aborted)
        setMessages(
          (previous) =>
            answer.messages || [
              ...previous,
              { id: answer.id, role: 'assistant', text: answer.text, answer },
            ],
        )
    } catch (caught) {
      if (!abort.signal.aborted) {
        setError(
          caught instanceof Error ? caught.message : 'Something went wrong. Please try again.',
        )
        setFailedQuestion(text)
      }
    } finally {
      if (controller.current === abort) {
        setBusy(false)
        sending.current = false
      }
    }
  }
  async function resetChat() {
    controller.current?.abort()
    controller.current = null
    sending.current = false
    setMessages([])
    setBusy(false)
    setError('')
    setInput('')
    setFailedQuestion('')
    setNewAnswer(false)
    setFailNext(false)
    setDraft(null)
    setHandoff(emptyHandoff)
    if (supportService.initialize) {
      setReady(false)
      try {
        const result = await supportService.initialize(true)
        setMessages(result.messages)
        setArticles(result.articles)
        setReady(true)
      } catch {
        setError('Could not start a new session. Reload to reconnect.')
      }
    }
    inputRef.current?.focus()
  }
  function openHandoff(question?: string, isLead = false) {
    setHandoff({
      ...emptyHandoff,
      message: question || [...messages].reverse().find((m) => m.role === 'user')?.text || '',
      isLead,
    })
    setDraft(null)
    setHandoffError('')
    setHandoffOpen(true)
  }
  async function submitHandoff(event: FormEvent) {
    event.preventDefault()
    if (handoffBusy || !ready) return
    setHandoffBusy(true)
    try {
      setDraft(await supportService.createHandoff(handoff))
      setHandoffError('')
    } catch (caught) {
      setHandoffError(caught instanceof Error ? caught.message : 'Please check the form.')
    } finally {
      setHandoffBusy(false)
    }
  }

  return (
    <>
      <a className="skip-link" href="#chat">
        Skip to support chat
      </a>
      <header className="site-header wrap">
        <a className="brand" href="#top">
          <span className="brand-mark">
            <MessageSquare size={22} />
            <Check size={11} />
          </span>
          <span>
            AI Customer
            <br className="mobile-break" /> Support Agent
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#customization">Customization</a>
          <a className="nav-cta" href="#chat">
            Try the demo <ArrowUp size={14} className="diagonal" />
          </a>
        </nav>
      </header>
      <main id="top">
        <section className="hero wrap">
          <div>
            <div className="eyebrow">
              <span className="small-dot" /> KNOWLEDGE FIRST. CUSTOMERS FIRST.
            </div>
            <h1>
              Helpful answers.
              <br />
              <span>Grounded in your business.</span>
            </h1>
            <p className="hero-description">
              AI support assistant that answers from your company knowledge base, cites sources and
              escalates uncertain requests to a human.
            </p>
            <a className="text-link" href="#chat">
              Ask a question. Check the source. <ArrowDown size={17} />
            </a>
          </div>
          <aside className="hero-note">
            <span className="note-icon">
              <BookOpen size={25} />
            </span>
            <p>
              Your knowledge.
              <br />
              <strong>A better first response.</strong>
            </p>
            <div className="note-line" />
            <span>
              <Check size={15} /> Answers you can trace
            </span>
            <span>
              <Check size={15} /> A human when it matters
            </span>
            <div className="note-tag">INTERACTIVE PORTFOLIO DEMO</div>
          </aside>
        </section>

        <section id="chat" className="demo-section wrap" aria-labelledby="demo-heading">
          <div className="section-top">
            <div>
              <span className="eyebrow muted">01 / THE EXPERIENCE</span>
              <h2 id="demo-heading">Meet your first line of support.</h2>
            </div>
            <span className="mode-pill">
              <span className="small-dot" />{' '}
              {isLive ? 'Live RAG · source-verified' : 'Mock RAG mode'}
            </span>
          </div>
          <div className="demo-disclosure">
            <CircleHelp size={17} />
            <p>
              Try Northline, a fictional home & office store. Answers are checked against company
              sources.{' '}
              {isLive ? (
                <>
                  <strong>Live search + OpenRouter AI.</strong> Use fictional details only.
                  Questions go to Cloudflare and OpenRouter; chat is stored for up to 7 days.
                </>
              ) : (
                <strong>Local mock · no messages sent.</strong>
              )}
            </p>
          </div>

          <div className="support-workspace">
            <aside className="knowledge-sidebar">
              <div className="company">
                <span className="company-mark">
                  n<span>.</span>
                </span>
                <div>
                  <strong>Northline</strong>
                  <span>Home & office essentials</span>
                </div>
              </div>
              <div className="sidebar-label">
                <span>COMPANY KNOWLEDGE</span>
                <span>{articles.length}</span>
              </div>
              <div className="article-list">
                {articles.map((article) => (
                  <button key={article.id} onClick={() => setSource(article)}>
                    <FileText size={16} />
                    <span>{article.title}</span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
              <div className="sidebar-note">
                <LockKeyhole size={17} />
                <p>
                  A closed knowledge base.
                  <br />
                  <span>No outside information.</span>
                </p>
              </div>
              <button className="sidebar-human" onClick={() => openHandoff()}>
                <Headphones size={17} /> Talk to a human <ArrowRight size={15} />
              </button>
            </aside>

            <div className="chat-panel">
              <header className="chat-header">
                <div className="assistant-avatar">
                  <Sparkles size={21} />
                  <span />
                </div>
                <div>
                  <h3>Northline support</h3>
                  <span>Knowledge-based demo assistant</span>
                </div>
                <button
                  className="icon-button"
                  onClick={resetChat}
                  title="New chat"
                  aria-label="Start a new chat"
                >
                  <Plus size={20} />
                </button>
              </header>
              <div className="mobile-knowledge">
                <button onClick={() => setSource('all')}>
                  <BookOpen size={15} /> Browse {articles.length} source articles{' '}
                  <ChevronRight size={14} />
                </button>
              </div>
              <div
                ref={feed}
                className="chat-feed"
                role="log"
                aria-label="Conversation history"
                aria-live="polite"
                aria-relevant="additions"
                onScroll={() => {
                  if (feed.current) {
                    autoScroll.current =
                      feed.current.scrollHeight -
                        feed.current.scrollTop -
                        feed.current.clientHeight <
                      80
                    if (autoScroll.current) setNewAnswer(false)
                  }
                }}
              >
                <div className="welcome">
                  <span className="welcome-label">
                    <Sparkles size={15} /> A LITTLE CLARITY GOES A LONG WAY
                  </span>
                  <h3>Hi there. How can I help?</h3>
                  <p>
                    Ask about delivery, returns or shopping with Northline. I’ll show the policy
                    behind my answer. If it isn’t covered, we can prepare a human handoff.
                  </p>
                  <div className="welcome-proof">
                    <BookOpen size={14} /> {articles.length} articles <span>·</span>
                    <ShieldCheck size={14} /> Source-linked answers
                  </div>
                </div>
                {!messages.length && (
                  <div className="starter-questions">
                    <span>NOT SURE WHERE TO START?</span>
                    {sampleQuestions.map((question) => (
                      <button
                        key={question}
                        onClick={() => void ask(question)}
                        disabled={busy || !ready}
                      >
                        {question}
                        <ArrowUp size={16} className="diagonal" />
                      </button>
                    ))}
                  </div>
                )}
                {messages.map((message, index) => (
                  <article key={message.id} className={`message ${message.role}`}>
                    <div className="message-label">
                      {message.role === 'user' ? (
                        'YOU'
                      ) : (
                        <>
                          <Sparkles size={13} /> NORTHLINE ASSISTANT
                        </>
                      )}
                    </div>
                    <div className="message-body">
                      {message.text.split('\n\n').map((paragraph, i) => (
                        <p key={i}>{paragraph}</p>
                      ))}
                    </div>
                    {message.answer && (
                      <div className="answer-evidence">
                        <span className={`answer-status ${message.answer.status}`}>
                          {message.answer.status === 'grounded' ? (
                            <CheckCheck size={14} />
                          ) : (
                            <CircleHelp size={14} />
                          )}
                          {message.answer.status === 'grounded'
                            ? 'Source matched'
                            : message.answer.status === 'needs-human'
                              ? 'Human review needed'
                              : 'Not covered in knowledge base'}
                        </span>
                        {isLive && (
                          <span className="response-meta">
                            {message.answer.provider === 'openrouter'
                              ? 'OpenRouter · verified quotes'
                              : 'Sources-only fallback'}
                            {message.answer.processingMs
                              ? ` · ${(message.answer.processingMs / 1000).toFixed(1)}s`
                              : ''}
                          </span>
                        )}
                        <div className="citations">
                          {message.answer.sources.length ? (
                            message.answer.sources.map((article) => (
                              <button key={article.id} onClick={() => setSource(article)}>
                                <BookOpen size={14} />
                                <span>
                                  {article.id} · {article.title}
                                </span>
                                <ArrowUp size={13} className="diagonal" />
                              </button>
                            ))
                          ) : (
                            <span className="no-source">Source: no matching article</span>
                          )}
                        </div>
                        <button
                          className={`handoff-link ${message.answer.status !== 'grounded' ? 'emphasized' : ''}`}
                          onClick={() => openHandoff(messages[index - 1]?.text)}
                        >
                          <Headphones size={14} /> Talk to a human <ArrowRight size={13} />
                        </button>
                      </div>
                    )}
                  </article>
                ))}
                {(busy || !ready) && (
                  <div className="thinking" role="status">
                    <span className="thinking-dots">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span>Searching sources and verifying the answer…</span>
                  </div>
                )}
              </div>
              {newAnswer && (
                <button
                  className="jump-answer"
                  onClick={() => {
                    autoScroll.current = true
                    setNewAnswer(false)
                    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' })
                  }}
                >
                  New answer <ArrowDown size={14} />
                </button>
              )}
              {error && (
                <div className="chat-error" role="alert">
                  <div>
                    <CircleHelp size={17} />
                    <span>{error}</span>
                  </div>
                  <div className="error-actions">
                    {failedQuestion && (
                      <button
                        onClick={() => void ask(failedQuestion, true)}
                        disabled={busy || !ready}
                      >
                        Try again
                      </button>
                    )}
                    <button onClick={() => openHandoff(failedQuestion)}>Prepare handoff</button>
                    <button aria-label="Dismiss error" onClick={() => setError('')}>
                      <X size={15} />
                    </button>
                  </div>
                </div>
              )}
              <form
                className="composer"
                onSubmit={(event) => {
                  event.preventDefault()
                  void ask(input)
                }}
              >
                <label className="sr-only" htmlFor="question">
                  Your question
                </label>
                <div className="input-shell">
                  <textarea
                    ref={inputRef}
                    id="question"
                    rows={2}
                    maxLength={800}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Ask about returns, delivery, or our policies…"
                    disabled={busy || !ready}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'Enter' &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault()
                        void ask(input)
                      }
                    }}
                  />
                  <button
                    className="send-button"
                    type="submit"
                    disabled={busy || !ready || !input.trim()}
                    aria-label={busy ? 'Processing question' : 'Send message'}
                  >
                    {busy ? <LoaderCircle size={20} className="spin" /> : <ArrowUp size={22} />}
                  </button>
                </div>
                <div className="composer-footer">
                  <span>
                    <LockKeyhole size={12} />{' '}
                    {isLive
                      ? 'Saved securely · restored on reload · 7 days'
                      : 'Local mock · clears on reload'}
                  </span>
                  <span>{input.length}/800</span>
                </div>
              </form>
            </div>
          </div>
          <div className="demo-bottom">
            <span>
              <ShieldCheck size={15} /> A useful answer should come with a source.
            </span>
            <details className="demo-controls">
              <summary>Demo controls</summary>
              <div>
                {!isLive && (
                  <label>
                    <input
                      type="checkbox"
                      checked={failNext}
                      disabled={busy || !ready}
                      onChange={(event) => setFailNext(event.target.checked)}
                    />{' '}
                    Simulate an error on the next question
                  </label>
                )}
                <button
                  onClick={() => void ask('Can you recommend a hotel for my holiday?')}
                  disabled={busy || !ready}
                >
                  Try an unknown question <ArrowRight size={13} />
                </button>
                <button
                  onClick={() =>
                    openHandoff('I would like a quote for 30 office items for my team.', true)
                  }
                >
                  Try lead capture <ArrowRight size={13} />
                </button>
                <p>
                  {isLive
                    ? 'Test requests are stored and notify the demo manager.'
                    : 'Local preview only.'}
                </p>
              </div>
            </details>
          </div>
        </section>

        <section className="workflow wrap" id="how-it-works">
          <span className="eyebrow muted">02 / BEHIND THE ANSWER</span>
          <div className="section-title">
            <h2>How it works</h2>
            <p>A clear path from question to confidence.</p>
          </div>
          <div className="workflow-grid">
            {workflow.map(([Icon, title, text], index) => (
              <div key={title} className="workflow-step">
                <div>
                  <span className="step-icon">
                    <Icon size={21} />
                  </span>
                  <span className="step-number">0{index + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
                {index < 5 && <ChevronRight className="step-arrow" size={15} />}
              </div>
            ))}
          </div>
          <p className="workflow-note">
            <span>{isLive ? 'LIVE RAG' : 'LOCAL MOCK'}</span>{' '}
            {isLive
              ? 'Cloudflare embeddings → pgvector search → OpenRouter free model → verified source quotes. If confidence is low or a provider is unavailable, sources and human review take over.'
              : 'Local FAQ matching for development. No external requests.'}
          </p>
        </section>

        <section className="features wrap">
          <div className="section-title">
            <div>
              <span className="eyebrow muted">03 / CONFIDENCE BUILT IN</span>
              <h2>Production-ready features</h2>
            </div>
            <p>
              Grounded answers. Clear escalation.
              <br />A working demo on free service quotas.
            </p>
          </div>
          <div className="features-grid">
            {features.map(([Icon, title, text]) => (
              <div className="feature" key={title}>
                <Icon size={21} />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="customization wrap" id="customization">
          <div>
            <span className="eyebrow">BUILT FOR CUSTOMIZATION</span>
            <h2>
              Your company.
              <br />
              Your knowledge. Your voice.
            </h2>
            <p>
              Adapt the experience to your content, support process and customer touchpoints. Start
              with trusted answers, then connect the tools your team already uses.
            </p>
            <a href="#chat" className="custom-cta">
              Explore the demo <ArrowRight size={17} />
            </a>
          </div>
          <div className="custom-options">
            {[
              'Websites',
              'Ecommerce stores',
              'SaaS products',
              'Internal company knowledge bases',
              'Help centers',
              'Customer support teams',
            ].map((item, index) => (
              <div key={item}>
                <span>0{index + 1}</span>
                {item}
                <ArrowUp size={16} className="diagonal" />
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="footer wrap">
        <div>
          <MessageSquare size={17} />
          <span>
            AI Customer Support Agent
            <br />
            <small>A portfolio demo by ScorpionD</small>
          </span>
        </div>
        <span>React · TypeScript · {isLive ? 'pgvector · OpenRouter' : 'Mock RAG'}</span>
        <a href="https://github.com/ScorpionD/ai-support-rag-demo" target="_blank" rel="noreferrer">
          View source <ArrowUp size={14} className="diagonal" />
        </a>
      </footer>

      <Modal
        open={source !== null}
        title={selectedArticle ? selectedArticle.title : 'Northline knowledge base'}
        onClose={() => setSource(null)}
      >
        {selectedArticle ? (
          <>
            <div className="source-meta">
              <span className="mode-pill">{selectedArticle.id}</span>
              <span>{selectedArticle.category} · Demo FAQ</span>
            </div>
            <p className="source-question">{selectedArticle.question}</p>
            <blockquote className="source-content">{selectedArticle.content}</blockquote>
            <p className="source-footnote">
              Fictional Northline policy · Updated {selectedArticle.updated}. This source supports
              the answer. Citations show the stored text used for that response.
            </p>
            {isLive && selectedArticle.url && (
              <a className="text-link" href={selectedArticle.url} target="_blank" rel="noreferrer">
                Open full source <ArrowUp size={14} />
              </a>
            )}
            <button className="secondary-button" onClick={() => setSource('all')}>
              <BookOpen size={16} /> Browse all {articles.length} articles
            </button>
          </>
        ) : (
          <>
            <p className="modal-description">
              The complete source of this demo’s answers. These policies describe a fictional
              company.
            </p>
            <div className="kb-directory">
              {articles.map((article) => (
                <button key={article.id} onClick={() => setSource(article)}>
                  <span>{article.id}</span>
                  <strong>{article.title}</strong>
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          </>
        )}
      </Modal>
      <Modal
        open={handoffOpen}
        title={
          draft
            ? isLive
              ? 'Your request is saved'
              : 'Your demo draft is ready'
            : 'Let a human take it from here'
        }
        onClose={() => setHandoffOpen(false)}
      >
        {draft ? (
          <div className="draft-result">
            <span className="draft-check">
              <Check size={27} />
            </span>
            <h3>{draft.isLead ? 'Sales lead saved' : 'Support handoff saved'}</h3>
            <p>
              {isLive ? (
                <>
                  Saved in the demo’s private Supabase database.{' '}
                  <strong>
                    {draft.delivery === 'delivered'
                      ? 'Telegram delivered to the demo manager.'
                      : draft.delivery === 'review'
                        ? 'Notification needs review; your request is safely stored.'
                        : 'Manager notification is queued. Your request is safely stored.'}
                  </strong>{' '}
                  This fictional store does not provide real customer service.
                </>
              ) : (
                'Local preview only. Nothing has been sent.'
              )}
            </p>
            <dl>
              <dt>Reference</dt>
              <dd>{draft.id}</dd>
              <dt>Name</dt>
              <dd>{draft.name}</dd>
              <dt>Email</dt>
              <dd>{draft.email}</dd>
              {draft.company && (
                <>
                  <dt>Company</dt>
                  <dd>{draft.company}</dd>
                </>
              )}
              <dt>Request</dt>
              <dd>{draft.message}</dd>
              <dt>Status</dt>
              <dd>
                {draft.delivery === 'delivered'
                  ? 'Saved in Supabase · Telegram delivered'
                  : draft.delivery === 'review'
                    ? 'Saved · notification needs review'
                    : draft.delivery === 'pending'
                      ? 'Saved · notification pending'
                      : 'Local preview · not delivered'}
              </dd>
            </dl>
            <button className="primary-button" onClick={() => setHandoffOpen(false)}>
              Back to the conversation <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <form className="handoff-form" onSubmit={submitHandoff}>
            <p className="modal-description">
              {isLive
                ? 'Use fictional contact details. Your request is stored in Supabase for up to 7 days and sent to the demo manager in Telegram. Sales leads are stored separately.'
                : 'Prepare a local draft with fictional details. Nothing will be sent.'}
            </p>
            <div className="form-row">
              <label>
                Full name <span>*</span>
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  value={handoff.name}
                  placeholder="Alex Morgan"
                  autoComplete="off"
                  onChange={(e) => setHandoff({ ...handoff, name: e.target.value })}
                />
              </label>
              <label>
                Email <span>*</span>
                <input
                  required
                  type="email"
                  maxLength={254}
                  value={handoff.email}
                  placeholder="alex@example.com"
                  autoComplete="off"
                  onChange={(e) => setHandoff({ ...handoff, email: e.target.value })}
                />
              </label>
            </div>
            <label>
              Company <small>Optional</small>
              <input
                maxLength={120}
                value={handoff.company}
                placeholder="Your demo company"
                autoComplete="off"
                onChange={(e) => setHandoff({ ...handoff, company: e.target.value })}
              />
            </label>
            <label>
              How can the team help? <span>*</span>
              <textarea
                required
                minLength={10}
                maxLength={1000}
                rows={4}
                value={handoff.message}
                onChange={(e) => setHandoff({ ...handoff, message: e.target.value })}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={handoff.isLead}
                onChange={(e) => setHandoff({ ...handoff, isLead: e.target.checked })}
              />{' '}
              Include as a sales lead (demo)
            </label>
            <label className="checkbox-label consent">
              <input
                type="checkbox"
                required
                checked={handoff.consent}
                onChange={(e) => setHandoff({ ...handoff, consent: e.target.checked })}
              />{' '}
              {isLive
                ? 'I am using fictional test details and agree to store this request and notify the demo manager.'
                : 'I understand this fictional draft stays in this tab.'}
            </label>
            {handoffError && (
              <p className="form-error" role="alert">
                {handoffError}
              </p>
            )}
            <button className="primary-button" type="submit" disabled={handoffBusy || !ready}>
              {handoffBusy ? (
                <>
                  <LoaderCircle size={16} className="spin" /> Saving…
                </>
              ) : isLive ? (
                'Send demo'
              ) : (
                'Create demo'
              )}{' '}
              {handoff.isLead ? 'lead' : 'handoff'} <ArrowRight size={17} />
            </button>
          </form>
        )}
      </Modal>
    </>
  )
}
