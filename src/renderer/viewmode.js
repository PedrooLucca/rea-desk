'use strict';
// Modo de exibição da tela do outro computador (lógica PURA, testada em scripts/test-viewmode.js).
//   'stretch' (esticada): a imagem preenche a janela mantendo a proporção; amplia se a janela for maior que a tela remota.
//   'shrink'  (reduzida, o PADRÃO): só diminui, quando a imagem é maior que a janela; nunca amplia. Se a janela for maior, a imagem fica no tamanho
//             real (1 pixel remoto = 1 pixel do seu monitor, já descontada a escala do Windows) e centralizada, sem borrar.
(function (root) {
  const MODES = ['stretch', 'shrink'];
  const DEFAULT = 'shrink';                       // padrão: reduzida (nítida, nunca amplia); valores inválidos também caem aqui
  const normalize = (m) => (MODES.includes(m) ? m : DEFAULT);
  const next = (m) => (normalize(m) === 'stretch' ? 'shrink' : 'stretch');
  const label = (m) => (normalize(m) === 'stretch' ? 'Exibição: esticada' : 'Exibição: reduzida');
  const HELP = 'Esticada: a imagem preenche a janela e pode ser ampliada. Reduzida: só diminui quando a imagem é maior que a janela, '
    + 'sem ampliar. Clique para alternar.';

  // Tamanho (px CSS) da imagem dentro da área disponível. null = deixar o CSS esticar (width/height 100% + object-fit: contain).
  //  vw,vh = tamanho do vídeo; cw,ch = área disponível; dpr = devicePixelRatio (escala do Windows).
  function fit(vw, vh, cw, ch, dpr, mode) {
    if (normalize(mode) !== 'shrink') return null;
    if (!(vw > 0 && vh > 0 && cw > 0 && ch > 0)) return null;
    const s = Math.min(cw / vw, ch / vh, 1 / (dpr > 0 ? dpr : 1));        // nunca passa de 1 pixel remoto = 1 pixel físico
    return { width: Math.max(1, Math.floor(vw * s)), height: Math.max(1, Math.floor(vh * s)), scale: s };
  }

  const api = { MODES, DEFAULT, normalize, next, label, HELP, fit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.REA_VIEWMODE = api;
})(typeof window !== 'undefined' ? window : globalThis);
