import fs from 'node:fs/promises'
import path from 'node:path'
import { validateDocument } from '../worker/core.mjs'
const base = process.env.RAG_BASE_URL || 'https://ai-support-rag-demo.pages.dev'
if (!process.env.RAG_ADMIN_TOKEN)
  throw new Error('Set RAG_ADMIN_TOKEN in the server-side shell environment.')
if (!process.argv[2])
  throw new Error('Usage: node scripts/ingest.mjs <FAQ.json | document.md> [...]')
for (const file of process.argv.slice(2)) {
  const text = await fs.readFile(file, 'utf8')
  const ext = path.extname(file).toLowerCase()
  let docs
  if (ext === '.json') {
    const value = JSON.parse(text)
    docs = Array.isArray(value) ? value : [value]
  } else if (ext === '.md') {
    const id = path.basename(file, '.md')
    docs = [
      { id, title: text.match(/^#\s+(.+)$/m)?.[1] || id, content: text, category: 'Knowledge' },
    ]
  } else
    throw new Error(
      'Supported formats: FAQ JSON and Markdown. Convert PDF to reviewed Markdown before ingestion.',
    )
  for (const raw of docs) {
    const doc = validateDocument(raw, base)
    const r = await fetch(base + '/api/admin/ingest', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.RAG_ADMIN_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(doc),
      signal: AbortSignal.timeout(60000),
    })
    if (!r.ok)
      throw new Error('Ingestion failed for ' + doc.id + ' (' + r.status + '). ' + (await r.text()))
    console.log(await r.json())
  }
}
