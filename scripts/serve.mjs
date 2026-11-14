// Zero-dependency static file server for the demo page, on localhost only. Serves just the folders the
// page needs (the same set as the hosted deploy); `/` redirects to `/web/`.
// Run: node scripts/serve.mjs [port=8000]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] || 8000);
const SERVED = ['web', 'packages', 'measurements'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jsonl': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') { res.writeHead(302, { location: '/web/' }); return res.end(); }
  let file = normalize(join(ROOT, path));
  const top = file.startsWith(ROOT + sep) ? file.slice(ROOT.length + 1).split(sep)[0] : '';
  if (!SERVED.includes(top) || file.split(sep).some((part) => part.startsWith('.'))) { res.writeHead(404); return res.end('not found'); }
  try {
    if ((await stat(file)).isDirectory()) {
      if (!path.endsWith('/')) { res.writeHead(301, { location: path + '/' }); return res.end(); }
      file = join(file, 'index.html');
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`http://localhost:${PORT}/web/`));
