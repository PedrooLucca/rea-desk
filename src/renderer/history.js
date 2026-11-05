'use strict';
// Histórico de computadores acessados: lógica PURA (sem DOM), testada em scripts/test-history.js.
// Guardado em localStorage ("history", JSON) pelo renderer; fica em AppData e sobrevive às atualizações.
//   item: { id: '123456789', name: 'Maria-PC', lastAt: <ms>, count: <acessos>, fav: bool, custom: bool }
//   custom = o usuário renomeou à mão; o nome informado pelo outro computador não sobrescreve mais.
(function (root) {
  const MAX = 20;        // limite de itens; favoritos nunca são descartados automaticamente
  const NAME_MAX = 40;
  const validId = (id) => /^\d{9}$/.test(String(id));
  const cleanName = (n) => String(n == null ? '' : n).replace(/[\u0000-\u001f]/g, '').trim().slice(0, NAME_MAX);

  // favoritos primeiro, depois os mais recentes
  const sort = (list) => [...list].sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || b.lastAt - a.lastAt);
  function limit(list) {
    const s = sort(list);
    const favs = s.filter((e) => e.fav);
    const rest = s.filter((e) => !e.fav).slice(0, Math.max(0, MAX - favs.length));
    return sort([...favs, ...rest]);
  }

  // Lê o que veio do disco (pode estar vazio, corrompido ou de outra versão): nunca lança erro.
  function normalize(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set(), out = [];
    for (const e of raw) {
      if (!e || !validId(e.id) || seen.has(String(e.id))) continue;
      seen.add(String(e.id));
      out.push({
        id: String(e.id), name: cleanName(e.name), lastAt: Number(e.lastAt) > 0 ? Number(e.lastAt) : 0,
        count: Math.max(1, parseInt(e.count, 10) || 1), fav: !!e.fav, custom: !!e.custom,
      });
    }
    return limit(out);
  }
  function parse(text) { try { return normalize(JSON.parse(text)); } catch { return []; } }

  // Registra um acesso aceito (cria o item ou atualiza data, contagem e, se não foi renomeado, o nome).
  function record(list, id, name, now = Date.now()) {
    id = String(id);
    if (!validId(id)) return list;
    const nm = cleanName(name);
    if (list.some((e) => e.id === id)) {
      return limit(list.map((e) => (e.id === id ? { ...e, lastAt: now, count: e.count + 1, name: e.custom ? e.name : (nm || e.name) } : e)));
    }
    return limit([...list, { id, name: nm, lastAt: now, count: 1, fav: false, custom: false }]);
  }
  const remove = (list, id) => list.filter((e) => e.id !== String(id));
  const toggleFavorite = (list, id) => limit(list.map((e) => (e.id === String(id) ? { ...e, fav: !e.fav } : e)));
  // Renomear: nome vazio desfaz o nome personalizado (volta a seguir o nome informado pelo outro computador).
  function rename(list, id, name) {
    const nm = cleanName(name);
    return list.map((e) => (e.id === String(id) ? { ...e, name: nm || e.name, custom: !!nm } : e));
  }
  const clearKeepingFavorites = (list) => list.filter((e) => e.fav);

  const fmtCode = (id) => String(id).replace(/(\d{3})(?=\d)/g, '$1 ');
  const displayName = (e) => e.name || `Computador ${fmtCode(e.id)}`;

  // "agora há pouco", "há 5 min", "há 3 h", "ontem", "há 4 dias", "05/11/2026"
  function timeAgo(ts, now = Date.now()) {
    if (!ts) return '';
    const min = Math.floor(Math.max(0, now - ts) / 60000);
    if (min < 1) return 'agora há pouco';
    if (min < 60) return `há ${min} min`;
    const a = new Date(now); a.setHours(0, 0, 0, 0);
    const b = new Date(ts); b.setHours(0, 0, 0, 0);
    const days = Math.round((a - b) / 86400000);
    if (days <= 0) return `há ${Math.floor(min / 60)} h`;
    if (days === 1) return 'ontem';
    if (days < 7) return `há ${days} dias`;
    const d = new Date(ts), p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  const api = { MAX, normalize, parse, record, remove, toggleFavorite, rename, clearKeepingFavorites, displayName, fmtCode, timeAgo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.REA_HISTORY = api;
})(typeof window !== 'undefined' ? window : globalThis);
