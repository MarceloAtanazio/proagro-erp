/* Viáticos > comprovação: "Anexar comprovantes da pasta".
   A pessoa escolhe uma pasta; o navegador lê cada comprovante (PDF digital pelo texto, PDF escaneado e imagem por OCR, tudo no próprio computador, nada sai para serviços externos),
   procura nele os valores e datas e compara com as despesas já lançadas na OT (valor 60 pts, data 25, categoria 15, descrição 10). Cada arquivo vai para a despesa de maior pontuação, sem
   repetir a mesma despesa enquanto houver outra. Antes de anexar abre UMA tela de conferência: cada arquivo mostra o que foi lido e a despesa sugerida, com lista para corrigir ou não anexar.
   Só depois do "Anexar" os arquivos sobem (anexo da despesa, entity_type 'viatico'). Leitura de PDF e OCR carregam sob demanda (pdf.js e tesseract.js do jsDelivr) na primeira vez.
   As funções cmp* (leitura do texto e pontuação) são puras e testadas em Node (scripts/2026-11-23_verifica_comprovantes_pasta.js). */
(function () {
  'use strict';
  const SEM = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dentro = (typeof window !== 'undefined');

  // ---------------- leitura do texto ----------------
  function cmpValores(texto) {
    const out = [], re = /(?:^|[^\d])(\d{1,3}(?:\.\d{3})+[,.]\d{2}|\d+[,.]\d{2})(?!\d)/g; let m;
    const t = String(texto || '');
    while ((m = re.exec(t))) {
      const s = m[1], i = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
      const v = Number(s.slice(0, i).replace(/[.,]/g, '') + '.' + s.slice(i + 1));
      if (isFinite(v) && v > 0 && v < 1e7) out.push(v);
    }
    return [...new Set(out)];
  }
  function cmpDatas(texto) {
    const out = new Set(), t = String(texto || ''); let m;
    const ok = (d, mo, a) => d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && a >= 2000 && a <= 2100;
    const add = (d, mo, a) => { if (ok(d, mo, a)) out.add(`${a}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`); };
    const re1 = /(?:^|[^\d])(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})(?!\d)/g;
    while ((m = re1.exec(t))) add(Number(m[1]), Number(m[2]), m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]));
    const re2 = /(?:^|[^\d])(20\d{2})-(\d{2})-(\d{2})(?!\d)/g;
    while ((m = re2.exec(t))) add(Number(m[3]), Number(m[2]), Number(m[1]));
    return [...out];
  }
  const PALAVRAS = {
    alimentacao: ['restaurante', 'refeic', 'lanchonete', 'padaria', 'almoco', 'jantar', 'cafe', 'lanche', 'pizzaria', 'churrasc', 'self service', 'marmit', 'bar e', 'cantina', 'sorvet', 'acai'],
    combustivel: ['posto', 'gasolina', 'etanol', 'diesel', 'combustiv', 'litros', 'alcool', 'abastec'],
    pedagio: ['pedagio', 'praca de', 'concessionaria', 'autopista', 'sem parar', 'conectcar', 'veloe', 'eixos', 'rodovia'],
    estacionamento: ['estacionamento', 'parking', 'estapar', 'zona azul'],
    hospedagem: ['hotel', 'pousada', 'hospedagem', 'check-in', 'checkin', 'hospede', 'diaria'],
    aluguel_carro: ['locadora', 'localiza', 'movida', 'unidas', 'aluguel de veic', 'locacao de veic', 'rent a car'],
    passagem_aviao: ['passagem aerea', 'bilhete aereo', 'embarque', 'latam', 'gol linhas', 'azul linhas', 'voo '],
    passagem_onibus: ['rodoviaria', 'passagem rodoviaria', 'viacao', 'onibus', 'clickbus'],
    taxi_uber: ['uber', ' 99 ', '99 pop', 'taxi', 'corrida', 'cabify']
  };
  function cmpExtrair(texto, nomeArquivo) {
    const t = (nomeArquivo ? nomeArquivo + '\n' : '') + String(texto || ''), n = ' ' + SEM(t) + ' ';
    const cats = Object.keys(PALAVRAS).filter(c => PALAVRAS[c].some(p => n.includes(p)));
    return { valores: cmpValores(t), datas: cmpDatas(t), cats, norm: n };
  }

  // ---------------- pontuação ----------------
  const dia = iso => { const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number); return Date.UTC(a, m - 1, d) / 86400000; };
  function cmpPontuar(ext, d) {
    let pts = 0; const por = {};
    if (ext.valores.some(v => Math.abs(v - Number(d.valor)) < 0.005)) { pts += 60; por.valor = true; }
    if (d.data) {
      const dif = ext.datas.length ? Math.min(...ext.datas.map(x => Math.abs(dia(x) - dia(d.data)))) : Infinity;
      if (dif === 0) { pts += 25; por.data = true; } else if (dif === 1) { pts += 10; por.data = 'proxima'; }
    }
    if (ext.cats.includes(d.categoria)) { pts += 15; por.cat = true; }
    const toks = SEM(d.descricao).split(/[^a-z0-9]+/).filter(x => x.length >= 5);
    if (toks.length && toks.filter(x => ext.norm.includes(x)).length >= Math.min(2, toks.length)) { pts += 10; por.desc = true; }
    return { pts, por };
  }
  const nivel = pts => (pts >= 85 ? 'alta' : pts >= 60 ? 'media' : 'baixa');
  // Cada arquivo -> a despesa de maior pontuação. Primeiro as melhores ligações, uma despesa por arquivo; o que sobrar pode repetir despesa (vários comprovantes de um gasto).
  function cmpAssociar(exts, despesas, minimo) {
    minimo = minimo == null ? 40 : minimo;
    const pares = [];
    exts.forEach((e, i) => despesas.forEach(d => { const r = cmpPontuar(e, d); if (r.pts >= minimo) pares.push({ i, id: d.id, pts: r.pts, por: r.por }); }));
    pares.sort((a, b) => b.pts - a.pts);
    const res = exts.map(() => null), usadaDesp = new Set();
    pares.forEach(p => { if (res[p.i] || usadaDesp.has(p.id)) return; res[p.i] = p; usadaDesp.add(p.id); });
    pares.forEach(p => { if (!res[p.i]) res[p.i] = { ...p, repetida: true }; });
    return res.map(r => (r ? { despesaId: r.id, pontos: r.pts, nivel: nivel(r.pts), por: r.por, repetida: !!r.repetida } : { despesaId: null, pontos: 0, nivel: 'nenhuma', por: {}, repetida: false }));
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { cmpValores, cmpDatas, cmpExtrair, cmpPontuar, cmpAssociar };
  if (!dentro) return;

  // ---------------- leitura dos arquivos (navegador) ----------------
  const carregados = {};
  function script(url) {
    return carregados[url] || (carregados[url] = new Promise((ok, err) => { const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = () => err(new Error('Não foi possível carregar o leitor de comprovantes (sem internet?).')); document.head.appendChild(s); }));
  }
  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', PDFJS_W = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js', TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  async function pdfjs() {
    await script(PDFJS);
    // O worker do pdf.js vem de outro domínio e o navegador não o abre como Worker; carregado como script, o pdf.js o usa no próprio fluxo (sem Worker), suficiente para 1 a 3 páginas por comprovante.
    if (!window.pdfjsWorker) await script(PDFJS_W);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_W;
    return window.pdfjsLib;
  }
  let workerOcr = null;
  async function ocr() {
    if (workerOcr) return workerOcr;
    await script(TESS);
    workerOcr = await window.Tesseract.createWorker('por');
    return workerOcr;
  }
  const imgDeArquivo = file => new Promise((ok, err) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); err(new Error('imagem ilegível')); }; im.src = u; });
  function reduzir(im, max) {
    const f = Math.min(1, max / Math.max(im.naturalWidth || im.width, im.naturalHeight || im.height)), c = document.createElement('canvas');
    c.width = Math.round((im.naturalWidth || im.width) * f); c.height = Math.round((im.naturalHeight || im.height) * f);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height); return c;
  }
  const noCanvas = (c, tipo, q) => new Promise(ok => c.toBlob(ok, tipo, q));
  async function textoDe(file) {
    const nome = file.name.toLowerCase();
    if (/\.pdf$/.test(nome) || file.type === 'application/pdf') {
      const lib = await pdfjs(), pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
      let t = ''; const paginas = Math.min(pdf.numPages, 3);
      for (let p = 1; p <= paginas; p++) { const c = await (await pdf.getPage(p)).getTextContent(); t += c.items.map(i => i.str).join(' ') + '\n'; }
      if (t.replace(/\s+/g, '').length >= 40) return { texto: t, metodo: 'texto do PDF' };
      const pg = await pdf.getPage(1), vp = pg.getViewport({ scale: 2 }), cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
      await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      return { texto: (await (await ocr()).recognize(cv)).data.text, metodo: 'OCR do PDF' };
    }
    const cv = reduzir(await imgDeArquivo(file), 2200);
    return { texto: (await (await ocr()).recognize(cv)).data.text, metodo: 'OCR da imagem' };
  }
  // Arquivo pronto para subir (limite de 3 MB): imagens grandes viram JPEG menor; PDF acima do limite não sobe.
  async function paraUpload(file) {
    if (file.size <= 3 * 1024 * 1024) return { blob: file, mime: file.type || 'application/octet-stream', nome: file.name };
    if (!/^image\//.test(file.type)) return null;
    const im = await imgDeArquivo(file);
    for (const [max, q] of [[2400, 0.85], [1800, 0.8], [1400, 0.7]]) {
      const b = await noCanvas(reduzir(im, max), 'image/jpeg', q); if (b && b.size <= 3 * 1024 * 1024) return { blob: b, mime: 'image/jpeg', nome: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
    }
    return null;
  }
  const b64 = blob => new Promise((ok, err) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = () => err(new Error('leitura do arquivo falhou')); fr.readAsDataURL(blob); });

  // ---------------- telas ----------------
  const E = s => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const MONEY = v => (typeof brl === 'function' ? brl(v) : 'R$ ' + Number(v).toFixed(2).replace('.', ','));
  const DT = iso => (typeof brDate === 'function' ? brDate(iso) : iso);
  const CAT = c => (typeof DESP_CAT_LABEL !== 'undefined' && DESP_CAT_LABEL[c]) || c;
  const NIVEL_TXT = { alta: 'Confiança alta', media: 'Conferir', baixa: 'Conferir bem', nenhuma: 'Sem correspondência', manual: 'Escolhido por você' };

  function viaComprovantesPasta(s, despesas, voltar) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.setAttribute('webkitdirectory', ''); inp.setAttribute('directory', ''); inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = () => {
      const todos = [...inp.files]; inp.remove();
      const arquivos = todos.filter(f => /\.(pdf|jpe?g|png|webp)$/i.test(f.name)).sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, 'pt-BR', { numeric: true }));
      if (!arquivos.length) return toast('A pasta não tem PDF nem imagem (JPG, PNG ou WebP).');
      ler(s, despesas, arquivos, todos.length - arquivos.length, voltar);
    };
    inp.click();
  }

  async function ler(s, despesas, arquivos, ignorados, voltar) {
    let cancelou = false;
    openModal('Lendo os comprovantes da pasta', `<p id="cmp-prog-txt" style="margin-top:0">Preparando o leitor (na primeira vez baixa alguns arquivos)…</p>
      <div class="cmp-barra"><i id="cmp-prog-bar" style="width:0%"></i></div><p class="hint" id="cmp-prog-arq" style="margin-bottom:0"></p>`,
      [{ label: 'Cancelar', onClick: () => { cancelou = true; closeModal(); voltar(); } }]);
    const lidos = [];
    for (let i = 0; i < arquivos.length; i++) {
      if (cancelou) return;
      const f = arquivos[i], t = $('#cmp-prog-txt'); if (!t) return;
      t.textContent = `Lendo comprovante ${i + 1} de ${arquivos.length}…`; $('#cmp-prog-bar').style.width = (i / arquivos.length * 100).toFixed(0) + '%'; $('#cmp-prog-arq').textContent = f.webkitRelativePath || f.name;
      let texto = '', metodo = '', erro = '';
      try { const r = await textoDe(f); texto = r.texto; metodo = r.metodo; } catch (e) { erro = e.message || 'não foi possível ler'; }
      lidos.push({ file: f, ext: cmpExtrair(texto, f.name.replace(/\.[^.]+$/, '')), metodo, erro });
    }
    if (cancelou) return;
    const sug = cmpAssociar(lidos.map(l => l.ext), despesas);
    lidos.forEach((l, i) => { l.sug = sug[i]; l.escolha = sug[i].despesaId; l.nivel = sug[i].nivel; });
    conferir(s, despesas, lidos, ignorados, voltar);
  }

  function conferir(s, despesas, lidos, ignorados, voltar) {
    const opcoes = sel => `<option value="">— não anexar —</option>` + despesas.map(d => `<option value="${d.id}" ${String(sel) === String(d.id) ? 'selected' : ''}>${DT(d.data)} · ${E(CAT(d.categoria))} · ${MONEY(d.valor)}${d.descricao ? ' · ' + E(String(d.descricao).slice(0, 38)) : ''}</option>`).join('');
    const ordem = { nenhuma: 0, baixa: 1, media: 2, alta: 3 };
    const idx = lidos.map((_, i) => i).sort((a, b) => ordem[lidos[a].nivel] - ordem[lidos[b].nivel] || a - b);
    const urls = lidos.map(l => (/^image\//.test(l.file.type) ? URL.createObjectURL(l.file) : null));
    const linha = i => {
      const l = lidos[i], f = l.file, val = l.ext.valores.slice(0, 4).map(MONEY).join(' · ') || '—', dts = l.ext.datas.slice(0, 3).map(DT).join(' · ') || '—';
      return `<tr data-i="${i}">
        <td class="cmp-arq">${urls[i] ? `<img src="${urls[i]}" alt="">` : '<span class="cmp-pdf">PDF</span>'}<div><b title="${E(f.webkitRelativePath || f.name)}">${E(f.name)}</b><small>${(f.size / 1024).toFixed(0)} KB${l.erro ? ' · <span style="color:var(--danger)">' + E(l.erro) + '</span>' : ''}${f.size > 3145728 && !/^image\//.test(f.type) ? ' · <span style="color:var(--danger)">acima de 3 MB</span>' : ''}</small></div></td>
        <td class="cmp-lido"><div><small>Valores</small>${E(val)}</div><div><small>Datas</small>${E(dts)}</div>${l.ext.cats.length ? `<div><small>Parece</small>${E(l.ext.cats.map(CAT).join(', '))}</div>` : ''}</td>
        <td><select class="cmp-sel" data-i="${i}">${opcoes(l.escolha)}</select><span class="cmp-nv ${l.nivel}" id="cmp-nv-${i}">${NIVEL_TXT[l.nivel]}${l.sug.repetida && l.escolha ? ' · despesa repetida' : ''}</span></td></tr>`;
    };
    const conta = k => lidos.filter(l => l.nivel === k).length, anexaveis = () => lidos.filter(l => l.escolha).length;
    const semComp = () => despesas.filter(d => !lidos.some(l => String(l.escolha) === String(d.id)));
    openModal('Conferir comprovantes antes de anexar', `
      <div class="rh-nota"><b>${lidos.length}</b> comprovante(s) lido(s): <b>${conta('alta')}</b> com confiança alta, <b>${conta('media') + conta('baixa')}</b> para conferir, <b>${conta('nenhuma')}</b> sem correspondência.${ignorados ? ` ${ignorados} arquivo(s) que não são PDF ou imagem foram ignorados.` : ''}
        Os que precisam de atenção estão no topo. Troque a despesa na lista ou escolha "não anexar".</div>
      <div class="table-wrap"><table class="cmp-tbl"><thead><tr><th>Comprovante</th><th>O que foi lido</th><th>Anexar à despesa</th></tr></thead><tbody>${idx.map(linha).join('')}</tbody></table></div>
      <div id="cmp-sem" class="hint" style="margin-top:10px"></div>`,
      [{ label: 'Cancelar', onClick: () => { urls.forEach(u => u && URL.revokeObjectURL(u)); closeModal(); voltar(); } },
       { label: 'Anexar', cls: 'primary', onClick: () => enviar(s, lidos, urls, voltar) }], { xwide: true });
    const atualiza = () => {
      const sc = semComp(), btn = [...document.querySelectorAll('#modal-footer .btn')].find(b => /^Anexar/.test(b.textContent));
      if (btn) { btn.textContent = `Anexar ${anexaveis()} comprovante(s)`; btn.disabled = !anexaveis(); }
      const el = $('#cmp-sem'); if (el) el.innerHTML = sc.length ? `<b>${sc.length} despesa(s) continuam sem comprovante desta pasta:</b> ${sc.slice(0, 8).map(d => `${DT(d.data)} ${E(CAT(d.categoria))} ${MONEY(d.valor)}`).join('; ')}${sc.length > 8 ? '…' : ''}` : 'Todas as despesas da lista receberão ao menos um comprovante.';
    };
    document.querySelectorAll('.cmp-sel').forEach(sel => sel.onchange = () => {
      const l = lidos[Number(sel.dataset.i)]; l.escolha = sel.value || null; l.nivel = sel.value ? (String(sel.value) === String(l.sug.despesaId) ? l.sug.nivel : 'manual') : 'nenhuma';
      const nv = $('#cmp-nv-' + sel.dataset.i); nv.className = 'cmp-nv ' + l.nivel; nv.textContent = sel.value ? NIVEL_TXT[l.nivel] : 'Não será anexado'; atualiza();
    });
    atualiza();
  }

  async function enviar(s, lidos, urls, voltar) {
    const fila = lidos.filter(l => l.escolha); let ok = 0; const falhas = [];
    openModal('Anexando comprovantes', `<p id="cmp-env-txt" style="margin-top:0">Enviando…</p><div class="cmp-barra"><i id="cmp-env-bar" style="width:0%"></i></div>`, []);
    for (let i = 0; i < fila.length; i++) {
      const l = fila[i]; $('#cmp-env-txt').textContent = `Enviando ${i + 1} de ${fila.length}: ${l.file.name}`; $('#cmp-env-bar').style.width = (i / fila.length * 100).toFixed(0) + '%';
      try {
        const up = await paraUpload(l.file); if (!up) { falhas.push(`${l.file.name}: acima de 3 MB`); continue; }
        await api(`/api/attachments/viatico/${l.escolha}`, { method: 'POST', body: { file_name: up.nome, mime_type: up.mime, kind: 'comprovante', data: await b64(up.blob) } }); ok++;
      } catch (e) { falhas.push(`${l.file.name}: ${e.message}`); }
    }
    urls.forEach(u => u && URL.revokeObjectURL(u));
    if (workerOcr) { try { workerOcr.terminate(); } catch (e) { /* ignora */ } workerOcr = null; }
    closeModal();
    toast(falhas.length ? `${ok} anexado(s); ${falhas.length} falharam: ${falhas.slice(0, 2).join(' | ')}` : `${ok} comprovante(s) anexado(s).`);
    voltar();
  }

  window.viaComprovantesPasta = viaComprovantesPasta;
})();
