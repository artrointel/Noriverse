export async function readBody(request: Request) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return undefined;
  const body = await request.text();
  if (body.length > 2048) return undefined;
  try { return JSON.parse(body) as unknown; } catch { return undefined; }
}
