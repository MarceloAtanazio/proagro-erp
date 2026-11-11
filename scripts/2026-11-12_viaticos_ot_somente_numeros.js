// Propósito: o "Nº da Ordem de Trabalho" das solicitações de Viáticos passa a aceitar SOMENTE números (letras são barradas ao digitar/colar e recusadas no servidor).
//   Exceções que continuam como estão: (1) complementar / custo extra — o " - Complementar" / " - Custo extra" é montado automaticamente (campo travado no assistente e no servidor);
//   (2) OTs antigas com letras: só são aceitas se o valor NÃO foi alterado (editar outro campo da OT antiga continua funcionando).
//   Front (public/app.js): campo com data-ot-num + filtro delegado de teclas; assistente "Solicitar viagem" e formulário do administrador validam antes de enviar.
//   Servidor (api/index.js): POST autosserviço (OT digitada), POST e PUT do administrador (só se o valor mudou).
// Entrada: public/app.js e api/index.js (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-12_viaticos_ot_somente_numeros.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel); let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 80)); if (s.indexOf(de, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + de.slice(0, 80)); s = s.replace(de, () => para); };
  fn(troca); fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};

edita('public/app.js', troca => {
  // filtro delegado: qualquer campo marcado com data-ot-num só fica com dígitos (digitando ou colando)
  troca("const fldSel = (id, label, options, selected) =>",
    "// Campo de nº da OT de Viáticos: só dígitos (digitando ou colando). Marque o input com data-ot-num.\nconst OT_ATTRS = 'data-ot-num inputmode=\"numeric\" maxlength=\"15\" autocomplete=\"off\" placeholder=\"Somente números\"';\ndocument.addEventListener('input', e => {\n  const el = e.target;\n  if (el && el.matches && el.matches('[data-ot-num]')) { const limpo = el.value.replace(/\\D/g, ''); if (limpo !== el.value) el.value = limpo; }\n});\nconst fldSel = (id, label, options, selected) =>");

  // formulário do administrador
  troca("${fld('vs-ordem', 'Nº da Ordem de Trabalho', 'text', existing ? existing.ordem_trabalho || '' : '')}",
    "${fld('vs-ordem', 'Nº da Ordem de Trabalho', 'text', existing ? existing.ordem_trabalho || '' : '', existing && existing.complementar_tipo ? 'disabled title=\"OT complementar: o nome é gerado automaticamente\"' : OT_ATTRS)}");
  troca("        // Pendência de viagem(ns) anterior(es): a decisão (descontar ou dispensar) é aplicada de verdade\n        // — e não só na tela — e registrada no log de auditoria.\n        if (pend && pend.ativo) {",
    "        // O nº da OT é só número. OT antiga com letras só passa se o valor não foi mexido.\n        const otNovo = String(b.ordem_trabalho || '').trim();\n        if (otNovo && !/^\\d+$/.test(otNovo) && !(isEdit && otNovo === String(existing.ordem_trabalho || '').trim())) return modalError('O nº da Ordem de Trabalho deve conter somente números.');\n        // Pendência de viagem(ns) anterior(es): a decisão (descontar ou dispensar) é aplicada de verdade\n        // — e não só na tela — e registrada no log de auditoria.\n        if (pend && pend.ativo) {");

  // assistente "Solicitar viagem"
  troca("  if (!String(v.ordem_trabalho || '').trim()) return { msg: 'Informe o nº da Ordem de Trabalho.', foco: 'w2-ot' };",
    "  if (!String(v.ordem_trabalho || '').trim()) return { msg: 'Informe o nº da Ordem de Trabalho.', foco: 'w2-ot' };\n  // complementar: o nome é gerado automaticamente (campo travado), não se valida; OT nova: só números\n  if (!v.complementar && !/^\\d+$/.test(String(v.ordem_trabalho).trim())) return { msg: 'O nº da Ordem de Trabalho deve conter somente números.', foco: 'w2-ot' };");
  troca("${fld('w2-ot', 'Nº da Ordem de Trabalho', 'text', w.ordem_trabalho, w.complementar ? 'disabled' : '')}",
    "${fld('w2-ot', 'Nº da Ordem de Trabalho', 'text', w.ordem_trabalho, w.complementar ? 'disabled' : OT_ATTRS)}");
});

edita('api/index.js', troca => {
  troca("function validateSolicitacao(b) {",
    "// Nº da OT de Viáticos: só dígitos; complementar / custo extra levam o sufixo gerado pelo sistema (ex.: \"42 - Complementar 2\").\nconst OT_SO_NUMEROS = /^\\d+$/;\nconst OT_COM_SUFIXO = /^\\d+ - (Complementar|Custo extra)( \\d+)?$/i;\nconst OT_MSG = 'O nº da Ordem de Trabalho deve conter somente números.';\n\nfunction validateSolicitacao(b) {");
  // autosserviço: só quando a OT é digitada (sem OT de origem); na complementar o servidor monta o nome
  troca("  if (!sanitize(b.ordem_trabalho)) return res.status(400).json({ error: 'Informe o nº da Ordem de Trabalho.' });\n  if (!b.motivo) return res.status(400).json({ error: 'Selecione o motivo da viagem.' });",
    "  if (!sanitize(b.ordem_trabalho)) return res.status(400).json({ error: 'Informe o nº da Ordem de Trabalho.' });\n  if (!pai && !OT_SO_NUMEROS.test(String(b.ordem_trabalho).trim())) return res.status(400).json({ error: OT_MSG });\n  if (!b.motivo) return res.status(400).json({ error: 'Selecione o motivo da viagem.' });");
  // administrador: criar
  troca("app.post('/api/viaticos/solicitacoes', requireAuth, requireEdit('viaticos'), h(async (req, res) => {\n  const b = req.body, err = validateSolicitacao(b);\n  if (err) return res.status(400).json({ error: err });",
    "app.post('/api/viaticos/solicitacoes', requireAuth, requireEdit('viaticos'), h(async (req, res) => {\n  const b = req.body, err = validateSolicitacao(b);\n  if (err) return res.status(400).json({ error: err });\n  { const ot = String(sanitize(b.ordem_trabalho) || '').trim(); if (ot && !OT_SO_NUMEROS.test(ot) && !OT_COM_SUFIXO.test(ot)) return res.status(400).json({ error: OT_MSG }); }");
  // administrador: editar (OT antiga com letras só passa se o valor não mudou)
  troca("app.put('/api/viaticos/solicitacoes/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {\n  const b = req.body, err = validateSolicitacao(b);\n  if (err) return res.status(400).json({ error: err });",
    "app.put('/api/viaticos/solicitacoes/:id', requireAuth, requireEdit('viaticos'), h(async (req, res) => {\n  const b = req.body, err = validateSolicitacao(b);\n  if (err) return res.status(400).json({ error: err });\n  {\n    const ot = String(sanitize(b.ordem_trabalho) || '').trim();\n    if (ot && !OT_SO_NUMEROS.test(ot) && !OT_COM_SUFIXO.test(ot)) {\n      const atualOt = (await query('SELECT ordem_trabalho FROM erp_viaticos_solicitacoes WHERE id=$1', [req.params.id]))[0];\n      if (!atualOt || String(atualOt.ordem_trabalho || '').trim() !== ot) return res.status(400).json({ error: OT_MSG });\n    }\n  }");
});
console.log('ok');
