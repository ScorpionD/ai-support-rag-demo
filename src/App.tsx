import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, BookOpen, Check, CheckCheck, ChevronRight, CircleHelp, FileText, Headphones, Layers, LoaderCircle, LockKeyhole, MessageSquare, Plus, Search, ShieldCheck, Sparkles, Users, X } from 'lucide-react'
import { knowledgeBase, sampleQuestions } from './data/knowledgeBase'
import { supportService } from './services/supportService'
import type { HandoffDraft, HandoffInput, Message } from './types'
import Modal from './components/Modal'

const workflow = [
  [MessageSquare, 'Customer Question', 'A question, in their words.'],
  [Search, 'Knowledge Search', 'Find relevant company FAQs.'],
  [Layers, 'RAG Context', 'Keep the source in view.'],
  [Sparkles, 'LLM Answer', 'Mock: use the FAQ text.'],
  [BookOpen, 'Source Citation', 'Open and verify the policy.'],
  [Headphones, 'Human Handoff', 'Draft a request when unsure.'],
] as const
const features = [
  [BookOpen, 'Knowledge-grounded answers', 'Responses use the company’s published demo FAQs.'],
  [FileText, 'Source citations', 'Every matched policy opens as a readable source.'],
  [ShieldCheck, 'Hallucination protection', 'Unknown questions get an honest “not covered.”'],
  [MessageSquare, 'Conversation history', 'Keep the context in a clear, ongoing conversation.'],
  [Headphones, 'Human handoff', 'Prepare an escalation with the customer’s question.'],
  [Users, 'Lead capture', 'Collect a validated contact draft for sales enquiries.'],
  [Layers, 'Fallback behavior', 'Helpful recovery when a question or service fails.'],
] as const
const emptyHandoff: HandoffInput = { name: '', email: '', company: '', message: '', consent: false, isLead: false }

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [failedQuestion, setFailedQuestion] = useState('')
  const [failNext, setFailNext] = useState(false)
  const [source, setSource] = useState<string | null>(null)
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
  const selectedArticle = knowledgeBase.find(article => article.id === source)
  const answers = messages.filter(message => message.answer)

  useEffect(() => {
    if (autoScroll.current) feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' })
    else if (!busy && answers.length) setNewAnswer(true)
  }, [messages, busy, answers.length])
  useEffect(() => () => controller.current?.abort(), [])

  async function ask(question: string, retry = false) {
    const text = question.trim()
    if (sending.current) return
    if (!text || text.length > 800) { setError('Enter a question between 1 and 800 characters.'); return }
    if (messages.length >= 40 && !retry) { setError('This demo keeps up to 20 questions. Start a new chat to continue.'); return }
    sending.current = true
    const abort = new AbortController()
    controller.current = abort
    setBusy(true); setError(''); setFailedQuestion(''); setInput(''); autoScroll.current = true
    if (!retry) setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'user', text }])
    const simulateFailure = failNext
    setFailNext(false)
    try {
      const answer = await supportService.ask({ question: text, history: messages }, { signal: abort.signal, simulateFailure })
      if (!abort.signal.aborted) setMessages(previous => [...previous, { id: answer.id, role: 'assistant', text: answer.text, answer }])
    } catch (caught) {
      if (!abort.signal.aborted) { setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.'); setFailedQuestion(text) }
    } finally {
      if (controller.current === abort) { setBusy(false); sending.current = false }
    }
  }
  function resetChat() {
    controller.current?.abort(); controller.current = null; sending.current = false
    setMessages([]); setBusy(false); setError(''); setInput(''); setFailedQuestion(''); setNewAnswer(false); setFailNext(false)
    setDraft(null); setHandoff(emptyHandoff); inputRef.current?.focus()
  }
  function openHandoff(question?: string, isLead = false) {
    setHandoff({ ...emptyHandoff, message: question || [...messages].reverse().find(m => m.role === 'user')?.text || '', isLead })
    setDraft(null); setHandoffError(''); setHandoffOpen(true)
  }
  function submitHandoff(event: FormEvent) {
    event.preventDefault()
    try { setDraft(supportService.createHandoff(handoff)); setHandoffError('') }
    catch (caught) { setHandoffError(caught instanceof Error ? caught.message : 'Please check the form.') }
  }

  return <>
    <a className="skip-link" href="#chat">Skip to support chat</a>
    <header className="site-header wrap">
      <a className="brand" href="#top"><span className="brand-mark"><MessageSquare size={22} /><Check size={11} /></span><span>AI Customer<br className="mobile-break" /> Support Agent</span></a>
      <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#customization">Customization</a><a className="nav-cta" href="#chat">Try the demo <ArrowUp size={14} className="diagonal" /></a></nav>
    </header>
    <main id="top">
      <section className="hero wrap">
        <div><div className="eyebrow"><span className="small-dot" /> KNOWLEDGE FIRST. CUSTOMERS FIRST.</div><h1>Helpful answers.<br /><span>Grounded in your business.</span></h1>
          <p className="hero-description">AI support assistant that answers from your company knowledge base, cites sources and escalates uncertain requests to a human.</p>
          <a className="text-link" href="#chat">Ask a question. Check the source. <ArrowDown size={17} /></a>
        </div>
        <aside className="hero-note"><span className="note-icon"><BookOpen size={25} /></span><p>Your knowledge.<br /><strong>A better first response.</strong></p><div className="note-line" /><span><Check size={15} /> Answers you can trace</span><span><Check size={15} /> A human when it matters</span><div className="note-tag">INTERACTIVE PORTFOLIO DEMO</div></aside>
      </section>

      <section id="chat" className="demo-section wrap" aria-labelledby="demo-heading">
        <div className="section-top"><div><span className="eyebrow muted">01 / THE EXPERIENCE</span><h2 id="demo-heading">Meet your first line of support.</h2></div><span className="mode-pill"><span className="small-dot" /> Mock RAG mode</span></div>
        <div className="demo-disclosure"><CircleHelp size={17} /><p>Try Northline, a fictional home & office store. Replies come from 10 built-in FAQs. <strong>No live AI, no messages sent.</strong> Use test details only.</p></div>

        <div className="support-workspace">
          <aside className="knowledge-sidebar">
            <div className="company"><span className="company-mark">n<span>.</span></span><div><strong>Northline</strong><span>Home & office essentials</span></div></div>
            <div className="sidebar-label"><span>COMPANY KNOWLEDGE</span><span>10</span></div>
            <div className="article-list">{knowledgeBase.map(article => <button key={article.id} onClick={() => setSource(article.id)}><FileText size={16} /><span>{article.title}</span><ChevronRight size={14} /></button>)}</div>
            <div className="sidebar-note"><LockKeyhole size={17} /><p>A closed knowledge base.<br /><span>No outside information.</span></p></div>
            <button className="sidebar-human" onClick={() => openHandoff()}><Headphones size={17} /> Talk to a human <ArrowRight size={15} /></button>
          </aside>

          <div className="chat-panel">
            <header className="chat-header"><div className="assistant-avatar"><Sparkles size={21} /><span /></div><div><h3>Northline support</h3><span>Knowledge-based demo assistant</span></div><button className="icon-button" onClick={resetChat} title="New chat" aria-label="Start a new chat"><Plus size={20} /></button></header>
            <div className="mobile-knowledge"><button onClick={() => setSource('all')}><BookOpen size={15} /> Browse 10 source articles <ChevronRight size={14} /></button></div>
            <div ref={feed} className="chat-feed" role="log" aria-label="Conversation history" aria-live="polite" aria-relevant="additions" onScroll={() => { if (feed.current) { autoScroll.current = feed.current.scrollHeight - feed.current.scrollTop - feed.current.clientHeight < 80; if (autoScroll.current) setNewAnswer(false) } }}>
              <div className="welcome"><span className="welcome-label"><Sparkles size={15} /> A LITTLE CLARITY GOES A LONG WAY</span><h3>Hi there. How can I help?</h3><p>Ask about delivery, returns or shopping with Northline. I’ll show the policy behind my answer. If it isn’t covered, we can prepare a human handoff.</p><div className="welcome-proof"><BookOpen size={14} /> 10 articles <span>·</span><ShieldCheck size={14} /> Source-linked answers</div></div>
              {!messages.length && <div className="starter-questions"><span>NOT SURE WHERE TO START?</span>{sampleQuestions.map(question => <button key={question} onClick={() => void ask(question)} disabled={busy}>{question}<ArrowUp size={16} className="diagonal" /></button>)}</div>}
              {messages.map((message, index) => <article key={message.id} className={`message ${message.role}`}>
                <div className="message-label">{message.role === 'user' ? 'YOU' : <><Sparkles size={13} /> NORTHLINE ASSISTANT</>}</div>
                <div className="message-body">{message.text.split('\n\n').map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>
                {message.answer && <div className="answer-evidence">
                  <span className={`answer-status ${message.answer.status}`}>{message.answer.status === 'grounded' ? <CheckCheck size={14} /> : <CircleHelp size={14} />}{message.answer.status === 'grounded' ? 'Source matched' : message.answer.status === 'needs-human' ? 'Human review needed' : 'Not covered in knowledge base'}</span>
                  <div className="citations">{message.answer.sources.length ? message.answer.sources.map(article => <button key={article.id} onClick={() => setSource(article.id)}><BookOpen size={14} /><span>{article.id} · {article.title}</span><ArrowUp size={13} className="diagonal" /></button>) : <span className="no-source">Source: no matching article</span>}</div>
                  <button className={`handoff-link ${message.answer.status !== 'grounded' ? 'emphasized' : ''}`} onClick={() => openHandoff(messages[index - 1]?.text)}><Headphones size={14} /> Talk to a human <ArrowRight size={13} /></button>
                </div>}
              </article>)}
              {busy && <div className="thinking" role="status"><span className="thinking-dots"><i /><i /><i /></span><span>Checking Northline’s knowledge base…</span></div>}
            </div>
            {newAnswer && <button className="jump-answer" onClick={() => { autoScroll.current = true; setNewAnswer(false); feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }) }}>New answer <ArrowDown size={14} /></button>}
            {error && <div className="chat-error" role="alert"><div><CircleHelp size={17} /><span>{error}</span></div><div className="error-actions">{failedQuestion && <button onClick={() => void ask(failedQuestion, true)} disabled={busy}>Try again</button>}<button onClick={() => openHandoff(failedQuestion)}>Prepare handoff</button><button aria-label="Dismiss error" onClick={() => setError('')}><X size={15} /></button></div></div>}
            <form className="composer" onSubmit={event => { event.preventDefault(); void ask(input) }}>
              <label className="sr-only" htmlFor="question">Your question</label>
              <div className="input-shell"><textarea ref={inputRef} id="question" rows={2} maxLength={800} value={input} onChange={event => setInput(event.target.value)} placeholder="Ask about returns, delivery, or our policies…" disabled={busy} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(input) } }} /><button className="send-button" type="submit" disabled={busy || !input.trim()} aria-label={busy ? 'Processing question' : 'Send message'}>{busy ? <LoaderCircle size={20} className="spin" /> : <ArrowUp size={22} />}</button></div>
              <div className="composer-footer"><span><LockKeyhole size={12} /> In this tab only · clears on reload</span><span>{input.length}/800</span></div>
            </form>
          </div>
        </div>
        <div className="demo-bottom"><span><ShieldCheck size={15} /> A useful answer should come with a source.</span><details className="demo-controls"><summary>Demo controls</summary><div><label><input type="checkbox" checked={failNext} disabled={busy} onChange={event => setFailNext(event.target.checked)} /> Simulate an error on the next question</label><button onClick={() => void ask('Can you recommend a hotel for my holiday?')} disabled={busy}>Try an unknown question <ArrowRight size={13} /></button><button onClick={() => openHandoff('I would like a quote for 30 office items for my team.', true)}>Try lead capture <ArrowRight size={13} /></button><p>Local demonstrations. No request reaches a real team.</p></div></details></div>
      </section>

      <section className="workflow wrap" id="how-it-works"><span className="eyebrow muted">02 / BEHIND THE ANSWER</span><div className="section-title"><h2>How it works</h2><p>A clear path from question to confidence.</p></div><div className="workflow-grid">{workflow.map(([Icon, title, text], index) => <div key={title} className="workflow-step"><div><span className="step-icon"><Icon size={21} /></span><span className="step-number">0{index + 1}</span></div><h3>{title}</h3><p>{text}</p>{index < 5 && <ChevronRight className="step-arrow" size={15} />}</div>)}</div><p className="workflow-note"><span>STAGE 1</span> The search and answer steps are simulated locally with curated FAQ text. A live retrieval service, LLM and team delivery are planned for the next stage.</p></section>

      <section className="features wrap"><div className="section-title"><div><span className="eyebrow muted">03 / CONFIDENCE BUILT IN</span><h2>Production-ready features</h2></div><p>Core patterns demonstrated here.<br />Live integrations come next.</p></div><div className="features-grid">{features.map(([Icon, title, text]) => <div className="feature" key={title}><Icon size={21} /><div><h3>{title}</h3><p>{text}</p></div></div>)}</div></section>

      <section className="customization wrap" id="customization"><div><span className="eyebrow">BUILT FOR CUSTOMIZATION</span><h2>Your company.<br />Your knowledge. Your voice.</h2><p>Adapt the experience to your content, support process and customer touchpoints. Start with trusted answers, then connect the tools your team already uses.</p><a href="#chat" className="custom-cta">Explore the demo <ArrowRight size={17} /></a></div><div className="custom-options">{['Websites', 'Ecommerce stores', 'SaaS products', 'Internal company knowledge bases', 'Help centers', 'Customer support teams'].map((item, index) => <div key={item}><span>0{index + 1}</span>{item}<ArrowUp size={16} className="diagonal" /></div>)}</div></section>
    </main>
    <footer className="footer wrap"><div><MessageSquare size={17} /><span>AI Customer Support Agent<br /><small>A portfolio demo by ScorpionD</small></span></div><span>React · TypeScript · Mock RAG</span><a href="https://github.com/ScorpionD/ai-support-rag-demo" target="_blank" rel="noreferrer">View source <ArrowUp size={14} className="diagonal" /></a></footer>

    <Modal open={source !== null} title={selectedArticle ? selectedArticle.title : 'Northline knowledge base'} onClose={() => setSource(null)}>
      {selectedArticle ? <><div className="source-meta"><span className="mode-pill">{selectedArticle.id}</span><span>{selectedArticle.category} · Demo FAQ</span></div><p className="source-question">{selectedArticle.question}</p><blockquote className="source-content">{selectedArticle.content}</blockquote><p className="source-footnote">Fictional Northline policy · Updated {selectedArticle.updated}. This is the exact source text used by the mock service.</p><button className="secondary-button" onClick={() => setSource('all')}><BookOpen size={16} /> Browse all 10 articles</button></> : <><p className="modal-description">The complete source of this demo’s answers. These policies describe a fictional company.</p><div className="kb-directory">{knowledgeBase.map(article => <button key={article.id} onClick={() => setSource(article.id)}><span>{article.id}</span><strong>{article.title}</strong><ChevronRight size={17} /></button>)}</div></>}
    </Modal>
    <Modal open={handoffOpen} title={draft ? 'Your demo draft is ready' : 'Let a human take it from here'} onClose={() => setHandoffOpen(false)}>
      {draft ? <div className="draft-result"><span className="draft-check"><Check size={27} /></span><h3>{draft.isLead ? 'Sales lead draft created' : 'Support handoff draft created'}</h3><p>Saved in this tab’s memory. <strong>Nothing has been sent.</strong> Real delivery and persistent storage will be connected in stage 2.</p><dl><dt>Reference</dt><dd>{draft.id}</dd><dt>Name</dt><dd>{draft.name}</dd><dt>Email</dt><dd>{draft.email}</dd>{draft.company && <><dt>Company</dt><dd>{draft.company}</dd></>}<dt>Request</dt><dd>{draft.message}</dd><dt>Status</dt><dd>Local preview · not delivered</dd></dl><button className="primary-button" onClick={() => setHandoffOpen(false)}>Back to the conversation <ArrowRight size={16} /></button></div> : <form className="handoff-form" onSubmit={submitHandoff}>
        <p className="modal-description">Prepare a support request or sales lead with fictional details. This is a local preview; it does not contact a real person.</p>
        <div className="form-row"><label>Full name <span>*</span><input required minLength={2} maxLength={80} value={handoff.name} placeholder="Alex Morgan" autoComplete="off" onChange={e => setHandoff({ ...handoff, name: e.target.value })} /></label><label>Email <span>*</span><input required type="email" maxLength={254} value={handoff.email} placeholder="alex@example.com" autoComplete="off" onChange={e => setHandoff({ ...handoff, email: e.target.value })} /></label></div>
        <label>Company <small>Optional</small><input maxLength={120} value={handoff.company} placeholder="Your demo company" autoComplete="off" onChange={e => setHandoff({ ...handoff, company: e.target.value })} /></label>
        <label>How can the team help? <span>*</span><textarea required minLength={10} maxLength={1000} rows={4} value={handoff.message} onChange={e => setHandoff({ ...handoff, message: e.target.value })} /></label>
        <label className="checkbox-label"><input type="checkbox" checked={handoff.isLead} onChange={e => setHandoff({ ...handoff, isLead: e.target.checked })} /> Include as a sales lead (demo)</label>
        <label className="checkbox-label consent"><input type="checkbox" required checked={handoff.consent} onChange={e => setHandoff({ ...handoff, consent: e.target.checked })} /> I am using fictional test details. I understand this draft stays in this tab and is not sent.</label>
        {handoffError && <p className="form-error" role="alert">{handoffError}</p>}
        <button className="primary-button" type="submit">Create demo {handoff.isLead ? 'lead' : 'handoff'} <ArrowRight size={17} /></button>
      </form>}
    </Modal>
  </>
}
