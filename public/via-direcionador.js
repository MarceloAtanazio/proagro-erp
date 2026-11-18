/* ============================================================
   DIRECIONADOR DE MOBILIDADE (BETA) — Viáticos > solicitar viagem > etapa Transporte.
   Compara Carro próprio × Carro locado com os dados da própria solicitação e indica a opção mais econômica:
   · próprio  = quilometragem × reembolso por km + combustível (km ÷ consumo próprio × preço);
   · locado   = diárias (nº de diárias × diária, ou o valor cotado na locadora) + extras da locação + combustível (km ÷ consumo do locado × preço);
   · km de equilíbrio = onde as duas opções custam o mesmo (abaixo dele o próprio compensa; acima, o locado);
   · "sem carro disponível para locação" força o carro próprio.
   Só aparece para o super administrador (USER.is_super), para testes antes de liberar a todos. O cálculo (viaDirecionadorCalc e viaDirecionadorResumo) é puro e
   testável no Node; a parte de tela usa as globais de app.js (VIA_WIZ, USER, fld, esc, brl, toast, $).
   ============================================================ */
(function () {
  const num = v => {
    if (v === null || v === undefined || v === '') return 0;
    let s = String(v).trim();
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s); return isFinite(n) ? n : 0;
  };
  const dMs = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
  const moeda = v => 'R$ ' + (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const kmFmt = v => (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const dia = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };

  // p = { ini, fim, diasManual, km, diaria, cotado, semcarro, taxa, consProp, consLoc, preco, extras }
  function viaDirecionadorCalc(p) {
    const ini = dMs(p.ini), fim = dMs(p.fim);
    const manual = Math.round(num(p.diasManual));
    const dias = manual > 0 ? manual : (isFinite(ini) && isFinite(fim) && fim >= ini ? Math.round((fim - ini) / 86400000) + 1 : 0);   // sem ajuste manual: início e fim inclusos
    const km = num(p.km), taxa = num(p.taxa), cp = num(p.consProp), cl = num(p.consLoc), preco = num(p.preco), extras = num(p.extras), diaria = num(p.diaria), cotado = num(p.cotado);
    const semcarro = !!p.semcarro;
    const locBase = cotado > 0 ? cotado : diaria * dias;
    const temLocacao = cotado > 0 || (diaria > 0 && dias > 0);
    const pronto = km > 0 && (semcarro || temLocacao);
    const proprio = { reembolso: km * taxa, combustivel: cp > 0 && preco > 0 ? (km / cp) * preco : 0 };
    proprio.total = proprio.reembolso + proprio.combustivel;
    const locado = { diarias: locBase, extras, combustivel: cl > 0 && preco > 0 ? (km / cl) * preco : 0, porCotacao: cotado > 0 };
    locado.total = locado.diarias + locado.extras + locado.combustivel;
    const porKmProp = taxa + (cp > 0 && preco > 0 ? preco / cp : 0), porKmLoc = cl > 0 && preco > 0 ? preco / cl : 0, den = porKmProp - porKmLoc;
    const kmEq = !semcarro && temLocacao && den > 0 ? (locBase + extras) / den : null;
    const indicada = !pronto ? null : semcarro ? 'proprio' : (proprio.total <= locado.total ? 'proprio' : 'locado');
    const economia = pronto && !semcarro ? Math.abs(locado.total - proprio.total) : null;
    const maior = Math.max(proprio.total, locado.total);
    return { pronto, dias, km, semcarro, temLocacao, proprio, locado, indicada, economia, economiaPct: economia != null && maior > 0 ? (economia / maior) * 100 : null,
      kmEq, kmDia: dias > 0 ? km / dias : 0, taxa, locBase };
  }

  function viaDirecionadorResumo(r, p) {
    if (!r.pronto) return 'Preencha datas, diária (ou valor cotado) e quilometragem para gerar o resumo.';
    const linhas = [`Direcionador de mobilidade — viagem de ${dia(p.ini)} a ${dia(p.fim)} (${r.dias} dia${r.dias === 1 ? '' : 's'}), ${kmFmt(r.km)} km no total.`];
    linhas.push(`• Carro próprio: ${moeda(r.proprio.total)} (reembolso de ${kmFmt(r.km)} km × ${moeda(r.taxa)} = ${moeda(r.proprio.reembolso)}; combustível ${moeda(r.proprio.combustivel)}).`);
    if (r.semcarro) linhas.push('• Carro locado: indisponível (nenhuma categoria disponível para locação na locadora).');
    else linhas.push(`• Carro locado: ${moeda(r.locado.total)} (${r.locado.porCotacao ? 'valor cotado na locadora' : `${r.dias} diária${r.dias === 1 ? '' : 's'}`} ${moeda(r.locado.diarias)}; extras ${moeda(r.locado.extras)}; combustível ${moeda(r.locado.combustivel)}).`);
    linhas.push(r.semcarro ? '• Opção indicada: carro próprio, por não haver carro disponível para locação.'
      : `• Opção indicada: ${r.indicada === 'proprio' ? 'carro próprio' : 'carro locado'}, com economia de ${moeda(r.economia)}${r.economiaPct != null ? ` (${r.economiaPct.toFixed(1).replace('.', ',')}%)` : ''}.`);
    if (r.kmEq != null) linhas.push(`• Quilometragem de equilíbrio: ${kmFmt(r.kmEq)} km (abaixo disso o carro próprio compensa; acima, o locado). Média desta viagem: ${kmFmt(r.kmDia)} km por dia.`);
    return linhas.join('\n');
  }

  // ---------------- tela (usa as globais de app.js) ----------------
  const beta = () => typeof USER !== 'undefined' && USER && USER.is_super === true;
  function estadoInicial() {
    const w = VIA_WIZ, t = w.transporte || {}, a0 = (t.alugueis || [])[0] || {}, rota = t.carro_proprio_rota || {};
    return { ini: w.data_inicio, fim: w.data_fim, diaria: a0.valor_diaria || '', cotado: '', semcarro: false, km: rota.distancia_km || a0.distancia_km || '',
      taxa: w.km_taxa != null ? w.km_taxa : 0.7, consProp: (w.colab && w.colab.veiculo_consumo_kml) || 10, consLoc: typeof VIA_CONSUMO_ALUGUEL_KML !== 'undefined' ? VIA_CONSUMO_ALUGUEL_KML : 10,
      preco: w.preco_combustivel || '', extras: '', diasManual: '' };
  }
  function viaDirecionadorHtml() {
    if (!beta()) return '';
    const v = VIA_WIZ.dm || (VIA_WIZ.dm = estadoInicial());
    return `<div class="card via-dir" id="via-dir">
      <div class="via-dir-cab"><h3>🧭 Direcionador de mobilidade</h3><span class="badge warn">BETA · só para você</span><span class="spacer"></span><button class="btn sm" id="dm-puxar" type="button" title="Preenche de novo com a data, a diária e a distância já informadas nesta solicitação">↻ Puxar dados da solicitação</button></div>
      <p class="hint" style="margin:2px 0 12px">Carro próprio ou carro locado? Preencha os dados da viagem e veja a opção mais econômica.</p>
      <div class="via-dir-grid">
        <div class="via-dir-in">
          <div class="form-row">${fld('dm-ini', 'Data inicial', 'date', v.ini)}${fld('dm-fim', 'Data final', 'date', v.fim)}</div>
          <div class="form-row">${fld('dm-diaria', 'Custo da diária (R$)', 'text', v.diaria, 'inputmode="decimal" placeholder="0,00"')}${fld('dm-cotado', 'Valor cotado na locadora (R$)', 'text', v.cotado, 'inputmode="decimal" placeholder="Total do período, se tiver"')}</div>
          <label class="check-chip" style="margin:2px 0 10px"><input type="checkbox" id="dm-semcarro" ${v.semcarro ? 'checked' : ''}> Sem carro disponível para locação (nenhuma categoria)</label>
          <div class="form-row">${fld('dm-km', 'Quilometragem total (km)', 'number', v.km, 'step="0.1" min="0"')}</div>
          <p class="hint" style="margin:-4px 0 8px">Ida, volta e deslocamentos entre propriedades.</p>
          <details class="via-dir-par"><summary>Parâmetros (definidos pela gestão)</summary>
            <div class="form-row">${fld('dm-taxa', 'Reembolso carro próprio (R$/km)', 'number', v.taxa, 'step="0.01" min="0"')}${fld('dm-preco', 'Preço do combustível (R$/litro)', 'number', v.preco, 'step="0.01" min="0"')}</div>
            <div class="form-row">${fld('dm-cprop', 'Consumo do carro próprio (km/litro)', 'number', v.consProp, 'step="0.1" min="0"')}${fld('dm-cloc', 'Consumo do carro locado (km/litro)', 'number', v.consLoc, 'step="0.1" min="0"')}</div>
            <div class="form-row">${fld('dm-extras', 'Extras da locação (R$ total)', 'text', v.extras, 'inputmode="decimal" placeholder="Proteção, taxa de devolução, lavagem…"')}${fld('dm-dias', 'Diárias (ajuste manual)', 'number', v.diasManual, 'step="1" min="0" placeholder="Vazio = conta início e fim inclusos"')}</div>
          </details>
        </div>
        <div class="via-dir-out" id="dm-res"></div>
      </div>
    </div>`;
  }
  const CAMPOS = { 'dm-ini': 'ini', 'dm-fim': 'fim', 'dm-diaria': 'diaria', 'dm-cotado': 'cotado', 'dm-km': 'km', 'dm-taxa': 'taxa', 'dm-preco': 'preco', 'dm-cprop': 'consProp', 'dm-cloc': 'consLoc', 'dm-extras': 'extras', 'dm-dias': 'diasManual' };
  function desenha() {
    const v = VIA_WIZ.dm, r = viaDirecionadorCalc(v), box = $('#dm-res'); if (!box) return;
    if (!r.pronto) { box.innerHTML = '<div class="dm-espera"><b>Aguardando dados</b><span>Preencha datas, diária (ou valor cotado) e quilometragem.</span></div>'; return; }
    const ind = r.indicada, maior = Math.max(r.proprio.total, r.locado.total) || 1;
    const linha = (rot, val) => `<div><span>${rot}</span><b>${moeda(val)}</b></div>`;
    const opc = (id, titulo, linhas, total, indisponivel) => `<div class="dm-opc${ind === id ? ' ind' : ''}${indisponivel ? ' off' : ''}"><h5>${titulo}${ind === id ? ' <em>✓ indicada</em>' : ''}</h5>
      ${indisponivel ? '<p class="dm-indisp">Indisponível: sem carro para locação.</p>' : `${linhas}<div class="dm-barra"><i style="width:${(total / maior * 100).toFixed(1)}%"></i></div><div class="dm-total"><span>Total</span><b>${moeda(total)}</b></div>`}</div>`;
    box.innerHTML = `
      <div class="dm-banner ${ind}">${r.semcarro ? '🚙 Sem carro para locação: o <b>carro próprio</b> é a única opção.' : `${ind === 'proprio' ? '🚙' : '🚗'} Compensa mais o <b>carro ${ind === 'proprio' ? 'próprio' : 'locado'}</b>: economia de <b>${moeda(r.economia)}</b>${r.economiaPct != null ? ` (${r.economiaPct.toFixed(1).replace('.', ',')}%)` : ''}.`}</div>
      <div class="dm-comp">
        ${opc('proprio', '🚗 Carro próprio', `<div><span>Quilometragem</span><b>${kmFmt(r.km)} km</b></div>${linha(`Reembolso (${moeda(r.taxa)}/km)`, r.proprio.reembolso)}${linha('Combustível', r.proprio.combustivel)}`, r.proprio.total, false)}
        ${opc('locado', '🔑 Carro locado', `${linha(r.locado.porCotacao ? 'Valor cotado' : `Diárias (${r.dias})`, r.locado.diarias)}${linha('Extras', r.locado.extras)}${linha('Combustível', r.locado.combustivel)}`, r.locado.total, r.semcarro)}
      </div>
      <div class="dm-ind">
        <div><span>Economia da opção indicada</span><b>${r.economia != null ? moeda(r.economia) : '—'}</b></div>
        <div title="Quilometragem em que as duas opções custam o mesmo: abaixo dela o carro próprio compensa; acima, o locado."><span>Quilometragem de equilíbrio</span><b>${r.kmEq != null ? kmFmt(r.kmEq) + ' km' : '—'}</b></div>
        <div><span>Média de km por dia</span><b>${kmFmt(r.kmDia)} km</b></div>
      </div>
      <div class="dm-resumo"><label for="dm-resumo-txt">Resumo para enviar à coordenação</label><textarea id="dm-resumo-txt" rows="6" readonly>${(typeof esc === 'function' ? esc : x => x)(viaDirecionadorResumo(r, v))}</textarea>
        <div class="dm-acoes"><button class="btn sm" id="dm-copiar" type="button">📋 Copiar resumo</button><button class="btn sm primary" id="dm-usar" type="button">Usar a opção indicada na solicitação</button></div></div>`;
    $('#dm-copiar').onclick = async () => { const t = viaDirecionadorResumo(r, v); try { await navigator.clipboard.writeText(t); toast('Resumo copiado.'); } catch (e) { $('#dm-resumo-txt').select(); toast('Selecione e copie o resumo (Ctrl+C).'); } };
    $('#dm-usar').onclick = () => {
      const marca = (id, on) => { const el = $('#' + id); if (el && el.checked !== on) el.click(); return el; };
      if (ind === 'proprio') { marca('w3-aluguel', false); const el = marca('w3-proprio', true); if (el && !el.checked) toast('O carro próprio não pôde ser marcado: confira a documentação do colaborador (CNH, CRLV e seguro).'); else toast('Carro próprio marcado na solicitação.'); }
      else { marca('w3-proprio', false); const el = marca('w3-aluguel', true); if (el && !el.checked) toast('O aluguel de carro não pôde ser marcado: confira a documentação do colaborador.'); else toast('Aluguel de carro marcado na solicitação.'); }
    };
  }
  function viaDirecionadorLigar() {
    if (!beta() || !$('#via-dir')) return;
    const le = () => { const v = VIA_WIZ.dm; Object.entries(CAMPOS).forEach(([id, k]) => { const el = $('#' + id); if (el) v[k] = el.value; }); v.semcarro = !!$('#dm-semcarro').checked; };
    Object.keys(CAMPOS).concat(['dm-semcarro']).forEach(id => { const el = $('#' + id); if (el) el.addEventListener('input', () => { le(); desenha(); }); });
    $('#dm-puxar').onclick = () => { const sem = VIA_WIZ.dm.semcarro; VIA_WIZ.dm = estadoInicial(); VIA_WIZ.dm.semcarro = sem; $('#via-dir').outerHTML = viaDirecionadorHtml(); viaDirecionadorLigar(); toast('Dados puxados da solicitação.'); };
    desenha();
  }
  if (typeof window !== 'undefined') {
    window.viaDirecionadorHtml = viaDirecionadorHtml; window.viaDirecionadorLigar = viaDirecionadorLigar;
    window.viaDirecionadorCalc = viaDirecionadorCalc; window.viaDirecionadorResumo = viaDirecionadorResumo;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { viaDirecionadorCalc, viaDirecionadorResumo };
})();
