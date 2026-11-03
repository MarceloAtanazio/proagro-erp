// Propósito: OT complementar em Viáticos (tela). Botão "Complementar" na linha da OT do próprio colaborador (liberada ou em viagem); abre o
//   assistente já ligado à OT de origem: primeiro o colaborador escolhe "estender no local" ou "novo destino a partir do local atual"; a saída
//   vira a data final da OT de origem (travada); o número é "<OT> - Complementar" (o servidor numera 2, 3…); na extensão os destinos são os da
//   origem e o transporte é opcional; a retirada do carro e a rota partem do último destino da origem, não da cidade-base. A duração segue a
//   mesma regra do servidor (dias = noites = data final − saída, porque o dia de saída já foi previsto na OT de origem).
// Entrada: public/app.js (ou a pasta indicada em argv[2]). Saída: o arquivo editado.
// Uso: node scripts/2026-11-04_viaticos_complementar_front.js [raiz]. Backend: scripts/2026-11-04_viaticos_complementar_api.js.
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => {
  const i = s.indexOf(de);
  if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 90));
  if (s.indexOf(de, i + 1) >= 0) throw new Error('trecho repetido: ' + de.slice(0, 90));
  s = s.replace(de, () => para);
};

// ---- duração (fonte única, igual ao servidor) ----
troca(`function viaDiasNoites(dataInicio, dataFim) {
  const ini = new Date(dataInicio), fim = new Date(dataFim);
  if (isNaN(ini) || isNaN(fim)) return { dias: 0, noites: 0 };
  const dias = Math.max(1, Math.round((fim - ini) / 86400000) + 1);
  return { dias, noites: Math.max(0, dias - 1) };
}
function viaWizDias(w) { return viaDiasNoites(w.data_inicio, w.data_fim).dias; }
function viaWizNoites(w) { return viaDiasNoites(w.data_inicio, w.data_fim).noites; }`,
`//
// OT COMPLEMENTAR: o dia de saída é o último dia da OT de origem, cuja alimentação já foi prevista lá. Conta-se só o que vem depois: dias e
// noites = data final − saída (ex.: 10/11 a 13/11 = 3 dias de alimentação e 3 noites, a primeira delas a do dia 10). Igual a viaRecalcularPrevisao.
function viaDiasNoites(dataInicio, dataFim, complementar) {
  const ini = new Date(dataInicio), fim = new Date(dataFim);
  if (isNaN(ini) || isNaN(fim)) return { dias: 0, noites: 0 };
  const diff = Math.max(0, Math.round((fim - ini) / 86400000));
  if (complementar) return { dias: diff, noites: diff };
  const dias = Math.max(1, diff + 1);
  return { dias, noites: Math.max(0, dias - 1) };
}
function viaWizDias(w) { return viaDiasNoites(w.data_inicio, w.data_fim, !!w.complementar).dias; }
function viaWizNoites(w) { return viaDiasNoites(w.data_inicio, w.data_fim, !!w.complementar).noites; }
// De onde a pessoa parte: a cidade-base, ou — na OT complementar — o último destino da OT de origem (ela já está lá).
function viaPontoPartida(w) {
  if (w.complementar && w.complementar.partida) return { uf: w.complementar.partida.uf, municipio: w.complementar.partida.municipio };
  return { uf: w.colab.cidade_base_uf, municipio: w.colab.cidade_base_municipio };
}`);
troca('  const { dias, noites: noitesPeriodo } = viaDiasNoites(s.data_inicio, s.data_fim);\n  // Mesma regra da previsão: viagem toda na cidade-sede',
      '  const { dias, noites: noitesPeriodo } = viaDiasNoites(s.data_inicio, s.data_fim, !!s.solicitacao_pai_id);\n  // Mesma regra da previsão: viagem toda na cidade-sede');
troca('  const { dias, noites: noitesPeriodo } = viaDiasNoites(w.data_inicio, w.data_fim);\n  const hospDevida = viaHospedagemDevida(w.destinos, w.colab.cidade_base_uf, w.colab.cidade_base_municipio);\n  const noites = hospDevida ? noitesPeriodo : 0;\n  // Valor unitário',
      '  const { dias, noites: noitesPeriodo } = viaDiasNoites(w.data_inicio, w.data_fim, !!w.complementar);\n  const hospDevida = viaHospedagemDevida(w.destinos, w.colab.cidade_base_uf, w.colab.cidade_base_municipio);\n  const noites = hospDevida ? noitesPeriodo : 0;\n  // Valor unitário');
troca('  const { dias } = viaDiasNoites(s.data_inicio, s.data_fim);\n  const w = {',
      '  const { dias } = viaDiasNoites(s.data_inicio, s.data_fim, !!s.solicitacao_pai_id);\n  const w = {\n    complementar: s.solicitacao_pai_id ? { tipo: s.complementar_tipo } : null,');

// ---- entrada no assistente ----
troca('async function renderSolicitacaoAutosservico() {', 'async function renderSolicitacaoAutosservico(pai) {');
troca(`  viaWizStep1();
}

function viaWizProgress(atual) {`,
`  if (pai) {
    // OT complementar: ligada à OT de origem. Saída = fim da origem (travada); parte do último destino dela.
    const dest = Array.isArray(pai.destinos) ? pai.destinos : [];
    const ult = dest[dest.length - 1];
    const raizOt = String(pai.ordem_trabalho || pai.id).replace(/ - Complementar( \\d+)?$/i, '');
    const ini = String(pai.data_fim).slice(0, 10), d = new Date(ini + 'T12:00:00'); d.setDate(d.getDate() + 1);
    VIA_WIZ.complementar = { pai_id: pai.id, tipo: null, raiz: raizOt, destinos_pai: dest.map(x => ({ uf: x.uf, municipio: x.municipio })), partida: ult ? { uf: ult.uf, municipio: ult.municipio } : null };
    VIA_WIZ.ordem_trabalho = raizOt + ' - Complementar';
    VIA_WIZ.data_inicio = ini; VIA_WIZ.data_fim = d.toISOString().slice(0, 10);
    VIA_WIZ.motivo = pai.motivo || ''; VIA_WIZ.objetivo = '';
    if (!ult) { toast('A OT de origem não tem destino cadastrado.'); return renderViaticos(); }
    return viaWizComplTipo();
  }
  viaWizStep1();
}

// Escolha do tipo de complementar (só quando o assistente foi aberto a partir de uma OT em curso).
function viaWizComplTipo() {
  const w = VIA_WIZ, k = w.complementar, c = $('#content');
  c.innerHTML = \`
    <div class="via-wiz-container">
      \${viaWizProgress(1)}
      <div class="card">
        <h3 style="margin-bottom:6px">OT complementar de \${esc(k.raiz)}</h3>
        <p class="hint" style="margin-bottom:14px">Você está em <strong>\${esc(k.partida.municipio)}/\${esc(k.partida.uf)}</strong>. A complementar começa em <strong>\${brDate(w.data_inicio)}</strong>
          (o fim da OT de origem) e parte daí — não da sua cidade-base. O que a OT de origem já previu não é cobrado de novo.</p>
        <div class="field-row">
          <button type="button" class="btn" data-tipo="extensao" style="flex:1; text-align:left; padding:14px"><strong>⏱️ Estender no local</strong><br><small>Continuar em \${esc(k.destinos_pai.map(d => d.municipio + '/' + d.uf).join(', '))} por mais dias.</small></button>
          <button type="button" class="btn" data-tipo="novo_destino" style="flex:1; text-align:left; padding:14px"><strong>📍 Novo destino</strong><br><small>Ir de \${esc(k.partida.municipio)} para outra cidade e depois voltar.</small></button>
        </div>
      </div>
    </div>\`;
  c.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => {
    k.tipo = b.dataset.tipo;
    w.destinos = k.tipo === 'extensao' ? k.destinos_pai.map(d => ({ ...d })) : [];
    w.internacional = false;
    w.categoria_local = viaCalcularCategoriaLocal(w.destinos, false);
    viaWizStep1();
  });
}

function viaWizProgress(atual) {`);

// ---- etapa 2 ----
troca("${fld('w2-ot', 'Nº da Ordem de Trabalho', 'text', w.ordem_trabalho)}",
      "${fld('w2-ot', 'Nº da Ordem de Trabalho', 'text', w.ordem_trabalho, w.complementar ? 'disabled' : '')}\n        ${w.complementar ? '<p class=\"hint\" style=\"margin:-6px 0 10px\">Complementar de uma OT em curso: o número é gerado automaticamente (se houver outra complementar da mesma OT, entra 2, 3…).</p>' : ''}");
troca("${fld('w2-inicio', 'Data de saída', 'date', w.data_inicio)}\n          ${fld('w2-fim', 'Data de retorno', 'date', w.data_fim)}",
      "${fld('w2-inicio', w.complementar ? 'Data de saída (= fim da OT de origem)' : 'Data de saída', 'date', w.data_inicio, w.complementar ? 'disabled' : '')}\n          ${fld('w2-fim', 'Data de retorno', 'date', w.data_fim, w.complementar ? `min=\"${w.data_inicio}\"` : '')}");
troca('<button type="button" data-rm="${i}">×</button></span>`).join(\'\')}</div>`',
      '${w.complementar && w.complementar.tipo === \'extensao\' ? \'\' : `<button type="button" data-rm="${i}">×</button>`}</span>`).join(\'\')}</div>`');
troca("  $('#w2-uf').onchange = popularMunicipios; popularMunicipios(); renderDestinos();",
      "  $('#w2-uf').onchange = popularMunicipios; popularMunicipios(); renderDestinos();\n  // Extensão no local: os destinos são os da OT de origem — não se edita.\n  if (w.complementar && w.complementar.tipo === 'extensao') { $('#w2-add-dest').closest('.field-row').style.display = 'none'; $('#w2-internacional').closest('label').style.display = 'none'; }");
troca("      ordem_trabalho: $('#w2-ot').value, destinos: w.destinos,", "      ordem_trabalho: $('#w2-ot').value, destinos: w.destinos, complementar: w.complementar,");
troca("  if (v.data_fim < v.data_inicio) return { msg: 'Data de retorno não pode ser antes da saída.', foco: 'w2-fim' };",
      "  if (v.data_fim < v.data_inicio) return { msg: 'Data de retorno não pode ser antes da saída.', foco: 'w2-fim' };\n  if (v.complementar && v.data_fim <= v.data_inicio) return { msg: 'A complementar precisa terminar depois do fim da OT de origem (' + brDate(v.data_inicio) + ').', foco: 'w2-fim' };");

// ---- etapa 3: transporte opcional na extensão; ponto de partida ----
troca("function viaWizValidarEtapa3(t, colab) {\n  const marcados = ['aviao', 'onibus', 'aluguel_carro', 'carro_proprio', 'taxi_uber'].filter(k => t[k]);\n  if (!marcados.length) return { msg: 'Selecione ao menos um meio de transporte.' };",
      "function viaWizValidarEtapa3(t, colab, opcional) {\n  const marcados = ['aviao', 'onibus', 'aluguel_carro', 'carro_proprio', 'taxi_uber'].filter(k => t[k]);\n  // Extensão no local: a pessoa já está lá, o transporte é opcional.\n  if (!marcados.length) return opcional ? null : { msg: 'Selecione ao menos um meio de transporte.' };");
troca("    const erro = viaWizValidarEtapa3(w.transporte, w.colab);\n    if (erro) return viaWizAvisar(erro);",
      "    const erro = viaWizValidarEtapa3(w.transporte, w.colab, !!w.complementar && w.complementar.tipo === 'extensao');\n    if (erro) return viaWizAvisar(erro);");
troca("    const erro = viaWizValidarEtapa2(w) || viaWizValidarEtapa3(w.transporte);",
      "    const erro = viaWizValidarEtapa2(w) || viaWizValidarEtapa3(w.transporte, null, !!w.complementar && w.complementar.tipo === 'extensao');");
troca("  const temBase = !!(w.colab.cidade_base_uf && w.colab.cidade_base_municipio);\n  const ufOpcoes",
      "  const pp = viaPontoPartida(w);\n  const temBase = !!(pp.uf && pp.municipio);\n  const ufOpcoes");
troca("🏠 Retirada e devolução na cidade-base (${esc(w.colab.cidade_base_municipio)}/${esc(w.colab.cidade_base_uf)})",
      "🏠 Retirada e devolução ${w.complementar ? 'no local de partida' : 'na cidade-base'} (${esc(pp.municipio)}/${esc(pp.uf)})");
troca("        a.retirada_uf = a.devolucao_uf = w.colab.cidade_base_uf;\n        a.retirada_municipio = a.devolucao_municipio = w.colab.cidade_base_municipio;\n        a.retirada_local = a.devolucao_local = `${w.colab.cidade_base_municipio}/${w.colab.cidade_base_uf}`;",
      "        const pp = viaPontoPartida(w);\n        a.retirada_uf = a.devolucao_uf = pp.uf;\n        a.retirada_municipio = a.devolucao_municipio = pp.municipio;\n        a.retirada_local = a.devolucao_local = `${pp.municipio}/${pp.uf}`;");
troca("    { uf: colab.cidade_base_uf, municipio: colab.cidade_base_municipio }, w.destinos, colab, w.preco_combustivel,\n    'w3-proprio-status'",
      "    viaPontoPartida(w), w.destinos, colab, w.preco_combustivel,\n    'w3-proprio-status'");
troca("          ${avisoDoc}",
      "          ${w.complementar ? `<div class=\"alert-item warn\" style=\"margin-bottom:12px\">↪️ <strong>OT complementar</strong> — ${w.complementar.tipo === 'extensao' ? 'você já está no local: marque só o que for realmente usar (táxi/Uber, por exemplo). Pode seguir sem transporte.' : `você parte de <strong>${esc(w.complementar.partida.municipio)}/${esc(w.complementar.partida.uf)}</strong>, não da cidade-base. O cálculo automático da rota considera ida e volta ao ponto de partida; se for voltar direto para a base, marque “informar km manualmente” e ajuste.`}</div>` : ''}\n          ${avisoDoc}");

// ---- envio ----
troca("        previsao_por_categoria: r.cat, transporte_detalhes: w.transporte, notes: ''\n      }});",
      "        previsao_por_categoria: r.cat, transporte_detalhes: w.transporte, notes: '',\n        ...(w.complementar ? { solicitacao_pai_id: w.complementar.pai_id, complementar_tipo: w.complementar.tipo } : {})\n      }});");

// ---- botão na lista ----
troca("            <button class=\"btn sm danger-ghost\" data-del=\"${s.id}\">Excluir</button>`}\n          </td>",
      "            <button class=\"btn sm danger-ghost\" data-del=\"${s.id}\">Excluir</button>`}\n            ${meuColaborador && s.colaborador_id === meuColaborador.id && ['transferencia_agendada', 'liberado', 'em_viagem'].includes(s.status) ? `<button class=\"btn sm\" data-compl=\"${s.id}\" title=\"Estender esta OT no local ou partir daqui para um novo destino\">Complementar</button>` : ''}\n          </td>");
troca("    $('#tbl').querySelectorAll('[data-transf]').forEach(b => b.onclick = () => viaTransferenciaModal(sols.find(s => s.id == b.dataset.transf)));",
      "    $('#tbl').querySelectorAll('[data-transf]').forEach(b => b.onclick = () => viaTransferenciaModal(sols.find(s => s.id == b.dataset.transf)));\n    $('#tbl').querySelectorAll('[data-compl]').forEach(b => b.onclick = () => renderSolicitacaoAutosservico(sols.find(s => s.id == b.dataset.compl)));");

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
