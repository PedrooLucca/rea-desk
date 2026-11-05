'use strict';
// Lógica PURA de múltiplos monitores (sem Electron): usada pelo processo principal e pelo injetor de mouse,
// e testada em scripts/test-monitors.js. Todas as coordenadas aqui são em PIXELS FÍSICOS da área de trabalho virtual
// (que pode ter origem negativa: um monitor à esquerda ou acima do principal tem x ou y < 0).

const clamp01 = (n) => Math.min(1, Math.max(0, Number(n) || 0));

// raw: [{ id, x, y, width, height, scaleFactor, rotation, primary, label }]  (já em pixels físicos)
function buildMonitors(raw) {
  return (raw || [])
    .filter((d) => d && d.width > 0 && d.height > 0)
    .map((d, i) => ({
      id: String(d.id), index: i + 1,
      x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.width), h: Math.round(d.height),
      scale: Number(d.scaleFactor) || 1, rotation: Number(d.rotation) || 0,
      primary: !!d.primary, label: String(d.label || ''),
    }));
}

const primaryOf = (list) => list.find((m) => m.primary) || list[0] || null;

// Mantém a seleção se o monitor ainda existe; senão volta ao principal.
function resolveSelection(list, selectedId) {
  if (!list.length) return null;
  const s = list.find((m) => m.id === String(selectedId));
  return (s || primaryOf(list)).id;
}

// Retângulo que envolve todos os monitores (= área de trabalho virtual do Windows).
function virtualBounds(list) {
  if (!list.length) return null;
  const x0 = Math.min(...list.map((m) => m.x)), y0 = Math.min(...list.map((m) => m.y));
  const x1 = Math.max(...list.map((m) => m.x + m.w)), y1 = Math.max(...list.map((m) => m.y + m.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const sameGeometry = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.scale === b.scale && a.rotation === b.rotation;

// O que mudou entre duas listas (para hot-plug, mudança de resolução, orientação, escala).
function diffTopology(prev, next) {
  const pm = new Map(prev.map((m) => [m.id, m])), nm = new Map(next.map((m) => [m.id, m]));
  const added = next.filter((m) => !pm.has(m.id)).map((m) => m.id);
  const removed = prev.filter((m) => !nm.has(m.id)).map((m) => m.id);
  const changed = next.filter((m) => pm.has(m.id) && !sameGeometry(pm.get(m.id), m)).map((m) => m.id);
  const primaryChanged = (primaryOf(prev) && primaryOf(prev).id) !== (primaryOf(next) && primaryOf(next).id);
  return { added, removed, changed, same: !added.length && !removed.length && !changed.length && !primaryChanged };
}

// Decide o que fazer quando a topologia muda: qual monitor fica selecionado e se é preciso reiniciar a captura.
function planUpdate(prevList, prevSelected, nextList) {
  const sel = resolveSelection(nextList, prevSelected);
  const diff = diffTopology(prevList, nextList);
  const hadSelection = prevSelected != null && prevList.some((m) => m.id === String(prevSelected));
  return {
    selected: sel,
    selectionLost: hadSelection && !nextList.some((m) => m.id === String(prevSelected)),
    recapture: sel !== (prevSelected == null ? null : String(prevSelected)) || diff.changed.includes(sel),
    topologyChanged: !diff.same,
    diff,
  };
}

// Ponto (0..1, 0..1) dentro de um monitor -> pixel físico na área de trabalho virtual.
function monitorPoint(m, nx, ny) {
  return { x: m.x + Math.round(clamp01(nx) * (m.w - 1)), y: m.y + Math.round(clamp01(ny) * (m.h - 1)) };
}

// Pixel físico -> coordenada absoluta do SendInput (0..65535) com MOUSEEVENTF_VIRTUALDESK.
function toAbsolute(pt, vb) {
  return {
    x: Math.round(((pt.x - vb.x) * 65535) / Math.max(1, vb.w - 1)),
    y: Math.round(((pt.y - vb.y) * 65535) / Math.max(1, vb.h - 1)),
  };
}

// Mapeia um evento de mouse do controlador. topo = { monitors, selected }.
//  - evento com `mon` (monitor que o controlador estava vendo) usa esse monitor; sem `mon` (cliente antigo) usa o selecionado
//  - se o monitor citado não existe mais (foi desconectado), devolve null e o evento é DESCARTADO (não clica no lugar errado)
function mapMouse(topo, ev) {
  if (!topo || !topo.monitors || !topo.monitors.length) return null;
  const id = ev.mon != null ? String(ev.mon) : String(topo.selected);
  const m = topo.monitors.find((x) => x.id === id);
  if (!m) return null;
  return toAbsolute(monitorPoint(m, ev.x, ev.y), virtualBounds(topo.monitors));
}

// Versão resumida para mandar ao controlador (sem campos internos).
const publicList = (list) => list.map(({ id, index, x, y, w, h, scale, rotation, primary }) => ({ id, index, x, y, w, h, scale, rotation, primary }));

module.exports = { buildMonitors, primaryOf, resolveSelection, virtualBounds, diffTopology, planUpdate, monitorPoint, toAbsolute, mapMouse, publicList };
