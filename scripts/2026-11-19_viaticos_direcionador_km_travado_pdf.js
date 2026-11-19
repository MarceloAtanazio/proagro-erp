// Propósito: Direcionador de mobilidade (Viáticos): (1) o km à mão deixa de ser opção livre: o campo só aparece quando o cálculo automático da rota falha (o colaborador não pode alegar que a ferramenta
//   não funcionou sem que ela de fato tenha falhado); o retrato gravado na OT passa a registrar a origem do km (km_fonte: 'auto' ou 'manual'); (2) o PDF da solicitação ganha o bloco "Direcionador de
//   mobilidade" logo após o detalhamento: comparativo carro próprio x locado, economia, origem do km e a EVIDÊNCIA anexada (imagem dentro do PDF; se for PDF/outro formato, o nome do arquivo, e se não
//   houver, um aviso em vermelho), para a aprovação ver tudo no mesmo documento. Antes do envio (prévia) usa a evidência do assistente; depois, baixa o anexo da OT (viatico_cotacao).
// Entrada: public/via-direcionador.js e public/app.js (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-19_viaticos_direcionador_km_travado_pdf.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
function edita(arq, fn) {
  const p = path.join(raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error(arq + ': âncora não única/achada: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  fn(troca, () => s, x => { s = x; }); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
edita('public/via-direcionador.js', (troca, get, set) => {
  if (get().includes('viaDirecionadorPdf')) throw new Error('já aplicado');
  // 1) km à mão só quando a rota falha
  troca(' <button type="button" class="btn sm" id="dm-manual">✏️ Informar km à mão</button>\';', '\';');
  let linhas = get().split('\n');
  const i = linhas.findIndex(l => l.includes("else if (v.kmFonte === 'manual') box.innerHTML"));
  if (i < 0) throw new Error('ramo manual não achado'); linhas.splice(i, 1);
  const j = linhas.findIndex(l => l.includes("const mn = $('#dm-manual')"));
  if (j < 0) throw new Error('dm-manual não achado'); linhas.splice(j, 1);
  set(linhas.join('\n'));
  troca("if (!forcar && v.kmChave === chave && (v.kmFonte === 'auto' || v.kmFonte === 'manual')) return;", "if (!forcar && v.kmChave === chave && v.kmFonte === 'auto') return;");
  // 2) origem do km no retrato
  troca("function viaDirecionadorSnapshot(r, p, evidenciaNome, quando) {", "function viaDirecionadorSnapshot(r, p, evidenciaNome, quando, kmFonte) {");
  troca("return { indicada: r.indicada, sem_carro: !!r.semcarro, km: Number(r.km.toFixed(1)),", "return { indicada: r.indicada, sem_carro: !!r.semcarro, km: Number(r.km.toFixed(1)), km_fonte: kmFonte === 'manual' ? 'manual' : 'auto',");
  troca("snap = viaDirecionadorSnapshot(viaDirecionadorCalc(p), p, w.dm.evidencia && w.dm.evidencia.name);", "snap = viaDirecionadorSnapshot(viaDirecionadorCalc(p), p, w.dm.evidencia && w.dm.evidencia.name, undefined, w.dm.kmFonte === 'auto' ? 'auto' : 'manual');");
  // modal da OT mostra a origem do km
  troca("<div><span>Quilometragem</span><b>${kmFmt(d.km)} km</b></div>", "<div><span>Quilometragem</span><b>${kmFmt(d.km)} km${d.km_fonte === 'manual' ? ' (informada à mão)' : ''}</b></div>");
  // 3) bloco do PDF + busca da evidência salva
  troca("  // Soma da economia apurada pelo direcionador",
`  // Imagem da evidência: dimensões naturais para caber no PDF sem distorcer.
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
  // Soma da economia apurada pelo direcionador`);
  troca("window.viaEconomiaDirecionador = viaEconomiaDirecionador;", "window.viaEconomiaDirecionador = viaEconomiaDirecionador; window.viaDirecionadorPdf = viaDirecionadorPdf; window.viaDirecionadorEvidenciaSalva = viaDirecionadorEvidenciaSalva;");
});
edita('public/app.js', (troca) => {
  // PDF: bloco logo depois do detalhamento
  troca("    y = doc.lastAutoTable.finalY + 12;\n\n    if (y > 255) { doc.addPage(); y = 20; }\n    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...CINZA);\n    const decl = ",
    "    y = doc.lastAutoTable.finalY + 12;\n\n    if (typeof viaDirecionadorPdf === 'function') y = await viaDirecionadorPdf(doc, y, MARGIN, w, opts.direcionadorEvidencia);\n\n    if (y > 255) { doc.addPage(); y = 20; }\n    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...CINZA);\n    const decl = ");
  // regerar depois do envio: busca a evidência salva
  troca("  toast('Gerando PDF…');\n  await viaGerarPDF(w, { cat, total, dias, memoria: viaMemoriaCategorias(w, cat) }, { dataEmissao: s.created_at });",
    "  toast('Gerando PDF…');\n  const evidDir = (w.transporte.direcionador && w.transporte.direcionador.evidencia && typeof viaDirecionadorEvidenciaSalva === 'function') ? await viaDirecionadorEvidenciaSalva(s) : null;\n  await viaGerarPDF(w, { cat, total, dias, memoria: viaMemoriaCategorias(w, cat) }, { dataEmissao: s.created_at, direcionadorEvidencia: evidDir });");
});
console.log('ok');
