#!/usr/bin/env node
// JSON-RPC proxy for failure drills on the local network: forwards everything to --target, except
// that the Nth send_tx is answered with HTTP 429 (--mode 429) or its connection is dropped
// (--mode drop) without being forwarded, as a rate-limited or dead public RPC would do.
// Usage: node scripts/lib/fault-proxy.mjs [--port 3045] [--target http://127.0.0.1:3040] [--fail-send-at 6] [--mode 429|drop]
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  port: { type: 'string', default: '3045' }, target: { type: 'string', default: 'http://127.0.0.1:3040' },
  'fail-send-at': { type: 'string', default: '6' }, mode: { type: 'string', default: '429' },
} });
const failAt = Number(values['fail-send-at']);
let sends = 0;

createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  let method = null;
  try { method = JSON.parse(body).method; } catch {}
  if (method === 'send_tx' || method === 'broadcast_tx_commit' || method === 'broadcast_tx_async') {
    sends++;
    if (sends === failAt) {
      console.log(`send #${sends}: injected ${values.mode}`);
      if (values.mode === 'drop') { req.socket.destroy(); return; }
      res.writeHead(429, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -429, message: 'Rate limits exceeded (injected by fault-proxy)' } }));
      return;
    }
  }
  const r = await fetch(values.target, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  res.writeHead(r.status, { 'content-type': 'application/json' });
  res.end(await r.text());
}).listen(Number(values.port), '127.0.0.1', () => console.log(`fault-proxy on 127.0.0.1:${values.port} -> ${values.target}, ${values.mode} at send #${failAt}`));
