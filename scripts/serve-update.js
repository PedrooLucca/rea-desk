'use strict';
// Servidor local de atualizações para TESTAR o fluxo antes de publicar de verdade.
// Serve a pasta dist-local (gerada por `npm run update:build-local`) em http://127.0.0.1:8899
// Suporta pedidos de trechos (inclusive vários trechos, "multipart/byteranges"), usados no download incremental.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'dist-local');
const port = Number(process.env.PORT || 8899);

function parseRanges(header, size) {
  const m = /^bytes=(.+)$/.exec(header || '');
  if (!m) return null;
  const out = [];
  for (const part of m[1].split(',')) {
    const r = /^\s*(\d*)-(\d*)\s*$/.exec(part);
    if (!r) return null;
    let start = r[1] === '' ? size - Number(r[2]) : Number(r[1]);
    let end = r[1] === '' || r[2] === '' ? size - 1 : Math.min(Number(r[2]), size - 1);
    if (start > end || start >= size) continue;
    out.push([start, end]);
  }
  return out;
}

http.createServer((req, res) => {
  const name = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('não encontrado'); return; }
  const size = fs.statSync(file).size;
  const ranges = parseRanges(req.headers.range, size);
  console.log(new Date().toLocaleTimeString(), req.method, '/' + name, ranges ? `(${ranges.length} trecho(s))` : '');

  if (!ranges || !ranges.length) {
    res.writeHead(200, { 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Content-Type': 'application/octet-stream' });
    return fs.createReadStream(file).pipe(res);
  }
  if (ranges.length === 1) {
    const [s, e] = ranges[0];
    res.writeHead(206, { 'Content-Range': `bytes ${s}-${e}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1, 'Content-Type': 'application/octet-stream' });
    return fs.createReadStream(file, { start: s, end: e }).pipe(res);
  }
  const boundary = 'rea' + Date.now().toString(16);
  res.writeHead(206, { 'Content-Type': `multipart/byteranges; boundary=${boundary}`, 'Accept-Ranges': 'bytes' });
  let i = 0;
  const next = () => {
    if (i >= ranges.length) { res.end(`\r\n--${boundary}--\r\n`); return; }
    const [s, e] = ranges[i++];
    res.write(`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes ${s}-${e}/${size}\r\n\r\n`);
    const st = fs.createReadStream(file, { start: s, end: e });
    st.on('data', (c) => res.write(c));
    st.on('end', next);
  };
  next();
}).listen(port, '127.0.0.1', () => console.log(`Servidor de atualizações de teste em http://127.0.0.1:${port}/  (pasta: ${root})`));
