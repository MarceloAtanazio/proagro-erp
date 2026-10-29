// Propósito: anexar o CONTRATO ASSINADO direto do card de admissão (etapa Contrato e seguintes) e registrá-lo no dossiê do
//   colaborador (rh_doc, tipo "contrato_assinado", que já existe no catálogo e é o que a conformidade de RH conta). Aproveita
//   para generalizar o anexo do ASO (2026-10-29_exame_admissional_anexar_aso.js): as duas seções passam a usar o mesmo código,
//   configurado por tipo de documento, em vez de uma cópia para cada uma. Só front; sem mudança de backend nem de banco.
// Entrada: public/app.js (ou a pasta indicada em argv[2]). Saída: public/app.js editado.
// Uso: node scripts/2026-10-29_contrato_assinado_anexar.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => {
  const i = s.indexOf(de);
  if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 70));
  if (s.indexOf(de, i + 1) >= 0) throw new Error('trecho repetido: ' + de.slice(0, 70));
  s = s.replace(de, () => para);
};

// 1) As seções do card: uma por documento da etapa.
troca("    ${a.etapa === 'exame_admissional' ? '<div class=\"rh-sec\" id=\"rh-aso-sec\"><h4>ASO — Atestado de Saúde Ocupacional</h4><div class=\"ec-anexo-vazio\">Carregando…</div></div>' : ''}",
  "    ${rhDocsDaEtapa(a.etapa).map(cod => `<div class=\"rh-sec\" id=\"rh-doc-${cod}\"><h4>${RH_DOC_ADM[cod].titulo}</h4><div class=\"ec-anexo-vazio\">Carregando…</div></div>`).join('')}");

// 2) Liga as seções quando o card abre.
troca("  rhCarregarAso(a.colaborador_id, id, ed, d.pode.sensivel);",
  "  rhDocsDaEtapa(a.etapa).forEach(cod => rhCarregarDocAdm(cod, a.colaborador_id, id, ed, d.pode.sensivel));");

// 3) O código do ASO vira o código dos documentos de admissão.
const ini = s.indexOf('// ASO do exame admissional. É dado de saúde');
const fim = s.indexOf('// Currículo do candidato — mesmo entity_type do laudo (rh_admissao_doc), só');
if (ini < 0 || fim < 0 || fim < ini) throw new Error('bloco do ASO não achado');
const novo = `// Documentos do dossiê anexados direto do card de admissão, no momento certo do processo: o ASO ao registrar o exame
// admissional e o contrato assinado ao registrar a assinatura. Não ficam presos ao processo: vão para o DOSSIÊ do
// colaborador (rh_doc), onde aparecem em Dossiê → Arquivos, contam na conformidade de RH e continuam lá depois da
// contratação. São dados de saúde e pessoais (CPF, RG, endereço), então exigem a trava de dado sensível — a mesma do dossiê.
const RH_DOC_ADM = {
  aso: { titulo: 'ASO — Atestado de Saúde Ocupacional', icone: '🩺', anexar: 'Anexar ASO', vazio: 'Nenhum ASO anexado ainda.',
    modal: 'Anexar ASO', campo: 'Arquivo do ASO', ok: 'ASO anexado.', rotulo: 'ASO', cadeado: 'O ASO é dado de saúde' },
  contrato_assinado: { titulo: 'Contrato assinado', icone: '✍️', anexar: 'Anexar contrato assinado', vazio: 'Nenhum contrato assinado anexado ainda.',
    modal: 'Anexar contrato assinado', campo: 'Arquivo do contrato assinado', ok: 'Contrato assinado anexado.', rotulo: 'contrato assinado',
    cadeado: 'O contrato assinado traz CPF, RG e endereço' }
};
// Quais documentos cada etapa pede: o ASO no exame; o contrato assinado a partir do Contrato (quem esquece de anexar na
// hora ainda o encontra nas etapas seguintes).
const rhDocsDaEtapa = etapa => etapa === 'exame_admissional' ? ['aso']
  : ['contrato', 'contas_acessos', 'onboarding'].includes(etapa) ? ['contrato_assinado'] : [];

async function rhCarregarDocAdm(cod, colabId, admissaoId, ed, sensivel) {
  const cfg = RH_DOC_ADM[cod];
  const box = $('#rh-doc-' + cod);
  if (!box || !cfg) return;
  const titulo = \`<h4>\${cfg.titulo}</h4>\`;
  if (!sensivel) {
    box.innerHTML = titulo + \`<div class="rh-nota">🔒 \${cfg.cadeado}: exige a permissão “RH · dados pessoais sensíveis”.</div>\`;
    return;
  }
  let lista = [];
  try { lista = (await api('/api/attachments/rh_doc/' + colabId)).filter(x => x.doc_tipo === cod); }
  catch (e) { box.innerHTML = titulo + \`<div class="ec-anexo-vazio">\${esc(e.message)}</div>\`; return; }
  box.innerHTML = titulo +
    (lista.length ? lista.map(x => \`<div class="ec-anexo-item">
        <span>\${cfg.icone}</span>
        <div class="ec-anexo-nome" title="\${esc(x.file_name)}">\${esc(x.file_name)}</div>
        <small>\${fmtSize(x.byte_size)} · \${rhData(x.created_at)}</small>
        <button class="btn sm" data-ver-docadm="\${x.id}" type="button">Ver</button>
        \${ed ? \`<button class="btn sm danger-ghost" data-del-docadm="\${x.id}" type="button">Excluir</button>\` : ''}
      </div>\`).join('') : \`<div class="ec-anexo-vazio">\${cfg.vazio}</div>\`) +
    (ed ? \`<div class="rh-acoes"><button class="btn sm" id="rh-add-doc-\${cod}" type="button">📎 \${cfg.anexar}</button></div>\` : '') +
    \`<div class="rh-nota">O documento também fica no <strong>Dossiê</strong> do colaborador, junto dos demais.</div>\`;
  box.querySelectorAll('[data-ver-docadm]').forEach(b => b.onclick = () => colabVerAnexo(Number(b.dataset.verDocadm)));
  box.querySelectorAll('[data-del-docadm]').forEach(b => b.onclick = () =>
    confirmDelete(cfg.rotulo, '/api/attachments/' + b.dataset.delDocadm, () => rhAbrirCard(admissaoId)));
  const add = box.querySelector('#rh-add-doc-' + cod);
  if (add) add.onclick = () => rhAnexarDocAdm(cod, colabId, admissaoId);
}

function rhAnexarDocAdm(cod, colabId, admissaoId) {
  const cfg = RH_DOC_ADM[cod];
  openModal(cfg.modal, \`
    <div class="field"><label for="da-file">\${cfg.campo}</label><input type="file" id="da-file"
      accept=".pdf,.jpg,.jpeg,.png,.webp"></div>
    <div class="rh-nota">PDF ou imagem, até 3 MB. O tipo real é conferido pelo conteúdo, não pela extensão.</div>\`,
    [{ label: 'Cancelar', onClick: () => rhAbrirCard(admissaoId) },
     { label: 'Anexar', cls: 'primary', onClick: async (ev) => {
        const f = $('#da-file').files[0];
        if (!f) return modalError('Escolha um arquivo.');
        if (f.size > 3 * 1024 * 1024) return modalError('Arquivo acima do limite de 3 MB.');
        const btn = ev && ev.target; if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
        try {
          const data = await readFileAsBase64(f);
          await api(\`/api/attachments/rh_doc/\${colabId}\`, { method: 'POST', body: {
            file_name: f.name, mime_type: f.type || 'application/octet-stream', kind: 'outro', doc_tipo: cod, data } });
          closeModal(); toast(cfg.ok); rhAbrirCard(admissaoId);
        } catch (e) { modalError(e.message); if (btn) { btn.disabled = false; btn.textContent = 'Anexar'; } }
     }}]);
}

`;
s = s.slice(0, ini) + novo + s.slice(fim);
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
