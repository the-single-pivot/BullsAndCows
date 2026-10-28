/**
 * A static server for working on the game, with no dependencies.
 * ES modules will not load over file://, so the page needs a real origin.
 *
 *   npm start            http://localhost:8731
 *   npm start -- 4000    another port
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 8731);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  // everything after the path is the browser's business, not the file's
  const asked = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // normalize first, then refuse anything that climbed out of the project
  const rel = normalize(asked).replace(/^(\.\.(\/|\\|$))+/, '');
  let file = join(root, rel);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',   // always serve what is on disk
    });
    res.end(body);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not here: ' + rel + '\n');
  }
}).listen(port, () => console.log('Bulls & Cows on http://localhost:%d', port));
