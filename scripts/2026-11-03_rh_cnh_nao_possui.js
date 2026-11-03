// Propósito: a CNH deixa de ser "falta" vermelha no dossiê, porque nem todo cidadão tem habilitação. Enquanto não houver arquivo nem declaração,
//   aparece em AMARELO como "pendente" e NÃO conta como documento faltando (nem trava a etapa Documentação, nem entra no "Dossiê incompleto" do
//   Painel). Quem edita RH pode declarar "não possui" (e desfazer): o item fica resolvido. Vale no dossiê, no card do candidato e na ficha.
//   Backend: coluna erp_colaboradores.nao_possui_cnh (migração 2026-11-03-rh-nao-possui-cnh.sql), rota PUT /api/rh/colaboradores/:id/declaracao-documento
//   (lista fechada de documentos), rhChecklist com `brando`/`declaravel`, e as consultas que alimentam o checklist passam a trazer a coluna.
// Entrada: api/index.js, public/app.js e public/styles.css (ou a pasta indicada em argv[2]) e os blocos scripts/2026-11-03_rh_cnh_nao_possui_*_bloco.txt.
// Saída: os três arquivos editados. Uso: node scripts/2026-11-03_rh_cnh_nao_possui.js [raiz]   (a migração vem antes)
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const bloco = n => fs.readFileSync(path.join(__dirname, n), 'utf8').replace(/\r\n/g, '\n');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel);
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const unico = m => {
    const i = s.indexOf(m);
    if (i < 0) throw new Error(rel + ': trecho não achado: ' + m.slice(0, 80));
    if (s.indexOf(m, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + m.slice(0, 80));
  };
  fn({
    troca: (de, para) => { unico(de); s = s.replace(de, () => para); },
    antes: (m, t) => { unico(m); const i = s.indexOf(m); s = s.slice(0, i) + t + s.slice(i); },
    fim: t => { s = s.replace(/\n*$/, '\n') + t; }
  });
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};

// ---------------- backend ----------------
edita('api/index.js', ({ troca, antes }) => {
  antes("  'PUT /api/rh/colaboradores/:id': req =>", bloco('2026-11-03_rh_cnh_nao_possui_audit_bloco.txt'));
  antes('// ---- Vínculos ----\n', bloco('2026-11-03_rh_cnh_nao_possui_api_bloco.txt'));

  troca("  { cod: 'cnh',                  nome: 'CNH',                                 obrigatorio: true },",
    "  // CNH: nem todo cidadão tem habilitação. Não é falta — fica \"pendente\" (brando) até haver arquivo ou a declaração \"não possui\".\n" +
    "  { cod: 'cnh',                  nome: 'CNH',                                 obrigatorio: true, brando: true, declaravel: 'nao_possui_cnh' },");
  troca("      return { cod: d.cod, nome: d.nome, anexos: nAnexos, ok: nAnexos > 0 || viaCampos,\n               via: d.porCampos ? 'campos' : 'anexo' };",
    "      const viaDeclaracao = !!(d.declaravel && colab[d.declaravel] === true);\n" +
    "      return { cod: d.cod, nome: d.nome, anexos: nAnexos, ok: nAnexos > 0 || viaCampos || viaDeclaracao,\n" +
    "               via: d.porCampos ? 'campos' : (viaDeclaracao && nAnexos === 0 ? 'declaracao' : 'anexo'),\n" +
    "               brando: !!d.brando, declaravel: !!d.declaravel };");

  // Lista de colaboradores: o que é pendência "branda" não entra como falta.
  troca("           c.cpf, c.banco_numero, c.agencia, c.conta, c.arquivado_em, c.arquivado_motivo,",
    "           c.cpf, c.banco_numero, c.agencia, c.conta, c.nao_possui_cnh, c.arquivado_em, c.arquivado_motivo,");
  troca("    return { ...base, checklist_total: check.length, checklist_ok: check.filter(x => x.ok).length,\n             checklist_faltam: check.filter(x => !x.ok).map(x => x.nome) };",
    "    return { ...base, checklist_total: check.length, checklist_ok: check.filter(x => x.ok || x.brando).length,\n" +
    "             checklist_faltam: check.filter(x => !x.ok && !x.brando).map(x => x.nome),\n" +
    "             checklist_pendentes: check.filter(x => !x.ok && x.brando).map(x => x.nome) };");

  // Quadro de admissão e etapa Documentação: o candidato sem CNH não fica travado.
  troca("    SELECT a.*, c.name AS colaborador_nome, c.sexo, g.name AS gestor_nome,", "    SELECT a.*, c.name AS colaborador_nome, c.sexo, c.nao_possui_cnh, g.name AS gestor_nome,");
  troca("checklist_total: chk.length, checklist_ok: chk.filter(x => x.ok).length,", "checklist_total: chk.length, checklist_ok: chk.filter(x => x.ok || x.brando).length,");
  troca("      const faltam = (checklist || []).filter(x => !x.ok).map(x => x.nome);", "      const faltam = (checklist || []).filter(x => !x.ok && !x.brando).map(x => x.nome);");

  // Painel: "Dossiê incompleto" só com falta de verdade.
  troca("    SELECT c.id, c.sexo, c.banco_numero, c.agencia, c.conta,\n", "    SELECT c.id, c.sexo, c.banco_numero, c.agencia, c.conta, c.nao_possui_cnh,\n");
  troca("    return chk.some(x => !x.ok);", "    return chk.some(x => !x.ok && !x.brando);");
});

// ---------------- front ----------------
edita('public/app.js', ({ troca, antes }) => {
  antes('async function rhAbrirCard(id) {', bloco('2026-11-03_rh_cnh_nao_possui_front_bloco.txt'));

  // Card do candidato (etapa Documentação)
  troca("      <div class=\"rh-check\">${d.checklist.map(x => `<div class=\"rh-check-item ${x.ok ? 'ok' : 'falta'}\">\n" +
        "        <span class=\"mk\">${x.ok ? '✔' : '✘'}</span><span class=\"nm\">${esc(x.nome)}</span>\n" +
        "        <span class=\"via\">${x.ok ? 'ok' : (x.via === 'campos' ? 'preencher acima' : 'falta anexar')}</span></div>`).join('')}</div>",
    "      <div class=\"rh-check\">${d.checklist.map(x => rhCheckItemHtml(x, ed, () => 'ok', y => (y.via === 'campos' ? 'preencher acima' : 'falta anexar'))).join('')}</div>");
  troca("  const addCv = $('#rh-add-curriculo');\n  if (addCv) addCv.onclick = () => rhAnexarCurriculo(id);",
    "  const addCv = $('#rh-add-curriculo');\n  if (addCv) addCv.onclick = () => rhAnexarCurriculo(id);\n  rhLigarNaoPossui($('#modal-body'), a.colaborador_id, () => rhAbrirCard(id));");

  // Dossiê do colaborador
  troca("      <div class=\"rh-check\">${d.checklist.map(x => `\n        <div class=\"rh-check-item ${x.ok ? 'ok' : 'falta'}\">\n" +
        "          <span class=\"mk\">${x.ok ? '✔' : '✘'}</span>\n          <span class=\"nm\">${esc(x.nome)}</span>\n" +
        "          <span class=\"via\">${x.ok ? (x.via === 'campos' ? 'preenchido na ficha' : x.anexos + ' arquivo(s)') : (x.via === 'campos' ? 'preencher na aba Contato' : 'falta anexar')}</span>\n" +
        "        </div>`).join('')}</div>",
    "      <div class=\"rh-check\">${d.checklist.map(x => rhCheckItemHtml(x, ed,\n" +
        "        y => (y.via === 'campos' ? 'preenchido na ficha' : y.anexos + ' arquivo(s)'),\n" +
        "        y => (y.via === 'campos' ? 'preencher na aba Contato' : 'falta anexar'))).join('')}</div>");
  troca("      <div class=\"rh-nota\">O reservista só aparece para colaboradores do sexo masculino, e “Dados Bancários” é cumprido pelos campos da ficha — não por anexo.</div>",
    "      <div class=\"rh-nota\">O reservista só aparece para colaboradores do sexo masculino, e “Dados Bancários” é cumprido pelos campos da ficha — não por anexo.\n" +
    "        A CNH não é obrigatória para todo mundo: fica <strong>pendente</strong> (amarelo) e, se a pessoa não tem habilitação, use <strong>não possui</strong>.</div>");
  troca("  const add = painel.querySelector('#rh-add-doc');\n  if (add) add.onclick = () => rhAnexarDoc(id, d.tipos_documento);",
    "  const add = painel.querySelector('#rh-add-doc');\n  if (add) add.onclick = () => rhAnexarDoc(id, d.tipos_documento);\n  rhLigarNaoPossui(painel, id, () => abrirFichaRH(id, 'dossie'));");

  // Cabeçalho da ficha: falta de verdade em vermelho, pendência branda em amarelo.
  troca("  const falta = d.checklist.filter(x => !x.ok);",
    "  const faltaTodas = d.checklist.filter(x => !x.ok);\n  const falta = faltaTodas.filter(x => !x.brando);          // falta de verdade\n  const pendentesBrandas = faltaTodas.filter(x => x.brando); // ex.: CNH (nem todo mundo tem)");
  troca("        ${falta.length\n          ? `<span class=\"rh-pend\" title=\"${esc(falta.map(f => f.nome).join(', '))}\">⚠ ${falta.length} documento(s) faltando</span>`\n          : '<span class=\"rh-pend ok\">✔ Documentação completa</span>'}",
    "        ${falta.length\n          ? `<span class=\"rh-pend\" title=\"${esc(falta.map(f => f.nome).join(', '))}\">⚠ ${falta.length} documento(s) faltando</span>`\n          : (pendentesBrandas.length ? '' : '<span class=\"rh-pend ok\">✔ Documentação completa</span>')}\n" +
    "        ${pendentesBrandas.length ? `<span class=\"rh-pend aviso\" title=\"Anexe o documento ou marque “não possui” no Dossiê\">⚠ pendente: ${esc(pendentesBrandas.map(f => f.nome).join(', '))}</span>` : ''}");

  // Lista de colaboradores
  troca("title=\"${esc(falta ? 'Falta: ' + r.checklist_faltam.join(', ') : 'Documentação completa')}\">",
    "title=\"${esc(falta ? 'Falta: ' + r.checklist_faltam.join(', ') : ((r.checklist_pendentes || []).length ? 'Completa. Pendente (opcional): ' + r.checklist_pendentes.join(', ') : 'Documentação completa'))}\">");
});

edita('public/styles.css', ({ fim }) => {
  fim('\n/* Checklist do dossiê: pendência BRANDA (ex.: CNH, que nem todo cidadão tem) em amarelo — não é falta */\n' +
    '.rh-check-item.pendente { background: var(--warn-050); color: var(--ink); }\n' +
    '.rh-check-item.pendente .mk, .rh-check-item.pendente .via { color: var(--warn); }\n' +
    '.rh-pend.aviso { color: var(--warn); background: var(--warn-050); border-color: #E8D3A6; }\n');
});
console.log('ok');
