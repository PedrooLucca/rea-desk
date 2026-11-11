'use strict';
// Gerenciador de arquivos: lógica PURA (sem DOM nem Electron), testada em scripts/test-files.js.
(function (root) {
  const HDR = 4;                         // cada pedaço binário começa com o número da transferência (4 bytes, big-endian)

  // [id(4)][dados] -> ArrayBuffer pronto para dc.send
  function frame(id, data) {
    const out = new Uint8Array(HDR + data.byteLength);
    new DataView(out.buffer).setUint32(0, id >>> 0, false);
    out.set(data, HDR);
    return out.buffer;
  }
  function unframe(buf) {
    if (!buf || buf.byteLength < HDR) return null;
    const u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    return { id: new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getUint32(0, false), data: u8.subarray(HDR) };
  }

  // Junta pasta e nome (Windows). "C:\" + "a" = "C:\a"; "C:\x" + "a" = "C:\x\a".
  const joinPath = (dir, name) => (dir.endsWith('\\') || dir.endsWith('/') ? dir + name : dir + '\\' + name);
  // O item da lista: no Início vem com o caminho completo (p); nas pastas, junta com a pasta aberta.
  const childPath = (listing, e) => e.p || joinPath(listing.path, e.n);

  // Cabe numa mensagem do canal de dados (limite seguro de ~200 KB): corta a lista e avisa.
  function capEntries(entries, maxBytes = 180000) {
    const out = []; let size = 2;
    for (const e of entries) {
      const len = JSON.stringify(e).length + 1;
      if (size + len > maxBytes) return { entries: out, truncated: true };
      size += len; out.push(e);
    }
    return { entries: out, truncated: false };
  }

  const fmtSize = (n) => {
    n = Number(n) || 0;
    if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2).replace('.', ',') + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1).replace('.', ',') + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  };
  const pad = (x) => String(x).padStart(2, '0');
  function fmtDate(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const ERR = {
    'nao-permitido': 'O outro computador não permitiu o acesso a arquivos neste acesso.',
    'nao-existe': 'Essa pasta ou arquivo não existe mais.',
    'sem-acesso': 'O Windows não deixou acessar isto (sem permissão).',
    'ocupado': 'O arquivo está em uso por outro programa.',
    'sem-espaco': 'Não há espaço suficiente no disco.',
    'pasta-invalida': 'Isto não é uma pasta.',
    'nao-e-arquivo': 'Escolha um arquivo (pastas ainda não podem ser transferidas).',
    'tamanho': 'O arquivo é grande demais (o limite é 4 GB).',
    'incompleto': 'O arquivo não chegou inteiro.',
    'sem-resposta': 'O outro computador não respondeu. Se ele estiver com uma versão antiga do REA Desk, atualize os dois computadores.',
    'desconectado': 'A conexão com o outro computador caiu.',
    'cancelado': 'Transferência cancelada.',
  };
  const errText = (code) => ERR[code] || 'Algo deu errado. Tente de novo.';

  const api = { HDR, frame, unframe, joinPath, childPath, capEntries, fmtSize, fmtDate, errText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.REA_FM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
