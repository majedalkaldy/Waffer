export function getRequestQuery(req = {}) {
  if (typeof req?.url === 'string' && req.url) {
    try {
      const requestUrl = new URL(req.url, 'http://waffer.local');
      return Object.fromEntries(requestUrl.searchParams.entries());
    } catch {
      return {};
    }
  }

  const query = req?.query;
  return query && typeof query === 'object' ? query : {};
}
