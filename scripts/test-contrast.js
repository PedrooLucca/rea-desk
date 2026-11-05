'use strict';
// Confere o contraste das cores do design system (ui/app.css) nos temas escuro e claro.
// Texto normal: mínimo 4,5:1 (WCAG AA). Ícones e indicadores: mínimo 3:1. Também garante que o tema claro "pelo sistema"
// (media query) tem os mesmos valores do tema claro "manual".
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'ui', 'app.css'), 'utf8');

function block(startMarker) {
  const i = css.indexOf(startMarker);
  if (i < 0) throw new Error('bloco não encontrado: ' + startMarker);
  const open = css.indexOf('{', i), close = css.indexOf('}', open);
  const vars = {};
  for (const m of css.slice(open + 1, close).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}
const dark = block(':root,\n:root[data-theme="dark"]');
const light = block(':root[data-theme="light"]');
const lightMedia = block(':root:not([data-theme])');

function parse(v) {
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/.exec(v);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
  throw new Error('cor não reconhecida: ' + v);
}
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const lum = (c) => {
  const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

let fails = 0;
function theme(name, t) {
  const C = (k) => parse(t[k]);
  const solid = (k) => over(C(k), C('background'));
  // cor `k` (pode ter transparência) sobre o fundo `bgKey`
  const on = (k, bgKey) => { const bg = over(C(bgKey), C('background')); return over(C(k), bg); };
  // fundos "suaves" (com transparência) sobre uma superfície
  const soft = (k, surface) => over(C(k), solid(surface));
  const rows = [
    // [descrição, cor do texto, cor do fundo, mínimo]
    ['texto normal / fundo', C('foreground'), solid('background'), 4.5],
    ['texto normal / cartão', C('foreground'), solid('surface'), 4.5],
    ['texto normal / diálogo', C('foreground'), solid('popover'), 4.5],
    ['texto secundário / fundo', C('muted-foreground'), solid('background'), 4.5],
    ['texto secundário / cartão', C('muted-foreground'), solid('surface'), 4.5],
    ['texto secundário / item de lista', C('muted-foreground'), solid('surface-2'), 4.5],
    ['texto secundário / diálogo', C('muted-foreground'), solid('popover'), 4.5],
    ['texto do campo / campo', C('foreground'), solid('input'), 4.5],
    ['dica do campo / campo', C('muted-foreground'), solid('input'), 4.5],
    ['botão principal', C('primary-foreground'), solid('primary'), 4.5],
    ['botão principal (passar o mouse)', C('primary-foreground'), solid('primary-hover'), 4.5],
    ['botão de perigo', C('destructive-foreground'), solid('destructive'), 4.5],
    ['botão de perigo (passar o mouse)', C('destructive-foreground'), solid('destructive-hover'), 4.5],
    ['texto / faixa de atualização (azul suave)', C('foreground'), soft('primary-soft', 'background'), 4.5],
    ['texto / faixa de aviso (âmbar suave)', C('foreground'), soft('warning-soft', 'background'), 4.5],
    ['texto "pronto" / pílula', C('success'), soft('success-soft', 'background'), 4.5],
    ['texto "sem conexão" / pílula', C('destructive-text'), soft('destructive-soft', 'background'), 4.5],
    ['erro / faixa sob o campo', C('destructive-text'), soft('destructive-soft', 'surface'), 4.5],
    ['sucesso / cartão', C('success'), solid('surface'), 4.5],
    ['aviso (âmbar) / diálogo', C('warning'), solid('popover'), 3],
    ['ícone (anel azul) / ícone no cartão', C('ring'), soft('primary-soft', 'surface'), 3],
    ['ícone de aviso / fundo suave', C('warning'), soft('warning-soft', 'popover'), 3],
    ['anel de foco / fundo', C('ring'), solid('background'), 3],
    ['anel de foco / cartão', C('ring'), solid('surface'), 3],
    ['interruptor ligado / diálogo', C('primary'), solid('popover'), 3],
    ['barra de qualidade ótima / barra', C('success'), solid('popover'), 3],
    ['barra de qualidade regular / barra', C('warning'), solid('popover'), 3],
    ['barra de qualidade ruim / barra', C('destructive-text'), solid('popover'), 3],
  ];
  for (const [what, fg, bg, min] of rows) {
    const r = ratio(fg, bg);
    const ok = r >= min;
    if (!ok) fails++;
    console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}: ${what}: ${r.toFixed(2)}:1 (mínimo ${min})`);
  }
}
theme('escuro', dark);
theme('claro', { ...dark, ...light });

// o tema claro "pelo sistema" precisa ter os mesmos valores do claro manual (exceto o que ele herda)
for (const [k, v] of Object.entries(lightMedia)) {
  if (light[k] !== v) { fails++; console.log(`FALHA tema claro pelo sistema: --${k} = ${v}, mas no claro manual = ${light[k]}`); }
}

if (fails) { console.error(`\n${fails} verificação(ões) de contraste falharam`); process.exit(1); }
console.log('OK: contraste do design system passou em todos os testes');
