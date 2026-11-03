// 点心 · 本地编辑面板（仅本机使用）
// 启动：npm run studio
// 打开：http://127.0.0.1:4322

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const contentPath = join(root, 'src', 'content', 'site.json');
const pagePath = join(here, 'studio.html');
const port = Number(process.env.STUDIO_PORT ?? 4322);

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      const html = await readFile(pagePath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'GET' && req.url === '/api/content') {
      const json = await readFile(contentPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(json);
      return;
    }

    if (req.method === 'POST' && req.url === '/api/content') {
      const body = await readBody(req);
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('内容不是合法的 JSON');
        return;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('内容结构不对');
        return;
      }
      await writeFile(contentPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(err));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log('点心编辑面板：http://127.0.0.1:' + port);
  console.log('预览地址：http://127.0.0.1:4321/（需要 npm run dev 在跑）');
});
