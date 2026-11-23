// Propósito: Viáticos > comprovação da OT: botão "📁 Anexar comprovantes da pasta". Liga public/via-comprovantes-pasta.js ao app (index.html carrega o script; app.js desenha o botão acima da lista
//   de despesas e chama viaComprovantesPasta) e acrescenta o CSS da leitura e da tela de conferência. Só aparece com a OT aberta para comprovação e para quem pode editar.
// Entrada: public/index.html, public/app.js, public/styles.css (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-23_viaticos_comprovantes_pasta.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
function edita(arq, fn) {
  const p = path.join(raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error(arq + ': âncora não única/achada: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  const r = fn(troca, () => s); if (typeof r === 'string') s = r; fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
edita('public/index.html', troca => troca('  <script src="/via-direcionador.js"></script>', '  <script src="/via-direcionador.js"></script>\n  <script src="/via-comprovantes-pasta.js"></script>'));
edita('public/app.js', troca => {
  troca('    <div class="table-wrap" style="margin-top:10px"><table>\n      <thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th class="num">Valor</th><th class="actions">Ações</th></tr></thead>',
    '    ${!finalizada && !somenteLeitura && despesas.length && typeof viaComprovantesPasta === \'function\' ? \'<div style="margin-top:10px"><button class="btn sm" id="via-pasta-btn" type="button" title="Escolha a pasta com os comprovantes: o sistema lê cada um, sugere a despesa de cada e abre uma tela para conferir">📁 Anexar comprovantes da pasta</button></div>\' : \'\'}\n    <div class="table-wrap" style="margin-top:10px"><table>\n      <thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th class="num">Valor</th><th class="actions">Ações</th></tr></thead>');
  troca("  document.querySelectorAll('[data-aprovar]').forEach(b => b.onclick = async () => {",
    "  const btnPasta = $('#via-pasta-btn'); if (btnPasta) btnPasta.onclick = () => viaComprovantesPasta(s, despesas, () => viewSolicitacao(id));\n  document.querySelectorAll('[data-aprovar]').forEach(b => b.onclick = async () => {");
});
edita('public/styles.css', (troca, get) => {
  if (get().includes('.cmp-tbl')) throw new Error('css já aplicado');
  return get().replace(/\s+$/, '\n') + `/* Viáticos > comprovação: anexar comprovantes da pasta (leitura + conferência) */
.cmp-barra { height: 8px; border-radius: 99px; background: color-mix(in srgb, var(--muted) 16%, transparent); overflow: hidden; margin: 10px 0; } .cmp-barra i { display: block; height: 100%; background: var(--verde-500); border-radius: 99px; transition: width .25s; }
.cmp-tbl { width: 100%; } .cmp-tbl td { vertical-align: top; }
.cmp-arq { display: flex; gap: 10px; align-items: center; min-width: 230px; } .cmp-arq img { width: 54px; height: 54px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); flex: none; }
.cmp-pdf { width: 54px; height: 54px; border-radius: 8px; border: 1px solid var(--line); display: grid; place-items: center; font-weight: 700; font-size: 12px; color: var(--danger); background: var(--card); flex: none; }
.cmp-arq b { display: block; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; } .cmp-arq small, .cmp-lido small { display: block; color: var(--muted); font-size: 11px; }
.cmp-lido { font-size: 12.5px; min-width: 170px; } .cmp-lido div + div { margin-top: 4px; }
.cmp-sel { width: 100%; min-width: 290px; font-size: 12.5px; }
.cmp-nv { display: inline-block; margin-top: 5px; padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; background: color-mix(in srgb, var(--muted) 14%, var(--card)); color: var(--ink-2); }
.cmp-nv.alta { background: color-mix(in srgb, var(--verde-500) 18%, var(--card)); color: var(--verde-700); } .cmp-nv.media, .cmp-nv.baixa { background: color-mix(in srgb, var(--warn) 22%, var(--card)); } .cmp-nv.nenhuma { background: var(--danger-050); color: var(--danger); }
`;
});
console.log('ok');
