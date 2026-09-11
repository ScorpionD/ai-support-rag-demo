interface Env {
  RAG_API: Fetcher
}
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.RAG_API)
    return Response.json({ error: 'The support backend is not connected yet.' }, { status: 503 })
  const headers = new Headers(request.headers)
  headers.set('X-Rag-IP', request.headers.get('CF-Connecting-IP') || 'unknown')
  return env.RAG_API.fetch(new Request(request, { headers }))
}
