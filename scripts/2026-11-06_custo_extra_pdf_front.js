// Propósito: melhora a OT de custo extra (tela) em dois pontos. (1) Layout dos cartões do passo 1 do complementar: grade responsiva com título e
//   descrição em blocos (o .btn é flex e quebrava cada pedaço do texto em uma coluna). (2) PDF do custo extra para a aprovação: solicitante, OT de origem
//   (período, destinos, situação), custo pedido (tipo, detalhe, categoria, valor), justificativa, o que a OT de origem já previu e o total com o custo
//   extra. Botão "Gerar PDF" no formulário (antes do envio) e "Baixar PDF" no detalhe da OT (com o número oficial) — desfaz o ocultamento do botão feito
//   em 2026-11-06_custo_extra_front.js.
// Entrada: public/app.js e public/styles.css (ou a pasta indicada em argv[2]) e scripts/2026-11-06_custo_extra_pdf_bloco.txt. Saída: os dois arquivos editados.
// Uso (depois de 2026-11-06_custo_extra_front.js): node scripts/2026-11-06_custo_extra_pdf_front.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const bloco = fs.readFileSync(path.join(__dirname, '2026-11-06_custo_extra_pdf_bloco.txt'), 'utf8').replace(/\r\n/g, '\n');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel);
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const unico = m => { const i = s.indexOf(m); if (i < 0) throw new Error(rel + ': trecho não achado: ' + m.slice(0, 80)); if (s.indexOf(m, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + m.slice(0, 80)); return i; };
  fn({
    troca: (de, para) => { unico(de); s = s.replace(de, () => para); },
    regiao: (ini, fim, para) => { const i = unico(ini); const j = s.indexOf(fim, i); if (j < 0) throw new Error(rel + ': fim da região não achado'); s = s.slice(0, i) + para + s.slice(j + fim.length); },
    fim: t => { s += t; }
  });
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};

edita('public/app.js', ({ troca, regiao }) => {
  // 1) cartões
  regiao("        <div class=\"field-row\">\n          ${soCusto ? '' : `<button type=\"button\" class=\"btn\" data-tipo=\"extensao\"", "alimentação.</small></button>\n        </div>",
`        <div class="via-compl-opcoes">
          \${soCusto ? '' : \`<button type="button" class="btn via-compl-card" data-tipo="extensao"><span class="via-compl-tit">⏱️ Estender no local</span><span class="via-compl-desc">Continuar em \${esc(k.destinos_pai.map(d => d.municipio + '/' + d.uf).join(', '))} por mais dias.</span></button>
          <button type="button" class="btn via-compl-card" data-tipo="novo_destino"><span class="via-compl-tit">📍 Novo destino</span><span class="via-compl-desc">Ir de \${esc(k.partida.municipio)} para outra cidade e depois voltar.</span></button>\`}
          <button type="button" class="btn via-compl-card" data-tipo="custo_extra"><span class="via-compl-tit">🧾 Só um custo extra</span><span class="via-compl-desc">Remarcação de passagem, bagagem, taxa ou multa… Só o valor desse custo, sem diária de hospedagem e alimentação.</span></button>
        </div>`);
  // 2) a OT de origem inteira acompanha o assistente (o PDF mostra o que ela já previu)
  troca("VIA_WIZ.complementar = { pai_id: pai.id, tipo: null, status_pai: pai.status, raiz: raizOt,", "VIA_WIZ.complementar = { pai_id: pai.id, pai, tipo: null, status_pai: pai.status, raiz: raizOt,");
  // 3) formulário: botão Gerar PDF
  troca("ℹ️ O pedido segue para aprovação como qualquer OT. Pendências de OTs anteriores, se houver, são conferidas na transferência.",
        "ℹ️ O pedido segue para aprovação como qualquer OT. Use <strong>Gerar PDF</strong> para anexar o pedido no Approvals. Pendências de OTs anteriores, se houver, são conferidas na transferência.");
  troca("<button class=\"btn\" id=\"ce-voltar\">Voltar</button>\n        <button class=\"btn primary\" id=\"ce-enviar\">Enviar solicitação</button></div>",
        "<button class=\"btn\" id=\"ce-voltar\">Voltar</button>\n        <div style=\"display:flex; gap:10px\"><button class=\"btn\" id=\"ce-pdf\">Gerar PDF</button><button class=\"btn primary\" id=\"ce-enviar\">Enviar solicitação</button></div></div>");
  troca("  $('#ce-enviar').onclick = async (ev) => {\n    ler();",
`  $('#ce-pdf').onclick = async (ev) => {
    ler();
    const erro = viaCustoExtraErro(ce);
    if (erro) { toast(erro.msg); const el = $('#' + erro.foco); if (el) el.focus(); return; }
    const btn = ev.currentTarget, txt = btn.textContent; btn.disabled = true; btn.textContent = 'Gerando…';
    try {
      await viaGerarPdfCustoExtra({ colab: w.colab, ot: null, otOrigem: k.raiz, pai: k.pai, tipo: ce.tipo, descricao: ce.tipo === 'outro' ? ce.descricao : '',
        valor: Number(String(ce.valor).replace(',', '.')), justificativa: ce.justificativa, destinos: k.destinos_pai });
    } finally { btn.disabled = false; btn.textContent = txt; }
  };
  $('#ce-enviar').onclick = async (ev) => {
    ler();`);
  // 4) o PDF volta a existir para a OT de custo extra (o botão do detalhe e a regra)
  troca("function viaTemPdfSolicitacao(s) { return !!s && s.origem === 'colaborador' && s.complementar_tipo !== 'custo_extra'; }",
        "function viaTemPdfSolicitacao(s) { return !!s && s.origem === 'colaborador'; }");
  troca("  if (s.complementar_tipo !== 'custo_extra') botoes.push({ label: 'Baixar PDF', onClick: () => viaBaixarPdfSolicitacao(s) });",
        "  botoes.push({ label: 'Baixar PDF', onClick: () => viaBaixarPdfSolicitacao(s) });");
  // 5) baixar o PDF de uma OT de custo extra já salva (número oficial; o texto do objetivo volta a ser tipo, detalhe e justificativa)
  troca("  const cat = s.previsao_por_categoria && typeof s.previsao_por_categoria === 'object' ? s.previsao_por_categoria : {};\n  const total = Object.values(cat).reduce((a, b) => a + (Number(b) || 0), 0);\n  const { dias } = viaDiasNoites(s.data_inicio, s.data_fim, !!s.solicitacao_pai_id);\n  const w = {",
`  if (s.complementar_tipo === 'custo_extra') {
    toast('Gerando PDF…');
    let pai = null;
    try { pai = (await api('/api/viaticos/solicitacoes')).find(x => x.id === s.solicitacao_pai_id) || null; } catch (e) { /* segue sem o detalhe da OT de origem */ }
    const m = String(s.objetivo || '').match(/^Custo extra — (.+?)(?: \\(([^)]*)\\))?: ([\\s\\S]*)$/);
    const prevCusto = s.previsao_por_categoria && typeof s.previsao_por_categoria === 'object' ? s.previsao_por_categoria : {};
    return viaGerarPdfCustoExtra({
      colab: { name: s.colaborador_name, cargo: s.colaborador_cargo || '', tier: s.tier },
      ot: s.ordem_trabalho, otOrigem: pai ? (pai.ordem_trabalho || pai.id) : String(s.ordem_trabalho || '').replace(/ - Custo extra( \\d+)?$/i, ''),
      pai, tipo: s.custo_extra_tipo, tipoRotulo: m ? m[1] : '', descricao: (m && m[2]) || '', valor: viaTotalSolicitado(s),
      justificativa: m ? m[3] : (s.objetivo || ''), categoria: Object.keys(prevCusto)[0], destinos: Array.isArray(s.destinos) ? s.destinos : [], dataEmissao: s.created_at
    });
  }
  const cat = s.previsao_por_categoria && typeof s.previsao_por_categoria === 'object' ? s.previsao_por_categoria : {};
  const total = Object.values(cat).reduce((a, b) => a + (Number(b) || 0), 0);
  const { dias } = viaDiasNoites(s.data_inicio, s.data_fim, !!s.solicitacao_pai_id);
  const w = {`);
  // 6) a função do PDF, antes do gerador da solicitação de viagem
  troca("async function viaGerarPDF(w, r, opts = {}) {", bloco + "async function viaGerarPDF(w, r, opts = {}) {");
});

edita('public/styles.css', ({ fim }) => {
  fim(`
/* Viáticos: cartões de escolha do complementar (estender / novo destino / só um custo extra). O .btn é flex e quebrava cada pedaço do texto em uma
   coluna: aqui é uma grade responsiva e título e descrição são blocos. */
.via-compl-opcoes { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
.btn.via-compl-card { display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; gap: 6px; text-align: left; white-space: normal; padding: 16px; height: 100%; }
.btn.via-compl-card:hover { border-color: var(--verde-700); background: var(--verde-050, #EAF5EC); }
.via-compl-tit { font-size: 14.5px; font-weight: 700; color: var(--ink, #1E2620); }
.via-compl-desc { font-size: 12.5px; font-weight: 400; color: var(--muted); line-height: 1.45; }
`);
});
console.log('ok');
