/** A deadline includes headers AND response body; aborts never become empty results. */
export async function requestJSON(url, {
  timeoutMs = 10000, signal, fetchImpl = globalThis.fetch, ...init
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('Invalid timeout');
  const controller = new AbortController();
  let timedOut = false;
  const relay = () => controller.abort(signal?.reason);
  if (signal?.aborted) relay();
  else signal?.addEventListener('abort', relay, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const response = await fetchImpl(url, { ...init, signal: controller.signal, cache: 'no-store' });
    let data;
    try { data = await response.json(); }
    catch (error) {
      if (controller.signal.aborted) throw error;
      throw Object.assign(new Error('Invalid JSON response'), { code: 'INVALID_RESPONSE', status: response.status });
    }
    if (!response.ok) {
      throw Object.assign(new Error('Request failed'), {
        code: typeof data?.code === 'string' ? data.code : 'HTTP_ERROR', status: response.status
      });
    }
    return data;
  } catch (error) {
    if (timedOut) throw Object.assign(new Error('Request timed out'), { code: 'TIMEOUT' });
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', relay);
  }
}

/** Last-run-wins guard, including providers that ignore cancellation. */
export class RunScope {
  #generation = 0;
  #controller = null;
  begin() {
    this.cancel();
    const generation = this.#generation;
    this.#controller = new AbortController();
    return {
      signal: this.#controller.signal,
      current: () => generation === this.#generation && !this.#controller?.signal.aborted
    };
  }
  cancel() {
    this.#generation += 1;
    this.#controller?.abort();
    this.#controller = null;
  }
}
