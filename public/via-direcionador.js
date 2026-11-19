/* ============================================================
   DIRECIONADOR DE MOBILIDADE (BETA) — Viáticos > solicitar viagem > etapa Transporte.
   Compara Carro próprio × Carro locado com os dados da própria solicitação e indica a opção mais econômica:
   · próprio  = quilometragem × reembolso por km + combustível (km ÷ consumo do veículo do colaborador × preço);
   · locado   = diárias (nº de diárias × diária informada, contando início e fim) + extras + combustível (km ÷ consumo do locado × preço);
   · km de equilíbrio = onde as duas opções custam o mesmo (abaixo dele o próprio compensa; acima, o locado);
   · "sem carro disponível para locação" força o carro próprio.
   O que a pessoa informa: a diária (com a evidência anexada ao lado: print ou cotação) e se não há carro disponível. Todo o resto vem sozinho e NÃO aparece para ela:
   km pela rota dos municípios da solicitação (viaCalcularRota: ida, paradas e volta ao ponto de partida), datas da solicitação, consumo do veículo do cadastro do colaborador, reembolso por
   km e preço do combustível da configuração de Viáticos, consumo do locado e extras fixos.
   Só aparece para o super administrador (USER.is_super), para testes antes de liberar a todos. O cálculo (viaDirecionadorCalc, viaDirecionadorResumo, viaDirecionadorSnapshot) é puro e
   testável no Node; a parte de tela usa as globais de app.js (VIA_WIZ, USER, viaCalcularRota, viaPontoPartida, fld, esc, brl, api, toast, openModal, openAttachments, $).
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

  // Retrato do que o direcionador concluiu, gravado junto da solicitação (transporte_detalhes.direcionador) para a coordenação ver depois; a evidência vai como anexo.
  function viaDirecionadorSnapshot(r, p, evidenciaNome, quando, kmFonte) {
    if (!r || !r.pronto) return null;
    return { indicada: r.indicada, sem_carro: !!r.semcarro, km: Number(r.km.toFixed(1)), km_fonte: kmFonte === 'manual' ? 'manual' : 'auto', dias: r.dias, diaria: num(p.diaria), proprio_total: Number(r.proprio.total.toFixed(2)),
      locado_total: r.semcarro ? null : Number(r.locado.total.toFixed(2)), economia: r.economia != null ? Number(r.economia.toFixed(2)) : null, km_equilibrio: r.kmEq != null ? Number(r.kmEq.toFixed(1)) : null,
      evidencia: !!evidenciaNome, evidencia_nome: evidenciaNome || null, calculado_em: quando || new Date().toISOString() };
  }

  // ---------------- tela (usa as globais de app.js) ----------------
  const beta = () => typeof USER !== 'undefined' && USER && USER.is_super === true;
  const TIPOS_EVID = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], MAX_EVID = 3 * 1024 * 1024;
  let tokenKm = 0;
  function parametros() {
    const w = VIA_WIZ;
    return { taxa: w.km_taxa != null ? num(w.km_taxa) : 0.7, preco: num(w.preco_combustivel), consProp: num(w.colab && w.colab.veiculo_consumo_kml),
      consLoc: typeof VIA_CONSUMO_ALUGUEL_KML !== 'undefined' ? VIA_CONSUMO_ALUGUEL_KML : 10, extras: 0 };
  }
  function faltas() {
    const q = parametros(), f = [];
    if (!(q.consProp > 0)) f.push('o consumo (km/L) do veículo do colaborador não está no cadastro dele');
    if (!(q.preco > 0)) f.push('o preço do combustível ainda não foi configurado (Viáticos > Configurações)');
    return f;
  }
  const chaveRota = () => { const w = VIA_WIZ, pp = typeof viaPontoPartida === 'function' ? viaPontoPartida(w) : {}; return JSON.stringify([pp.uf, pp.municipio, (w.destinos || []).map(d => [d.uf, d.municipio, d.endereco || ''])]); };
  const entrada = () => { const w = VIA_WIZ, v = w.dm, q = parametros(); return { ini: w.data_inicio, fim: w.data_fim, diasManual: '', km: v.km, diaria: v.diaria, cotado: '', semcarro: v.semcarro, taxa: q.taxa, consProp: q.consProp, consLoc: q.consLoc, preco: q.preco, extras: q.extras }; };
  const estadoInicial = () => ({ diaria: '', semcarro: false, km: '', kmFonte: '', kmChave: '', kmMsg: '', evidencia: null });

  function viaDirecionadorHtml() {
    if (!beta()) return '';
    const v = VIA_WIZ.dm || (VIA_WIZ.dm = estadoInicial());
    return `<div class="card via-dir" id="via-dir">
      <div class="via-dir-cab"><h3>🧭 Direcionador de mobilidade</h3><span class="badge warn">BETA · só para você</span></div>
      <p class="hint" style="margin:2px 0 12px">Carro próprio ou carro locado? A distância vem sozinha, pela rota dos municípios desta solicitação. Informe só a diária cotada e anexe a evidência.</p>
      <div class="via-dir-grid">
        <div class="via-dir-in">
          <div class="dm-info" id="dm-periodo"></div>
          <div class="dm-kmbox" id="dm-kmbox"></div>
          <div class="dm-diaria-row">
            <div class="field"><label for="dm-diaria">Custo da diária do carro locado (R$)</label><input id="dm-diaria" type="text" inputmode="decimal" placeholder="0,00" value="${esc(v.diaria)}"></div>
            <div class="field"><label for="dm-evid">Evidência (print ou cotação)</label>
              <div class="dm-anexo"><label class="btn sm" for="dm-evid">📎 Anexar</label><input id="dm-evid" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden><span id="dm-evid-nome" class="dm-evid-nome"></span></div></div>
          </div>
          <label class="check-chip" style="margin:4px 0 6px"><input type="checkbox" id="dm-semcarro" ${v.semcarro ? 'checked' : ''}> Sem carro disponível para locação (nenhuma categoria)</label>
          <div id="dm-aviso"></div>
        </div>
        <div class="via-dir-out" id="dm-res"></div>
      </div>
    </div>`;
  }

  function desenhaEntrada() {
    const w = VIA_WIZ, v = w.dm, ini = dMs(w.data_inicio), fim = dMs(w.data_fim);
    const dias = isFinite(ini) && isFinite(fim) && fim >= ini ? Math.round((fim - ini) / 86400000) + 1 : 0;
    $('#dm-periodo').innerHTML = `📅 Período da solicitação: <b>${dia(w.data_inicio)}</b> a <b>${dia(w.data_fim)}</b> (${dias} dia${dias === 1 ? '' : 's'}, início e fim inclusos)`;
    const box = $('#dm-kmbox');
    const botoes = '<button type="button" class="btn sm" id="dm-recalc">↻ Recalcular rota</button>';
    if (v.kmFonte === 'calculando') box.innerHTML = '<div class="dm-km calc">⏳ Calculando a distância pela rota dos municípios…</div>';
    else if (v.kmFonte === 'auto') box.innerHTML = `<div class="dm-km ok">📍 <b>${kmFmt(num(v.km))} km</b> pela rota dos municípios da solicitação (ida, paradas e volta ao ponto de partida).<div class="dm-km-acoes">${botoes}</div></div>`;
    else box.innerHTML = `<div class="dm-km erro">⚠️ ${esc(v.kmMsg || 'Não foi possível calcular a distância.')}<div class="field" style="margin-top:8px"><label for="dm-km">Quilometragem total (km)</label><input id="dm-km" type="number" step="0.1" min="0" value="${esc(v.km)}"></div><div class="dm-km-acoes"><button type="button" class="btn sm" id="dm-recalc">↻ Tentar de novo</button></div></div>`;
    const rc = $('#dm-recalc'); if (rc) rc.onclick = () => calcularKm(true);
    const ki = $('#dm-km'); if (ki) ki.oninput = () => { v.km = ki.value; desenha(); };
    const nome = $('#dm-evid-nome');
    nome.innerHTML = v.evidencia ? `<span class="dm-chip">📄 ${esc(v.evidencia.name)}<button type="button" id="dm-evid-x" title="Remover a evidência" aria-label="Remover a evidência">✕</button></span>` : '<span class="dm-sem">nenhum arquivo</span>';
    const x = $('#dm-evid-x'); if (x) x.onclick = () => { v.evidencia = null; $('#dm-evid').value = ''; desenhaEntrada(); desenha(); };
    const falta = faltas(), av = $('#dm-aviso'), pedeEvid = (num(v.diaria) > 0 || v.semcarro) && !v.evidencia;
    av.innerHTML = (falta.length ? `<div class="alert-item late">⚠️ Não dá para calcular: ${esc(falta.join('; '))}.</div>` : '')
      + (pedeEvid ? `<div class="alert-item warn">📎 Anexe a evidência ${v.semcarro ? '(print da indisponibilidade de carro)' : '(print ou cotação da diária)'} para a coordenação conferir.</div>` : '');
  }

  // Distância pela rota dos municípios da solicitação; refaz só quando partida ou destinos mudam (ou a pessoa pede).
  async function calcularKm(forcar) {
    const w = VIA_WIZ, v = w.dm, chave = chaveRota();
    if (!forcar && v.kmChave === chave && v.kmFonte === 'auto') return;
    const meu = ++tokenKm;
    if (!(w.destinos || []).length) { v.kmFonte = 'erro'; v.kmMsg = 'A solicitação ainda não tem destinos: volte à etapa 2 e adicione os municípios.'; v.kmChave = chave; desenhaEntrada(); desenha(); return; }
    v.kmFonte = 'calculando'; desenhaEntrada();
    try {
      const r = await viaCalcularRota(viaPontoPartida(w), w.destinos);
      if (meu !== tokenKm || !$('#dm-kmbox')) return;
      v.km = r.total_km.toFixed(1); v.kmFonte = 'auto'; v.kmChave = chave; v.kmMsg = '';
    } catch (e) {
      if (meu !== tokenKm || !$('#dm-kmbox')) return;
      v.kmFonte = 'erro'; v.kmMsg = (e && e.message ? e.message : 'Não foi possível calcular a distância') + ' Informe a quilometragem à mão.'; v.kmChave = chave;
    }
    desenhaEntrada(); desenha();
  }

  function desenha() {
    const v = VIA_WIZ.dm, box = $('#dm-res'); if (!box) return;
    const p = entrada(), r = viaDirecionadorCalc(p);
    const falta = faltas();
    if (falta.length || !r.pronto) {
      box.innerHTML = `<div class="dm-espera"><b>${falta.length ? 'Faltam dados do cadastro' : v.kmFonte === 'calculando' ? 'Calculando…' : 'Aguardando dados'}</b><span>${falta.length ? esc(falta.join('; ')) + '.' : num(v.km) > 0 ? 'Informe o custo da diária (ou marque que não há carro disponível).' : 'Aguardando a distância da rota.'}</span></div>`;
      return;
    }
    const ind = r.indicada, maior = Math.max(r.proprio.total, r.locado.total) || 1;
    const linha = (rot, val) => `<div><span>${rot}</span><b>${moeda(val)}</b></div>`;
    const opc = (id, titulo, linhas, total, indisponivel) => `<div class="dm-opc${ind === id ? ' ind' : ''}${indisponivel ? ' off' : ''}"><h5>${titulo}${ind === id ? ' <em>✓ indicada</em>' : ''}</h5>
      ${indisponivel ? '<p class="dm-indisp">Indisponível: sem carro para locação.</p>' : `${linhas}<div class="dm-barra"><i style="width:${(total / maior * 100).toFixed(1)}%"></i></div><div class="dm-total"><span>Total</span><b>${moeda(total)}</b></div>`}</div>`;
    box.innerHTML = `
      <div class="dm-banner ${ind}">${r.semcarro ? '🚙 Sem carro para locação: o <b>carro próprio</b> é a única opção.' : `${ind === 'proprio' ? '🚙' : '🚗'} Compensa mais o <b>carro ${ind === 'proprio' ? 'próprio' : 'locado'}</b>: economia de <b>${moeda(r.economia)}</b>${r.economiaPct != null ? ` (${r.economiaPct.toFixed(1).replace('.', ',')}%)` : ''}.`}</div>
      <div class="dm-comp">
        ${opc('proprio', '🚗 Carro próprio', `<div><span>Quilometragem</span><b>${kmFmt(r.km)} km</b></div>${linha(`Reembolso (${moeda(r.taxa)}/km)`, r.proprio.reembolso)}${linha('Combustível', r.proprio.combustivel)}`, r.proprio.total, false)}
        ${opc('locado', '🔑 Carro locado', `${linha(`Diárias (${r.dias})`, r.locado.diarias)}${linha('Extras', r.locado.extras)}${linha('Combustível', r.locado.combustivel)}`, r.locado.total, r.semcarro)}
      </div>
      <div class="dm-ind">
        <div><span>Economia da opção indicada</span><b>${r.economia != null ? moeda(r.economia) : '—'}</b></div>
        <div title="Quilometragem em que as duas opções custam o mesmo: abaixo dela o carro próprio compensa; acima, o locado."><span>Quilometragem de equilíbrio</span><b>${r.kmEq != null ? kmFmt(r.kmEq) + ' km' : '—'}</b></div>
        <div><span>Média de km por dia</span><b>${kmFmt(r.kmDia)} km</b></div>
      </div>
      <div class="dm-acoes"><button class="btn sm primary" id="dm-usar" type="button">Usar a opção indicada na solicitação</button></div>`;
    $('#dm-usar').onclick = () => {
      const marca = (id, on) => { const el = $('#' + id); if (el && el.checked !== on) el.click(); return el; };
      if (ind === 'proprio') { marca('w3-aluguel', false); const el = marca('w3-proprio', true); toast(el && !el.checked ? 'O carro próprio não pôde ser marcado: confira a documentação do colaborador (CNH, CRLV e seguro).' : 'Carro próprio marcado na solicitação.'); }
      else { marca('w3-proprio', false); const el = marca('w3-aluguel', true); toast(el && !el.checked ? 'O aluguel de carro não pôde ser marcado: confira a documentação do colaborador.' : 'Aluguel de carro marcado na solicitação.'); }
    };
  }

  function lerArquivo(file) {
    return new Promise((ok, err) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = () => err(new Error('Não foi possível ler o arquivo.')); fr.readAsDataURL(file); });
  }
  function viaDirecionadorLigar() {
    if (!beta() || !$('#via-dir')) return;
    const v = VIA_WIZ.dm;
    $('#dm-diaria').addEventListener('input', e => { v.diaria = e.target.value; desenhaEntrada(); desenha(); });
    $('#dm-semcarro').addEventListener('change', e => { v.semcarro = e.target.checked; desenhaEntrada(); desenha(); });
    $('#dm-evid').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      if (!TIPOS_EVID.includes(f.type)) { e.target.value = ''; return toast('Formato não permitido: envie PDF, PNG, JPG ou WEBP.'); }
      if (f.size > MAX_EVID) { e.target.value = ''; return toast('Arquivo acima de 3 MB.'); }
      try { v.evidencia = { name: f.name, mime: f.type, size: f.size, data: await lerArquivo(f) }; } catch (err) { return toast(err.message); }
      desenhaEntrada();
    });
    desenhaEntrada(); desenha(); calcularKm(false);
  }

  // Antes de enviar a solicitação: grava o retrato do cálculo em transporte_detalhes.direcionador (sem o arquivo).
  function viaDirecionadorPreEnvio(w) {
    if (!beta() || !w.dm) return;
    const p = entrada(), snap = viaDirecionadorSnapshot(viaDirecionadorCalc(p), p, w.dm.evidencia && w.dm.evidencia.name, undefined, w.dm.kmFonte === 'auto' ? 'auto' : 'manual');
    if (snap) w.transporte.direcionador = snap; else delete w.transporte.direcionador;
  }
  // Depois de criada a solicitação: anexa a evidência a ela. Falha ao anexar não desfaz a solicitação: avisa.
  async function viaDirecionadorPosEnvio(w, solicitacaoId) {
    if (!beta() || !w.dm || !w.dm.evidencia || !solicitacaoId) return;
    const e = w.dm.evidencia;
    try { await api(`/api/attachments/viatico_cotacao/${solicitacaoId}`, { method: 'POST', body: { file_name: e.name, mime_type: e.mime, kind: 'outro', data: e.data } }); }
    catch (err) { toast('Solicitação enviada, mas a evidência não pôde ser anexada: ' + err.message); }
  }
  // Na tela da OT: o que o direcionador concluiu e a evidência anexada.
  function viaDirecionadorVer(s) {
    const d = s && s.transporte_detalhes && s.transporte_detalhes.direcionador; if (!d) return;
    openModal(`Direcionador de mobilidade — OT ${esc(s.ordem_trabalho || s.id)}`, `<p class="hint" style="margin-top:0">Cálculo feito no momento da solicitação (${d.calculado_em ? new Date(d.calculado_em).toLocaleString('pt-BR') : '—'}).</p>
      <div class="dm-ind" style="grid-template-columns:repeat(2,1fr)"><div><span>Indicada</span><b>${d.sem_carro ? 'Carro próprio (sem carro locado)' : d.indicada === 'locado' ? 'Carro locado' : 'Carro próprio'}</b></div><div><span>Economia</span><b>${d.economia != null ? brl(d.economia) : '—'}</b></div>
        <div><span>Carro próprio</span><b>${brl(d.proprio_total)}</b></div><div><span>Carro locado</span><b>${d.locado_total != null ? brl(d.locado_total) : '—'}</b></div>
        <div><span>Quilometragem</span><b>${kmFmt(d.km)} km${d.km_fonte === 'manual' ? ' (informada à mão)' : ''}</b></div><div><span>Diária informada</span><b>${d.diaria ? brl(d.diaria) : '—'}</b></div></div>
      <p style="font-size:13px;margin:10px 0 0">${d.evidencia ? `Evidência anexada: <b>${esc(d.evidencia_nome || '')}</b>.` : 'Nenhuma evidência foi anexada.'}</p>`,
      [{ label: 'Fechar', onClick: closeModal }, ...(d.evidencia ? [{ label: '📎 Ver evidência', cls: 'primary', onClick: () => openAttachments('viatico_cotacao', s.id, `Evidência — OT ${s.ordem_trabalho || s.id}`) }] : [])]);
  }
  // Imagem da evidência: dimensões naturais para caber no PDF sem distorcer.
  function medeImagem(url) { return new Promise(ok => { const im = new Image(); im.onload = () => ok({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => ok(null); im.src = url; }); }
  // Evidência já salva na OT (anexo viatico_cotacao), para regerar o PDF depois do envio. Devolve { name, mime, data } ou null.
  async function viaDirecionadorEvidenciaSalva(s) {
    try {
      const lista = await api('/api/attachments/viatico_cotacao/' + s.id); if (!lista || !lista.length) return null;
      const r = await api('/api/attachments/file/' + lista[0].id); return { name: r.file_name || lista[0].file_name, mime: r.mime_type, data: r.data };
    } catch (e) { return null; }
  }
  // Bloco do PDF da solicitação: comparativo + evidência. Devolve o novo y. Sem retrato do direcionador na OT (ou fora do beta na prévia), não desenha nada.
  async function viaDirecionadorPdf(doc, y, MARGIN, w, evid) {
    let d = w.transporte && w.transporte.direcionador;
    if (!d && beta() && w.dm) { const p = entrada(); d = viaDirecionadorSnapshot(viaDirecionadorCalc(p), p, w.dm.evidencia && w.dm.evidencia.name, undefined, w.dm.kmFonte === 'auto' ? 'auto' : 'manual'); }
    if (!d) return y;
    if (!evid && w.dm && w.dm.evidencia) evid = w.dm.evidencia;
    const VERDE = [0, 120, 63], VERDE_CLARO = [234, 245, 236], CINZA = [110, 120, 114], VERM = [180, 30, 30];
    const pageW = doc.internal.pageSize.getWidth(), util = pageW - MARGIN * 2;
    if (y > 200) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...VERDE); doc.text('Direcionador de mobilidade', MARGIN, y); y += 5;
    const ind = d.sem_carro ? 'Carro próprio (sem carro locado disponível)' : d.indicada === 'locado' ? 'Carro locado' : 'Carro próprio';
    const linhas = [
      ['Opção indicada', ind],
      ['Economia da opção indicada', d.economia != null ? brl(d.economia) : '—'],
      ['Carro próprio', brl(d.proprio_total)],
      ['Carro locado', d.locado_total != null ? brl(d.locado_total) + (d.diaria ? ' (diária informada: ' + brl(d.diaria) + ' x ' + d.dias + ' dia(s))' : '') : 'sem carro disponível para locação'],
      ['Quilometragem', kmFmt(d.km) + ' km' + (d.km_fonte === 'manual' ? ' — INFORMADA À MÃO (o cálculo automático da rota falhou)' : ' — calculada pela rota dos municípios')]
    ];
    doc.autoTable({ startY: y, margin: { left: MARGIN, right: MARGIN }, body: linhas, theme: 'grid', styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, textColor: [40, 46, 42] }, columnStyles: { 0: { fontStyle: 'bold', fillColor: VERDE_CLARO, cellWidth: 52 } } });
    y = doc.lastAutoTable.finalY + 6;
    const titulo = d.sem_carro ? 'Evidência da indisponibilidade de carro para locação' : 'Evidência da diária do carro locado (cotação)';
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...VERDE); doc.text(titulo, MARGIN, y); y += 5;
    const aviso = t => { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...VERM); doc.text(t, MARGIN, y); y += 8; };
    if (!evid || !evid.data) { aviso(d.evidencia ? 'Evidência anexada à OT, mas não pôde ser carregada para este PDF (' + (d.evidencia_nome || '') + ').' : 'SEM EVIDÊNCIA ANEXADA: o colaborador não anexou o print ou a cotação.'); return y + 4; }
    const mime = String(evid.mime || ''), fmt = /png/i.test(mime) ? 'PNG' : /jpe?g/i.test(mime) ? 'JPEG' : null;
    if (!fmt) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40, 46, 42); doc.text('Arquivo anexado (' + (evid.name || 'evidência') + ') não é imagem; abra o anexo na OT (botão Direcionador > Ver evidência).', MARGIN, y); return y + 10; }
    const url = 'data:' + mime + ';base64,' + evid.data, dim = await medeImagem(url);
    try {
      const maxW = util, maxH = 140; let iw = maxW, ih = dim ? maxW * dim.h / dim.w : 90; if (ih > maxH) { ih = maxH; iw = dim ? maxH * dim.w / dim.h : maxW; }
      if (y + ih > 285) { doc.addPage(); y = 20; }
      doc.setDrawColor(210, 218, 213); doc.rect(MARGIN, y, iw, ih); doc.addImage(url, fmt, MARGIN, y, iw, ih);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...CINZA); doc.text('Arquivo: ' + (evid.name || ''), MARGIN, y + ih + 4);
      return y + ih + 10;
    } catch (e) { aviso('Não foi possível inserir a imagem da evidência no PDF (' + (evid.name || '') + ').'); return y + 4; }
  }
  // Soma da economia apurada pelo direcionador nas OTs (sem as canceladas), no total e por colaborador. Só conta OT que tem o retrato gravado e economia positiva.
  function viaEconomiaDirecionador(sols) {
    const por = new Map(); let total = 0, ots = 0, comRetrato = 0;
    (sols || []).forEach(s => {
      const d = s && s.transporte_detalhes && s.transporte_detalhes.direcionador; if (!d || s.status === 'cancelada') return;
      comRetrato++;
      const e = Number(d.economia); if (!(e > 0)) return;
      total += e; ots++;
      const k = s.colaborador_id != null ? s.colaborador_id : s.colaborador_name; const l = por.get(k) || { nome: s.colaborador_name || '—', ots: 0, economia: 0 };
      l.ots++; l.economia += e; por.set(k, l);
    });
    return { total: Math.round(total * 100) / 100, ots, comRetrato, porColaborador: [...por.values()].sort((a, b) => b.economia - a.economia) };
  }
  if (typeof window !== 'undefined') {
    window.viaDirecionadorHtml = viaDirecionadorHtml; window.viaDirecionadorLigar = viaDirecionadorLigar; window.viaDirecionadorPreEnvio = viaDirecionadorPreEnvio;
    window.viaDirecionadorPosEnvio = viaDirecionadorPosEnvio; window.viaDirecionadorVer = viaDirecionadorVer;
    window.viaDirecionadorCalc = viaDirecionadorCalc; window.viaDirecionadorResumo = viaDirecionadorResumo; window.viaDirecionadorSnapshot = viaDirecionadorSnapshot; window.viaEconomiaDirecionador = viaEconomiaDirecionador; window.viaDirecionadorPdf = viaDirecionadorPdf; window.viaDirecionadorEvidenciaSalva = viaDirecionadorEvidenciaSalva;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { viaDirecionadorCalc, viaDirecionadorResumo, viaDirecionadorSnapshot, viaEconomiaDirecionador };
})();
