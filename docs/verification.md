# Stage 2 verification — 2026-09-11

Production: https://ai-support-rag-demo.pages.dev/

## Final live LLM run

All four requests used the public Pages API, real Cloudflare BGE embeddings, Supabase vector retrieval and `nex-agi/nex-n2.5-mini:free`. The server assembled answers from the source sentence IDs selected by the model.

| Question                   | Status         | Source | Backend time | End-to-end HTTP time |
| -------------------------- | -------------- | ------ | ------------ | -------------------- |
| Return policy              | Source matched | NL-01  | 1,886 ms     | 2,652 ms             |
| Weekend support            | Source matched | NL-02  | 1,027 ms     | 1,533 ms             |
| Delivery time              | Source matched | NL-03  | 954 ms       | 1,461 ms             |
| Cancellation after payment | Source matched | NL-04  | 930 ms       | 1,421 ms             |

These are test measurements, not a latency guarantee. Free-model availability and shared quotas vary. The initial larger model sometimes timed out; the demo was switched to the free Mini model with reasoning disabled. Selecting sentence IDs removed unnecessary quote-format validation failures while retaining verbatim source verification. A direct free-model verification request reported API cost 0.

## Functional checks

- **Covered questions:** all four sample questions passed using the real LLM, with saved answers and correct source IDs.
- **Uncovered:** hotel recommendation returned `not-covered`, no invented answer and no citation.
- **Low confidence:** warranty for customized digital subscriptions returned `needs-human` with related NL-05 source; did not assert coverage.
- **Citations:** source modal opens stored text; standalone `/api/sources/NL-01` returned HTTP 200 and the actual published return policy.
- **Repeat question:** normalized repeat reused the same answer ID and the same message count; observed cached HTTP response ~436 ms.
- **Concurrency:** two simultaneous database claims produced one owner. A stale completion lease was rejected.
- **Temporary fallback recovery:** after expiry, a new claim updated the original assistant message; exactly two messages remained for the question.
- **Handoff:** a fictional request submitted through the public browser form was stored in `support_handoffs`; the UI reported Telegram delivery, confirmed by an outbox `sent` state and Telegram message ID.
- **Lead:** a separate fictional sales enquiry was stored in `leads`, with Telegram delivery recorded. Repeated submission returned the same ID without another notification.
- **Persistence:** Chrome retained four existing messages after page reload; mobile retained its two-message conversation and `Source matched` status after reload.
- **New chat:** created a new empty session through the backend.
- **Ingestion:** 10 FAQ documents/chunks were ingested with 384-dimensional embeddings. A temporary Markdown document produced three embedded chunks and was removed after verification.
- **Privacy:** anonymous Supabase reads of messages/chunks and an anonymous budget RPC returned HTTP 401.
- **Request protection:** cross-origin write returned HTTP 403; oversized question returned HTTP 400; edge rate-limit and oversized-body behavior are also covered by automated tests.
- **External outage / malformed model answer:** automated backend-flow tests persisted a sources-only fallback and rejected fabricated references. An actual provider timeout during browser QA also showed sources and human review.

## UI and local checks

- Desktop: 1920 px viewport, source cards, loading state, handoff form/result and history tested.
- Mobile: 390 × 844 and 320 × 740 viewports, no horizontal overflow. Source modal and persisted result verified.
- `npm test`: 32 passing tests.
- `node scripts/verify-database.mjs`: passed against the separate live RAG database; its synthetic session was removed afterward.
- `npm run build`: successful production build.
- No secrets found in tracked application files or frontend artifacts during the release check.

## Scope and limits

This is a free-tier portfolio demo with production-style controls, not a staffed support service or a guaranteed SLA. Retrieval confidence is a similarity threshold, not a probability of correctness. Exact source text prevents fabricated policy wording but still needs business review for relevance and completeness. PDF ingestion, account-based cross-device history and a staff ticket inbox are not implemented. FAQ JSON / reviewed Markdown ingestion, anonymous seven-day history and real Telegram handoff are implemented.

Cloudflare Worker and n8n workflow deployments are separate from the Pages Git build. The existing lead workflow, ai-lead-automation-demo repository and cryptoanalyze.pro application/DNS were not modified.
