// Propósito: tela do excesso reprovado que vira pendência.
//   - "Reprovar" um excesso da TUD pede confirmação (tem efeito financeiro) e envia o valor do excesso ao servidor;
//   - o alerta "Reprovado" informa que o valor vira pendência (só quando o valor foi guardado, isto é, daqui para frente);
//   - o aviso de pendência (Nova solicitação, Editar e Agendar transferência) lista de onde vem cada valor
//     ("OT 160 — excesso reprovado: R$ 20,45") e vem com "Sim, descontar" SEMPRE pré-marcado: o desconto vai para a
//     próxima OT; o "Não" continua disponível.
// Entrada: public/app.js. Saída: public/app.js editado. Uso: node scripts/2026-10-23_viaticos_excesso_reprovado_front.js
const fs = require('fs'), path = require('path');
const BT = String.fromCharCode(96);
const arq = path.join(__dirname, '..', 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('não achado: ' + de.slice(0, 90)); s = s.replace(de, () => para); };

// ---- Reprovar com confirmação e valor ----
troca("  document.querySelectorAll('[data-reprovar]').forEach(b => b.onclick = async () => {\n" +
      "    try { await api(" + BT + "/api/viaticos/solicitacoes/${id}/excesso-status" + BT + ", { method: 'POST', body: { chave: b.dataset.reprovar, status: 'reprovado' } }); toast('Excesso reprovado.'); viewSolicitacao(id); }\n" +
      "    catch (e) { toast(e.message); }\n  });",
      "  document.querySelectorAll('[data-reprovar]').forEach(b => b.onclick = () => {\n" +
      "    const ex = excessos.find(x => x.chave === b.dataset.reprovar) || {};\n" +
      "    openModal('Reprovar excesso', " + BT + "<p>Reprovar o excesso de <strong>${brl(ex.valor)}</strong>?</p>\n" +
      "      <p class=\"hint\" style=\"margin-top:8px\">O valor vira uma <strong>pendência do colaborador</strong>: na próxima OT dele aparece \"Descontar do valor liberado?\", já marcado como <strong>Sim</strong>.</p>" + BT + ",\n" +
      "      [{ label: 'Cancelar', onClick: () => viewSolicitacao(id) },\n" +
      "       { label: 'Reprovar', cls: 'primary', onClick: async () => {\n" +
      "          try {\n" +
      "            await api(" + BT + "/api/viaticos/solicitacoes/${id}/excesso-status" + BT + ", { method: 'POST', body: { chave: b.dataset.reprovar, status: 'reprovado', valor: ex.valor } });\n" +
      "            closeModal(); toast('Excesso reprovado: o valor será descontado na próxima OT do colaborador.'); viewSolicitacao(id);\n" +
      "          } catch (e) { modalError(e.message); }\n" +
      "       } }]);\n  });");

// ---- alerta "Reprovado" ----
troca("else if (st === 'reprovado') alertBlocks.push(" + BT + "<div class=\"alert-item late\">❌ Reprovado (excesso de ${brl(ex.valor)}): ${ex.msg}</div>" + BT + ");",
      "else if (st === 'reprovado') alertBlocks.push(" + BT + "<div class=\"alert-item late\">❌ Reprovado (excesso de ${brl(ex.valor)}): ${ex.msg}${(s.excessos_valores && s.excessos_valores[ex.chave]) ? ' — vira pendência a descontar na próxima OT do colaborador.' : ''}</div>" + BT + ");");

// ---- aviso de pendência: origem de cada valor ----
troca("ainda não descontada.\n      <div style=\"margin-top:8px; display:flex; align-items:center; gap:10px\">",
      "ainda não descontada.\n" +
      "      <div style=\"margin-top:6px; font-size:12.5px; color:var(--ink-2)\">${r.solicitacoes.map(x => " + BT + "OT ${esc(x.ordem_trabalho || x.id)} — ${x.origem === 'excesso' ? 'excesso reprovado' : 'gasto acima do liberado'}: ${brl(x.valor_pendencia)}" + BT + ").join('<br>')}</div>\n" +
      "      <div style=\"margin-top:8px; display:flex; align-items:center; gap:10px\">");

// ---- "Sim" sempre pré-marcado ----
troca("{ padrao: isEdit ? null : true }", "{ padrao: true }");
troca("{ padrao: null, obrigatorio: true }", "{ padrao: true, obrigatorio: true }");

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
