// Propósito: Viáticos > solicitar viagem > etapa Transporte: "Direcionador de mobilidade" (BETA), que compara Carro próprio x Carro locado com os dados da solicitação (datas, diária, km, reembolso por km,
//   consumos, preço do combustível, extras) e indica a opção mais econômica, com economia, km de equilíbrio, média de km por dia, resumo para a coordenação e botão para marcar a opção indicada.
//   Só aparece para o super administrador (USER.is_super): teste antes de liberar a todos. O cálculo e a tela ficam em public/via-direcionador.js; este script só liga o arquivo ao app:
//   index.html (carrega o script), app.js (guarda a taxa de reembolso por km da configuração no assistente e desenha/liga o cartão na etapa 3) e styles.css (aparência).
// Entrada: public/index.html, public/app.js e public/styles.css (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-18_viaticos_direcionador_mobilidade.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
function edita(arq, fn) {
  const p = path.join(raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error(arq + ': âncora não única/achada: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  s = fn(troca, () => s); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
edita('public/index.html', (troca, get) => {
  if (get().includes('via-direcionador.js')) throw new Error('html já aplicado');
  troca('  <script src="/app.js"></script>', '  <script src="/app.js"></script>\n  <script src="/via-direcionador.js"></script>');
  return get();
});
edita('public/app.js', (troca, get) => {
  if (get().includes('viaDirecionadorHtml')) throw new Error('js já aplicado');
  troca("    colab, tud, preco_combustivel: viaConfig.preco_combustivel_litro,", "    colab, tud, preco_combustivel: viaConfig.preco_combustivel_litro, km_taxa: viaConfig.km_taxa_reembolso,");
  troca("      ${viaWizProgress(3)}\n      <div class=\"via-wiz-2col\">", "      ${viaWizProgress(3)}\n      ${typeof viaDirecionadorHtml === 'function' ? viaDirecionadorHtml() : ''}\n      <div class=\"via-wiz-2col\">");
  troca("  viaRenderAviaoBlock(); viaRenderOnibusBlock(); viaRenderAluguelBlock(); viaRenderProprioBlock(); viaRenderTaxiUberBlock();\n  viaAplicarTravasTransporte();\n",
    "  viaRenderAviaoBlock(); viaRenderOnibusBlock(); viaRenderAluguelBlock(); viaRenderProprioBlock(); viaRenderTaxiUberBlock();\n  viaAplicarTravasTransporte();\n  if (typeof viaDirecionadorLigar === 'function') viaDirecionadorLigar();\n");
  return get();
});
edita('public/styles.css', (troca, get) => {
  if (get().includes('.via-dir')) throw new Error('css já aplicado');
  return get().replace(/\s+$/, '\n') + `
/* Viáticos > solicitar viagem > Transporte: Direcionador de mobilidade (BETA), carro próprio x carro locado. */
.via-dir { margin-bottom: 14px; border: 1px solid color-mix(in srgb, var(--verde-500) 35%, var(--line)); background: linear-gradient(180deg, color-mix(in srgb, var(--verde-500) 6%, var(--card)), var(--card) 60%); }
.via-dir-cab { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; } .via-dir-cab h3 { margin: 0; } .via-dir-cab .spacer { flex: 1; }
.via-dir-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 22px; align-items: start; }
@media (max-width: 900px) { .via-dir-grid { grid-template-columns: 1fr; } }
.via-dir-par { margin-top: 6px; border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; background: var(--card); } .via-dir-par summary { cursor: pointer; font-weight: 600; font-size: 13px; color: var(--ink-2); } .via-dir-par[open] summary { margin-bottom: 8px; }
.dm-espera { padding: 22px; border: 1px dashed var(--line); border-radius: 12px; display: flex; flex-direction: column; gap: 4px; text-align: center; color: var(--muted); } .dm-espera b { color: var(--ink); }
.dm-banner { padding: 11px 14px; border-radius: 12px; font-size: 14px; background: color-mix(in srgb, var(--verde-500) 14%, var(--card)); border: 1px solid color-mix(in srgb, var(--verde-500) 40%, var(--line)); margin-bottom: 12px; }
.dm-banner.locado { background: color-mix(in srgb, var(--azul-700) 10%, var(--card)); border-color: color-mix(in srgb, var(--azul-700) 35%, var(--line)); }
.dm-comp { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.dm-opc { border: 1px solid var(--line); border-radius: 12px; padding: 12px; background: var(--card); } .dm-opc.ind { border-color: var(--verde-500); box-shadow: 0 0 0 2px color-mix(in srgb, var(--verde-500) 22%, transparent); } .dm-opc.off { opacity: .55; }
.dm-opc h5 { margin: 0 0 8px; font-size: 13.5px; } .dm-opc h5 em { font-style: normal; font-size: 11px; color: var(--verde-700); font-weight: 700; margin-left: 4px; }
.dm-opc > div:not(.dm-barra):not(.dm-total) { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; padding: 3px 0; color: var(--ink-2); } .dm-opc b { font-variant-numeric: tabular-nums; color: var(--ink); }
.dm-barra { height: 6px; border-radius: 99px; background: color-mix(in srgb, var(--muted) 16%, transparent); margin: 8px 0 6px; overflow: hidden; } .dm-barra i { display: block; height: 100%; background: var(--verde-500); border-radius: 99px; } .dm-opc:not(.ind) .dm-barra i { background: var(--azul-700); }
.dm-total { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; color: var(--muted); } .dm-total b { font-size: 18px; letter-spacing: -.02em; } .dm-indisp { font-size: 12.5px; color: var(--muted); margin: 0; }
.dm-ind { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; } .dm-ind > div { padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--muted) 7%, var(--card)); display: flex; flex-direction: column; gap: 2px; } .dm-ind span { font-size: 11px; color: var(--muted); } .dm-ind b { font-size: 15px; font-variant-numeric: tabular-nums; }
.dm-resumo { margin-top: 12px; } .dm-resumo label { display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px; color: var(--ink-2); } .dm-resumo textarea { width: 100%; font-size: 12.5px; line-height: 1.45; resize: vertical; } .dm-acoes { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
@media (max-width: 560px) { .dm-comp, .dm-ind { grid-template-columns: 1fr; } }
`;
});
console.log('ok');
