'use strict';
// Texto da Release no GitHub: pega a seção "## <versão>" de docs/mudancas.md (usado pelo pipeline de publicação).
//   node scripts/release-notes.js 0.8.0
// Sem a seção, imprime um texto simples. Não escreve as marcas de atualização ([silencioso] / [perguntar]): sem elas valem as regras
// normais (correção pequena atualiza sozinha; o resto pergunta). Para forçar uma delas, edite a Release no GitHub.
const fs = require('node:fs');
const path = require('node:path');

function section(md, version) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const head = (l) => /^##\s+/.test(l);
  const start = lines.findIndex((l) => head(l) && l.replace(/^##\s+/, '').trim().split(/\s+/)[0] === version);
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && head(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim();
}

function notes(version, md) {
  const body = section(md, version);
  const footer = 'Na primeira instalação, o Windows pode mostrar "O Windows protegeu seu computador": clique em **Mais informações → Executar assim mesmo** (o instalador ainda não é assinado). Quem já usa o programa recebe a atualização dentro dele.';
  return (body ? `## O que mudou na ${version}\n\n${body}` : `REA Desk ${version}.`) + '\n\n' + footer + '\n';
}

if (require.main === module) {
  const version = process.argv[2];
  if (!version) { console.error('uso: node scripts/release-notes.js <versão>'); process.exit(1); }
  process.stdout.write(notes(version, fs.readFileSync(path.join(__dirname, '..', 'docs', 'mudancas.md'), 'utf8')));
}
module.exports = { section, notes };
