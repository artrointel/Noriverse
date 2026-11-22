import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';

const port = Number(process.argv[2] ?? 8765);
const access = randomBytes(8).toString('hex');
const page = await readFile(new URL('./index.html', import.meta.url));
let test;

function json(response, status, value = null) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function useObservedLanAddress(sdp, remoteAddress) {
  const address = remoteAddress?.replace(/^::ffff:/, '');
  if (!address || !/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(address)) return;
  // Only the opt-in LAN comparison replaces a WebRTC mDNS hostname.
  return sdp.replace(/^(a=candidate:\S+ \d+ UDP \d+ )\S+\.local( \d+ typ host\b)/gim, (_, prefix, suffix) => prefix + address + suffix);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const key = Buffer.from(url.searchParams.get('key') ?? '');
  if (key.length !== access.length || !timingSafeEqual(key, Buffer.from(access))) return json(response, 403);
  if (url.pathname === '/' && request.method === 'GET') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    return response.end(page);
  }
  if (request.method === 'POST' && url.pathname === '/start') {
    const requested = url.searchParams.get('mode');
    const mode = requested === 'stun' || requested === 'lan-ip' ? requested : 'lan';
    test = { id: randomBytes(8).toString('hex'), mode, offer: null, answer: null };
    return json(response, 201, { id: test.id, mode });
  }
  if (url.pathname !== '/signal' || !test || url.searchParams.get('test') !== test.id) return json(response, 404);
  const current = test;
  if (request.method === 'GET') return json(response, 200, current);
  const type = url.searchParams.get('type');
  if (request.method !== 'POST' || (type !== 'offer' && type !== 'answer')) return json(response, 405);
  request.setEncoding('utf8');
  let sdp = '';
  for await (const chunk of request) {
    sdp += chunk;
    if (sdp.length > 32_000) return json(response, 413);
  }
  if (current !== test || !sdp.startsWith('v=0')) return json(response, 400);
  if (current[type]) return json(response, 409);
  if (current.mode === 'lan-ip') {
    const adjusted = useObservedLanAddress(sdp, request.socket.remoteAddress);
    if (adjusted === undefined) return json(response, 422);
    sdp = adjusted;
  }
  current[type] = sdp;
  return json(response, 200);
});

server.listen(port, '0.0.0.0', () => {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) console.log('PC and phone:', `http://${address.address}:${port}/?key=${access}`);
    }
  }
  console.log('PC only:', `http://127.0.0.1:${port}/?key=${access}`);
});
