// A bounded best-effort DELETE; no file IDs, documents or upstream bodies are logged.
export async function cleanupOpenAIFile(fileId, apiKey, {fetchImpl = globalThis.fetch, timeoutMs = 5000, attempts = 3, delayMs = 150} = {}) {
  if (!fileId || !apiKey) return {status: 'NOT_APPLICABLE', attempts: 0};
  const maxAttempts = Math.max(1, Math.min(3, attempts));
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return {status: 'UNCONFIRMED', attempts: attempt - 1};
    const controller = new AbortController();
    let timer;
    try {
      const outcome = await Promise.race([
        (async () => {
          const response = await fetchImpl('https://api.openai.com/v1/files/' + encodeURIComponent(fileId), {
            method: 'DELETE', headers: {Authorization: `Bearer ${apiKey}`}, signal: controller.signal, redirect: 'error'
          });
          if (response.status === 404) return {done: true};
          if (response.ok) {
            const body = await response.json();
            return {done: body?.deleted === true && body?.id === fileId, retry: true};
          }
          return {done: false, retry: response.status === 429 || response.status >= 500};
        })(),
        new Promise(resolve => { timer = setTimeout(() => {controller.abort(); resolve({retry: true});}, Math.max(1, Math.floor(remaining / (maxAttempts - attempt + 1)))); })
      ]);
      if (outcome.done) return {status: 'CONFIRMED', attempts: attempt};
      if (!outcome.retry || attempt === maxAttempts) return {status: 'UNCONFIRMED', attempts: attempt};
    } catch {
      if (attempt === maxAttempts) return {status: 'UNCONFIRMED', attempts: attempt};
    } finally { clearTimeout(timer); controller.abort(); }
    const pause = Math.min(delayMs * attempt, Math.max(0, deadline - Date.now()));
    if (pause) await new Promise(resolve => setTimeout(resolve, pause));
  }
  return {status: 'UNCONFIRMED', attempts: maxAttempts};
}
