// Propósito: o aviso de pendência de estouro (descontar ou dispensar) passa a ser um componente único
//   (viaPendenciaAviso) usado em três pontos: Nova solicitação, Editar (solicitação em Em Approvals, só admin)
//   e o modal "Agendar transferência no Flash" — onde o valor liberado passa a existir nas solicitações
//   abertas pelo próprio colaborador. Sem valor liberado informado, nada é decidido (a pendência segue aberta).
// Entrada: public/app.js. Saída: public/app.js editado. Uso: node scripts/2026-10-06_viaticos_pendencia_aprovacao_front.js
const fs = require('fs'), path = require('path');
const arq = path.join(__dirname, '..', 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('não achado: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
const trecho = (ini, fim, novo, incluirFim = false) => {
  const a = s.indexOf(ini); const b = a < 0 ? -1 : s.indexOf(fim, a);
  if (a < 0 || b < 0) throw new Error('marcadores não achados: ' + ini.slice(0, 60));
  s = s.slice(0, a) + novo + s.slice(incluirFim ? b + fim.length : b);
};

// ---- componente ----
troca('async function formSolicitacao(existing) {',
`// Aviso de pendência de estouro de viagem anterior, com a decisão de descontar do valor liberado ou dispensar.
// Usado onde o valor liberado é definido: nova solicitação, edição (Em Approvals) e agendamento da transferência.
//   opts.padrao: true = "Sim" já marcado (nova solicitação); null = nenhuma escolha ainda.
//   opts.obrigatorio: exige escolher quando há valor liberado informado.
// Devolve o estado; \`resolver(valorDigitado)\` diz o que fazer ao salvar. Sem valor liberado informado, nada é
// decidido e a pendência continua em aberto (o desconto só faz sentido quando existe valor a descontar).
async function viaPendenciaAviso(box, colabId, liberadoEl, opts = {}) {
  const est = { ativo: false, ids: [], total: 0, aplicar: opts.padrao === undefined ? null : opts.padrao };
  est.resolver = digitado => {
    if (!est.ativo) return { decisao: null, liquido: digitado };
    const base = { ids: est.ids, total: est.total };
    if (!(digitado > 0) && est.aplicar !== false) return { ...base, decisao: null, liquido: digitado };
    if (est.aplicar === null) {
      return opts.obrigatorio
        ? { erro: \`Decida sobre a pendência de \${brl(est.total)}: descontar do valor liberado ou não.\` }
        : { ...base, decisao: null, liquido: digitado };
    }
    if (est.aplicar) return { ...base, decisao: 'descontar', liquido: Math.max(0, digitado - est.total) };
    return { ...base, decisao: 'dispensar', liquido: digitado };
  };
  box.innerHTML = '';
  let r;
  try { r = await api(\`/api/viaticos/colaboradores/\${colabId}/pendencia\`); } catch { return est; }
  if (!(r.total > 0)) return est;
  est.ativo = true; est.ids = r.solicitacoes.map(x => x.id); est.total = r.total;
  box.innerHTML = \`<div class="alert-item warn" style="margin-bottom:12px">⚠️ Este colaborador tem <strong>\${brl(r.total)}</strong> em pendência de viagem(ns) anterior(es) ainda não descontada.
      <div style="margin-top:8px; display:flex; align-items:center; gap:10px">
        <span style="font-size:13px">Descontar do valor liberado\${opts.obrigatorio ? ' nesta transferência' : ' nesta solicitação'}?</span>
        <button type="button" class="btn sm" data-vp-sim>Sim</button>
        <button type="button" class="btn sm" data-vp-nao>Não</button>
      </div>
      <div style="margin-top:6px; font-size:12.5px; color:var(--ink-2)">A decisão é tomada agora: ao salvar, a pendência é encerrada nas duas opções e este aviso não aparece mais.</div>
      <div data-vp-prev style="margin-top:8px; font-size:13px; font-weight:600"></div></div>\`;
  const sim = box.querySelector('[data-vp-sim]'), nao = box.querySelector('[data-vp-nao]'), prev = box.querySelector('[data-vp-prev]');
  // Só mostramos a prévia do líquido; o valor digitado não é alterado (a dedução é aplicada ao salvar).
  const atualizar = () => {
    sim.classList.toggle('primary', est.aplicar === true); nao.classList.toggle('primary', est.aplicar === false);
    const digitado = Number((liberadoEl && liberadoEl.value) || 0);
    prev.innerHTML = est.aplicar === null
      ? 'Escolha uma opção — enquanto não escolher, a pendência continua em aberto.'
      : est.aplicar === false
        ? \`➡️ A pendência de <strong>\${brl(est.total)}</strong> NÃO será descontada e será encerrada — não aparecerá em próximas solicitações. Valor liberado: <strong>\${brl(digitado)}</strong>.\`
        : !(digitado > 0)
          ? '⏳ Sem valor liberado informado ainda: a pendência continua em aberto até você registrar o valor.'
          : \`✅ Será descontado <strong>\${brl(est.total)}</strong> no envio. Valor líquido a liberar: <strong>\${brl(Math.max(0, digitado - est.total))}</strong> (digitado: \${brl(digitado)}).\` +
            (digitado < est.total ? \` <span style="color:#B23A2F">O valor liberado é menor que a pendência: a diferença de \${brl(est.total - digitado)} não será cobrada depois.</span>\` : '');
  };
  sim.onclick = () => { est.aplicar = true; atualizar(); };
  nao.onclick = () => { est.aplicar = false; atualizar(); };
  if (liberadoEl) liberadoEl.addEventListener('input', atualizar);
  atualizar();
  return est;
}

async function formSolicitacao(existing) {`);

// ---- salvar (nova solicitação / edição) ----
trecho('        // Pendência de viagem(ns) anterior(es): aplica o desconto de verdade (e não',
       '        try {\n          if (isEdit) await api(`/api/viaticos/solicitacoes/${existing.id}`',
`        // Pendência de viagem(ns) anterior(es): a decisão (descontar ou dispensar) é aplicada de verdade
        // — e não só na tela — e registrada no log de auditoria.
        if (pend && pend.ativo) {
          const dec = pend.resolver(b.valor_liberado);
          if (dec.erro) return modalError(dec.erro);
          if (dec.decisao) {
            b.pendencia_info = { valor: dec.total, decisao: dec.decisao, ids: dec.ids };
            b.pendencia_ids = dec.ids; b.pendencia_decisao = dec.decisao;
            b.valor_liberado = dec.liquido;
          }
        }
`);

// ---- verificação ao trocar de colaborador ----
trecho('  // Auto-preenche o tier ao trocar de colaborador, e checa pendência de estouro anterior.',
       '  $(\'#vs-colab\').onchange = checarPendencia;\n  checarPendencia();\n}',
`  // Auto-preenche o tier ao trocar de colaborador, e checa pendência de estouro anterior.
  // Na edição, a decisão cabe ao administrador e só enquanto a solicitação está em Em Approvals
  // (antes de o dinheiro sair) e para o mesmo colaborador — é o caso das solicitações abertas pelo
  // próprio colaborador, que nunca passaram pelo aviso da criação.
  const checarPendencia = async () => {
    const colabId = Number($('#vs-colab').value);
    const colab = colaboradores.find(c => c.id === colabId);
    if (colab && !isEdit) $('#vs-tier').value = colab.tier;
    const alerta = $('#vs-pendencia-alerta');
    if (!alerta) return;
    alerta.innerHTML = ''; pend = null;
    if (isEdit && !(USER.role === 'admin' && existing.status === 'em_approvals' && colabId === existing.colaborador_id)) return;
    pend = await viaPendenciaAviso(alerta, colabId, $('#vs-liberado'), { padrao: isEdit ? null : true });
  };
`, false);
troca("  $('#vs-colab').onchange = checarPendencia;\n  checarPendencia();\n}", "  $('#vs-colab').onchange = checarPendencia;\n  checarPendencia();\n}");
troca("  const isEdit = !!existing;\n  const colabAtual = existing ?", "  const isEdit = !!existing;\n  let pend = null;\n  const colabAtual = existing ?");

// ---- agendar transferência ----
troca("    const aplicarStatus = async (novo, valorLiberado) => {\n      const payload = { status: novo };\n      if (valorLiberado !== undefined) payload.valor_liberado = valorLiberado;",
      "    const aplicarStatus = async (novo, valorLiberado, extra) => {\n      const payload = { status: novo };\n      if (valorLiberado !== undefined) payload.valor_liberado = valorLiberado;\n      if (extra) Object.assign(payload, extra);");
troca("        toast(valorLiberado !== undefined ? 'Transferência agendada e valor liberado registrado.' : 'Status atualizado.');",
      "        toast(extra ? 'Transferência agendada, valor liberado registrado e pendência encerrada.' : valorLiberado !== undefined ? 'Transferência agendada e valor liberado registrado.' : 'Status atualizado.');");
troca(`        return openModal('Agendar transferência no Flash', \`
          <p style="font-size:13.5px; color:var(--ink-2)">A solicitação pede <strong>\${brl(solicitado)}</strong>.
          Informe quanto foi efetivamente transferido no Flash — é esse valor que será comparado com a comprovação.</p>
          <div class="field">\${fld('vs-lib-novo', 'Valor liberado no Flash', 'number', solicitado || '', 'step="0.01" min="0"')}</div>`,
`        let pendAg = { resolver: v => ({ decisao: null, liquido: v }) };
        openModal('Agendar transferência no Flash', \`
          <p style="font-size:13.5px; color:var(--ink-2)">A solicitação pede <strong>\${brl(solicitado)}</strong>.
          Informe quanto foi efetivamente transferido no Flash — é esse valor que será comparado com a comprovação.</p>
          <div id="vp-box"></div>
          <div class="field">\${fld('vs-lib-novo', 'Valor liberado no Flash', 'number', solicitado || '', 'step="0.01" min="0"')}</div>`);
troca(`             const v = Number($('#vs-lib-novo').value);
             if (!isFinite(v) || v < 0) return toast('Informe um valor válido.');
             closeModal(); aplicarStatus(novo, v);
           } }]);
      }`,
`             const v = Number($('#vs-lib-novo').value);
             if (!isFinite(v) || v < 0) return toast('Informe um valor válido.');
             const dec = pendAg.resolver(v);
             if (dec.erro) return modalError(dec.erro);
             closeModal();
             if (dec.decisao) {
               aplicarStatus(novo, dec.liquido, { pendencia_ids: dec.ids, pendencia_decisao: dec.decisao,
                 pendencia_info: { valor: dec.total, decisao: dec.decisao, ids: dec.ids } });
             } else aplicarStatus(novo, v);
           } }]);
        viaPendenciaAviso($('#vp-box'), s.colaborador_id, $('#vs-lib-novo'), { padrao: null, obrigatorio: true }).then(e => { pendAg = e; });
        return;
      }`);
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
