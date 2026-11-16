// Propósito: Suprimentos > Histórico do item: a coluna "Detalhe" (texto longo que quebrava as outras colunas, sobretudo com as observações de edição) vira um botão 👁 "Ver detalhes"
//   ao lado de Editar e Excluir. O botão abre uma janela com o lançamento completo (movimento, data, quantidade, custo unitário e total, fornecedor/NF/colaborador/status, observação
//   inteira, quem registrou e quando) e um "Voltar ao histórico". A coluna Ações agora aparece também para quem só consulta (só com o 👁). "Por" não quebra mais em várias linhas.
// Entrada: public/app.js (ou a pasta em argv[2]). Saída: arquivo editado. Uso: node scripts/2026-11-16_suprimentos_historico_detalhe_botao.js [raiz]
const fs = require('fs'), path = require('path');
const p = path.join(process.argv[2] || path.join(__dirname, '..'), 'public/app.js');
let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error('âncora não única/achada: ' + de.slice(0, 80)); s = s.replace(de, () => para); };
if (s.includes('supVerLancamento')) throw new Error('já aplicado');

troca('<th class="num">Custo un.</th><th>Detalhe</th><th>Por</th>${edit ? \'<th class="actions">Ações</th>\' : \'\'}</tr></thead>', '<th class="num">Custo un.</th><th>Por</th><th class="actions">Ações</th></tr></thead>');
troca("          <td>${det || '—'}${m.status ? ` <small style=\"color:var(--muted)\">(${m.status})</small>` : ''}</td>\n          <td><small>${esc(m.created_by_name || '—')}</small></td>\n          ${edit ? `<td class=\"actions sup-acoes\">${corrigivel ?",
  "          <td style=\"white-space:nowrap\"><small>${esc(m.created_by_name || '—')}</small></td>\n          <td class=\"actions sup-acoes\"><button class=\"btn-ic ok\" data-lcver=\"${m.id}\" title=\"Ver o detalhe deste lançamento\" aria-label=\"Ver detalhes\">👁</button>${edit ? `${corrigivel ?");
troca("aria-label=\"Excluir lançamento\">🗑</button>` : ''}</td>` : ''}\n        </tr>`;", "aria-label=\"Excluir lançamento\">🗑</button>` : ''}` : ''}</td>\n        </tr>`;");
troca("<tr><td colspan=\"${edit ? 7 : 6}\"><div class=\"empty\">Sem movimentações.</div></td></tr>`}</tbody>", "<tr><td colspan=\"6\"><div class=\"empty\">Sem movimentações.</div></td></tr>`}</tbody>");
troca("  const depois = async () => { closeModal(); const its = await api('/api/suprimentos/itens'); renderSuprimentos(); supHistorico(its.find(x => x.id === i.id) || i); };",
  "  const depois = async () => { closeModal(); const its = await api('/api/suprimentos/itens'); renderSuprimentos(); supHistorico(its.find(x => x.id === i.id) || i); };\n  document.querySelectorAll('[data-lcver]').forEach(b => b.onclick = () => supVerLancamento(i, movs.find(m => m.id == b.dataset.lcver), () => supHistorico(i)));");
troca("const SUP_ORIG_LANC = { compra: 'Compra', ajuste: 'Ajuste' };", `const SUP_ORIG_LANC = { compra: 'Compra', ajuste: 'Ajuste' };
// Detalhe completo de um lançamento do histórico (substitui a antiga coluna "Detalhe", que quebrava a tabela).
function supVerLancamento(i, m, voltar) {
  const ORIG = { compra: 'Compra', envio: 'Envio', ajuste: 'Ajuste', devolucao: 'Devolução' }, entrada = m.tipo === 'entrada';
  const linha = (rot, val) => val ? \`<div style="color:var(--muted)">\${rot}</div><div>\${val}</div>\` : '';
  const quando = m.created_at ? new Date(m.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '';
  openModal(\`Lançamento — \${esc(i.nome)}\`, \`
    <div style="display:grid; grid-template-columns:160px 1fr; gap:10px 16px; font-size:13.5px; line-height:1.45">
      \${linha('Movimento', \`<span class="badge \${entrada ? 'ok' : 'late'}">\${entrada ? '+ ' : '− '}\${ORIG[m.origem] || esc(m.origem)}</span>\${m.status ? \` <small style="color:var(--muted)">(\${esc(m.status)})</small>\` : ''}\`)}
      \${linha('Data', brDate(m.data))}
      \${linha('Quantidade', \`<strong>\${supNum(m.quantidade)} \${esc(i.unidade)}</strong>\`)}
      \${linha('Custo unitário', m.custo_unitario != null ? brl(m.custo_unitario) : '—')}
      \${linha('Valor total', m.valor_total != null ? brl(m.valor_total) : '')}
      \${linha('Fornecedor', esc(m.supplier_name || ''))}
      \${linha('Documento (NF)', esc(m.documento || ''))}
      \${linha('Colaborador', esc(m.colaborador_name || ''))}
      \${linha('Contas a Pagar', m.payable_id ? 'Título #' + m.payable_id : '')}
      \${linha('Observação', m.notes ? \`<span style="white-space:pre-wrap">\${esc(m.notes)}</span>\` : '—')}
      \${linha('Registrado por', esc(m.created_by_name || '—') + (quando ? \` em \${quando}\` : ''))}
    </div>\`,
    [{ label: 'Voltar ao histórico', onClick: voltar }]);
}`);
fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok');
