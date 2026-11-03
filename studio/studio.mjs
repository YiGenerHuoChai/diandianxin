// 点心 · 本地编辑面板（仅本机使用）
// 启动：npm run studio
// 打开：http://127.0.0.1:4322/studio
//
// 数据模型：一个页面 = 元信息 + 区块列表
//   src/content/pages/{slug}.json  →  { path, title, tagline, description, back, blocks[] }
//   src/content/site.json          →  { brand, brandEn, email }
//   src/content/theme.json         →  { scale }
//
// 同源设计：面板在 /studio，其余请求全部代理到 Astro dev（127.0.0.1:4321）。
// 这样预览 iframe（4322/）与面板同源，能直接读取预览地址，不再依赖跨源 postMessage。

import { createServer, request } from 'node:http';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const contentDir = join(root, 'src', 'content');
const pagesDir = join(contentDir, 'pages');
const sitePath = join(contentDir, 'site.json');
const themePath = join(contentDir, 'theme.json');
const notesPath = join(contentDir, 'notes.json');
const pagePath = join(here, 'studio.html');
const port = Number(process.env.STUDIO_PORT ?? 4322);
const SITE = { host: '127.0.0.1', port: Number(process.env.DEV_PORT ?? 4321) };

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const replyJson = (res, data, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};

const replyText = (res, text, status = 400) => {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
};

const listPages = async () => {
  const files = (await readdir(pagesDir)).filter((file) => file.endsWith('.json'));
  const entries = await Promise.all(
    files.map(async (file) => {
      const slug = file.replace(/\.json$/, '');
      const data = JSON.parse(await readFile(join(pagesDir, file), 'utf8'));
      return [slug, data];
    }),
  );
  return Object.fromEntries(entries);
};

// 把预览请求转发给 Astro dev（站点页面、静态资源、Vite 模块）
const proxyToSite = (req, res, url) => {
  const upstream = request(
    {
      host: SITE.host,
      port: SITE.port,
      method: req.method,
      path: url.pathname + url.search,
      headers: { ...req.headers, host: `${SITE.host}:${SITE.port}` },
    },
    (siteRes) => {
      res.writeHead(siteRes.statusCode ?? 502, siteRes.headers);
      siteRes.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) {
      replyText(res, '站点服务没有运行：先在项目目录执行 npm run dev', 502);
    }
  });
  req.pipe(upstream);
};

const handleApi = async (req, res, url) => {
  if (req.method === 'GET' && url.pathname === '/api/all') {
    replyJson(res, {
      pages: await listPages(),
      site: JSON.parse(await readFile(sitePath, 'utf8')),
      theme: JSON.parse(await readFile(themePath, 'utf8')),
      notes: JSON.parse(await readFile(notesPath, 'utf8')),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/new') {
    const raw = await readBody(req);
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      replyText(res, '内容不是合法的 JSON');
      return;
    }
    const file = String(data?.file ?? '').trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(file)) {
      replyText(res, '页面地址名只能用英文小写字母、数字、连字符');
      return;
    }
    const pageFile = join(pagesDir, `${file}.json`);
    let exists = false;
    try {
      await readFile(pageFile, 'utf8');
      exists = true;
    } catch {
      exists = false;
    }
    if (exists) {
      replyText(res, '这个地址已经有页面了', 409);
      return;
    }
    const page = {
      path: `/${file}`,
      title: '新页面',
      tagline: '',
      description: '',
      back: true,
      blocks: [],
    };
    await writeFile(pageFile, JSON.stringify(page, null, 2) + '\n', 'utf8');
    replyJson(res, { ok: true, file, page });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/save') {
    const raw = await readBody(req);
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      replyText(res, '内容不是合法的 JSON');
      return;
    }
    const file = String(data?.file ?? '');
    const page = data?.page;
    if (!/^[a-z0-9-]+$/.test(file)) {
      replyText(res, '页面文件名不合法');
      return;
    }
    if (!page || typeof page !== 'object' || Array.isArray(page) || !Array.isArray(page.blocks)) {
      replyText(res, '页面结构不对：需要 blocks 数组');
      return;
    }
    await writeFile(join(pagesDir, `${file}.json`), JSON.stringify(page, null, 2) + '\n', 'utf8');
    replyJson(res, { ok: true, file });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/site') {
    const raw = await readBody(req);
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      replyText(res, '内容不是合法的 JSON');
      return;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      replyText(res, '内容结构不对');
      return;
    }
    await writeFile(
      sitePath,
      JSON.stringify(
        {
          brand: String(data.brand ?? ''),
          brandEn: String(data.brandEn ?? ''),
          email: String(data.email ?? ''),
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    replyJson(res, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/notes') {
    const raw = await readBody(req);
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      replyText(res, '内容不是合法的 JSON');
      return;
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.notes)) {
      replyText(res, '结构不对：需要 notes 数组');
      return;
    }
    await writeFile(notesPath, JSON.stringify({ notes: data.notes }, null, 2) + '\n', 'utf8');
    replyJson(res, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/theme') {
    const raw = await readBody(req);
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      replyText(res, '内容不是合法的 JSON');
      return;
    }
    const scale = Number(data?.scale);
    if (!Number.isFinite(scale) || scale < 0.8 || scale > 1.6) {
      replyText(res, 'scale 超出范围（0.8–1.6）');
      return;
    }
    await writeFile(themePath, JSON.stringify({ scale }, null, 2) + '\n', 'utf8');
    replyJson(res, { ok: true });
    return;
  }

  replyText(res, 'Not found', 404);
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (req.method === 'GET' && (url.pathname === '/studio' || url.pathname === '/studio/')) {
      const html = await readFile(pagePath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    // 其余请求全部代理到 Astro dev：预览 iframe 加载 4322/，与面板同源
    proxyToSite(req, res, url);
  } catch (err) {
    replyText(res, String(err), 500);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log('点心编辑面板：http://127.0.0.1:' + port + '/studio');
  console.log('预览代理：http://127.0.0.1:' + port + '/（转发到 ' + SITE.host + ':' + SITE.port + '，需要 npm run dev 在跑）');
});
