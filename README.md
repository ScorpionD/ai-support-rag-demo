# AI Customer Support Agent

A standalone portfolio demo of a customer support assistant that answers from a fictional company's knowledge base, cites its sources, and offers a human handoff when a question needs review.

**Stage 1: frontend MVP, mock RAG only.** No live LLM, embeddings, backend, database, automation or external messaging is connected. No API keys, paid services or real customer data are needed.

## Experience

- Responsive React + TypeScript chat interface with conversation history, sample questions, loading indicator, validation, error recovery and a new-chat action.
- Ten editable Northline FAQs covering returns, support hours, delivery, cancellation, warranty, damaged items, tracking, delivery locations, payments and bulk orders.
- Every matched response quotes the bundled FAQ content verbatim. Citation buttons open the corresponding full article with its ID and fictional update date.
- Honest statuses: **Source matched**, **Human review needed**, or **Not covered in knowledge base**. These are routing statuses, not calibrated AI confidence scores.
- Unsupported questions abstain; sensitive order actions and unsupported policy details offer a human handoff.
- A validated support/lead capture form creates an explicitly **unsent local draft**. It does not email, message, create a CRM record or contact a real person.
- Demo controls for a recoverable service error, an unknown question and a sales lead draft.
- Keyboard-accessible source and handoff dialogs, screen-reader loading/error announcements and reduced-motion styling.

All company names, policies and examples are fictional. Conversation and handoff data live only in React memory in the current tab. Reloading or starting a new chat clears them. There is no localStorage, analytics, external font request or chat network request in mock mode.

## Local development

Requires Node.js **22.12+** and npm.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. An environment file is optional: the default is `VITE_SUPPORT_MODE=mock`. If desired, copy `.env.example` to `.env`.

```sh
npm test
npm run build
npm run preview
```

The production build is written to `dist`. The test suite covers sample answers, citations, unknown questions, policy override attempts, human routing, follow-ups, validation, retries and cancellation.

## Mock retrieval and its limits

`src/services/mockSupport.ts` performs deterministic keyword matching against `src/data/knowledgeBase.ts`. It returns unchanged FAQ excerpts with references. It does **not** perform semantic/vector retrieval or LLM generation, and does not infer personalized exceptions. “Tell me more” can repeat the previous cited policy.

Keyword matching is deliberately limited. Broad, mixed-topic or unusual phrasings can select a related FAQ without fully answering the question. **Source matched means a policy was found, not a guarantee that every part of a question was resolved.** Human handoff remains available on every answer. The “Production-ready features” section describes patterns demonstrated by this frontend, not a claim that a production support service is connected. Live RAG will need retrieval evaluation, prompt-injection controls, source coverage checks and operational safeguards.

## Service boundary

```text
src/
  components/Modal.tsx       Accessible native dialogs
  data/knowledgeBase.ts      Ten fictional FAQ records
  services/mockSupport.ts    Matching, abstention and local handoff
  services/supportService.ts Single provider selection boundary
  types.ts                  Request, response and service contracts
  App.tsx                   Chat, evidence, handoff and page sections
  styles.css                Responsive interface
```

UI → `SupportService.ask({ question, history }, { signal })` → structured answer with text, status, sources and mode.

`SupportService.createHandoff()` currently creates a local draft. Stage 2 can extend this contract to an asynchronous server delivery operation with an explicit delivery result. Do not label a draft as delivered.

Unsupported `VITE_SUPPORT_MODE` values fail visibly; they never silently pretend to use a live provider. In stage 2, add a backend adapter here and keep the UI independent of provider details. Validate server responses before rendering, constrain citations to trusted source URLs/IDs, and keep all provider/database credentials on the server.

## Cloudflare Pages deployment

Create a **Pages** project using **Import an existing Git repository**. Connect `ScorpionD/ai-support-rag-demo` and use:

| Setting                  | Value                                |
| ------------------------ | ------------------------------------ |
| Production branch        | `main`                               |
| Build command            | `npm run build`                      |
| Build output directory   | `dist`                               |
| Root directory           | Repository root / leave empty        |
| Node version             | `22.12.0` or later supported release |
| Optional public variable | `VITE_SUPPORT_MODE=mock`             |

Save and deploy. Pages provides a public `*.pages.dev` address and builds future pushes to `main`. The `public/_headers` file adds static response headers, including a restrictive Content Security Policy. No custom domain, DNS changes, Workers binding, Function or paid product is required.

[Official Cloudflare Vite deployment guide](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/)

### Manual smoke checks

1. Try all four sample questions and open each citation. Compare the answer with the source.
2. Ask an unknown question, then open **Talk to a human**. Check form validation and the **not delivered** draft status.
3. Use **Demo controls → Simulate an error**, submit a question, and retry. Ensure the user message is not duplicated.
4. Start a new chat while an answer is loading. No old answer should appear afterwards.
5. Test 320px, 390px, tablet and desktop widths. Check the composer, scrolling history, citation dialog and handoff form with a keyboard.

## Security and scope

- Never put keys in `VITE_*` variables: they are public build-time values.
- `.env`, `.env.*` (except `.env.example`), `node_modules`, build output and local artifacts are ignored by Git.
- React renders user text as text; no HTML or generated Markdown is injected.
- Mock delay is 700ms for visible feedback. It is not a claim about future LLM latency.
- Frontend input limits and policy matching are UX behavior, not a server security boundary.
- This is an independent project. It has no dependency on `ai-lead-automation-demo` or `cryptoanalyze.pro`.

## Stage 2 — planned, not implemented

Supabase + pgvector; real RAG retrieval; OpenRouter free LLM; document/FAQ ingestion; backend-validated citations; n8n orchestration; Telegram human handoff; persistent lead/conversation storage. Live deployment will also require rate limiting, abuse protection, server-side validation, observability, privacy/retention decisions and retrieval-quality evaluation. Connect these only in a separately authorized stage.

## License

MIT. Built by ScorpionD as a portfolio demonstration.
