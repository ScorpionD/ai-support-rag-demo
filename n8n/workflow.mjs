// Supply credential IDs and a manager chat ID at deployment time. Never export credentials.
export function notificationWorkflow({
  supabaseUrl,
  headerCredential,
  databaseCredential,
  telegramCredential,
  chatId,
}) {
  const cred = (id, name) => ({ id, name })
  const http = (name, path, body, position) => ({
    id: crypto.randomUUID(),
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
    parameters: {
      method: 'POST',
      url: supabaseUrl + '/rest/v1/rpc/' + path,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpCustomAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: body,
      options: { timeout: 8000 },
    },
    credentials: { httpCustomAuth: cred(databaseCredential, 'RAG database') },
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 1000,
  })
  const nodes = [
    {
      id: crypto.randomUUID(),
      name: 'RAG notification webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
      webhookId: 'ai-support-rag-notify',
      parameters: {
        httpMethod: 'POST',
        path: 'ai-support-rag-notify',
        authentication: 'headerAuth',
        responseMode: 'responseNode',
        options: {},
      },
      credentials: { httpHeaderAuth: cred(headerCredential, 'RAG webhook authentication') },
    },
    http(
      'Claim request',
      'claim_notification',
      '={{ JSON.stringify({p_id: $json.body.id}) }}',
      [240, 0],
    ),
    {
      id: crypto.randomUUID(),
      name: 'Notify manager',
      type: 'n8n-nodes-base.telegram',
      typeVersion: 1.2,
      position: [480, 0],
      parameters: {
        chatId,
        text: "={{ '🧠 RAG SUPPORT DEMO · ' + $json.kind.toUpperCase() + '\\nReference: ' + $json.id + '\\nName: ' + $json.payload.name + '\\nEmail: ' + $json.payload.email + '\\nCompany: ' + ($json.payload.company || '—') + '\\nRequest: ' + $json.payload.message + '\\nFictional test details · stored in the separate RAG database.' }}",
        additionalFields: {
          appendAttribution: false,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        },
      },
      credentials: { telegramApi: cred(telegramCredential, 'RAG manager Telegram') },
      onError: 'continueRegularOutput',
    },
    http(
      'Record delivery',
      'finish_notification',
      "={{ JSON.stringify({p_id: $('Claim request').item.json.id, p_claim: $('Claim request').item.json.claim, p_success: Boolean($json.message_id), p_message: $json.message_id ? String($json.message_id) : null}) }}",
      [720, 0],
    ),
    {
      id: crypto.randomUUID(),
      name: 'Respond',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.4,
      position: [960, 0],
      parameters: { respondWith: 'json', responseBody: '={"accepted":true}', options: {} },
    },
  ]
  // Telegram parses HTML: escape every user-controlled string before inserting it.
  nodes[2].parameters.text =
    "={{ '🧠 RAG SUPPORT DEMO · ' + $json.kind.toUpperCase() + '\\nReference: ' + $json.id + '\\n' + ['name','email','company','message'].map(k => k + ': ' + String($json.payload[k] || '—').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')).join('\\n') + '\\nFictional test details · separate RAG database.' }}"
  const connections = {}
  for (let i = 0; i < nodes.length - 1; i++)
    connections[nodes[i].name] = { main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]] }
  return {
    name: 'AI Support RAG · human handoff and lead notifications',
    nodes,
    connections,
    settings: {
      executionOrder: 'v1',
      saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none',
      saveManualExecutions: false,
      executionTimeout: 30,
    },
  }
}
