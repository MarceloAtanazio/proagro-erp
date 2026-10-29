// Propósito: na etapa "Exame admissional" do card de admissão, seção "ASO — Atestado de Saúde Ocupacional" para anexar,
//   ver e excluir o ASO na hora de registrar a realização do exame. O arquivo vai para o DOSSIÊ do colaborador
//   (/api/attachments/rh_doc/:id, doc_tipo "aso"), o mesmo lugar onde o ASO é cobrado e contado na conformidade — não
//   fica preso ao processo, continua lá depois da contratação. Não precisa de mudança no backend nem no banco.
// Entrada: public/app.js (ou a pasta indicada em argv[2]). Saída: public/app.js editado.
// Uso: node scripts/2026-10-29_exame_admissional_anexar_aso.js [raiz]
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

// 1) A seção aparece logo depois dos "Marcos desta etapa", só no Exame admissional; o conteúdo é carregado depois.
troca('    ${/* Os resultados de técnica/psicotécnico se preenchem no "Marcos desta',
  '    ${a.etapa === \'exame_admissional\' ? \'<div class="rh-sec" id="rh-aso-sec"><h4>ASO — Atestado de Saúde Ocupacional</h4><div class="ec-anexo-vazio">Carregando…</div></div>\' : \'\'}\n\n' +
  '    ${/* Os resultados de técnica/psicotécnico se preenchem no "Marcos desta');

// 2) Liga a seção quando o card abre.
troca("  const addCv = $('#rh-add-curriculo');\n  if (addCv) addCv.onclick = () => rhAnexarCurriculo(id);",
  "  const addCv = $('#rh-add-curriculo');\n  if (addCv) addCv.onclick = () => rhAnexarCurriculo(id);\n  rhCarregarAso(a.colaborador_id, id, ed, d.pode.sensivel);");

// 3) A seção e o formulário de anexo.
troca('// Currículo do candidato — mesmo entity_type do laudo (rh_admissao_doc), só',
  `// ASO do exame admissional. É dado de saúde, então exige a trava de dado sensível (a mesma do dossiê). Fica no dossiê do
// COLABORADOR (rh_doc, tipo "aso"): o documento é da pessoa, aparece em Dossiê → Arquivos e conta na conformidade de RH.
async function rhCarregarAso(colabId, admissaoId, ed, sensivel) {
  const box = $('#rh-aso-sec');
  if (!box) return;
  const titulo = '<h4>ASO — Atestado de Saúde Ocupacional</h4>';
  if (!sensivel) {
    box.innerHTML = titulo + '<div class="rh-nota">🔒 O ASO é dado de saúde: exige a permissão “RH · dados pessoais sensíveis”.</div>';
    return;
  }
  let lista = [];
  try { lista = (await api('/api/attachments/rh_doc/' + colabId)).filter(x => x.doc_tipo === 'aso'); }
  catch (e) { box.innerHTML = titulo + \`<div class="ec-anexo-vazio">\${esc(e.message)}</div>\`; return; }
  box.innerHTML = titulo +
    (lista.length ? lista.map(x => \`<div class="ec-anexo-item">
        <span>🩺</span>
        <div class="ec-anexo-nome" title="\${esc(x.file_name)}">\${esc(x.file_name)}</div>
        <small>\${fmtSize(x.byte_size)} · \${rhData(x.created_at)}</small>
        <button class="btn sm" data-ver-aso="\${x.id}" type="button">Ver</button>
        \${ed ? \`<button class="btn sm danger-ghost" data-del-aso="\${x.id}" type="button">Excluir</button>\` : ''}
      </div>\`).join('') : '<div class="ec-anexo-vazio">Nenhum ASO anexado ainda.</div>') +
    (ed ? \`<div class="rh-acoes"><button class="btn sm" id="rh-add-aso" type="button">📎 Anexar ASO</button></div>\` : '') +
    '<div class="rh-nota">O ASO também fica no <strong>Dossiê</strong> do colaborador, junto dos demais documentos.</div>';
  box.querySelectorAll('[data-ver-aso]').forEach(b => b.onclick = () => colabVerAnexo(Number(b.dataset.verAso)));
  box.querySelectorAll('[data-del-aso]').forEach(b => b.onclick = () =>
    confirmDelete('ASO', '/api/attachments/' + b.dataset.delAso, () => rhAbrirCard(admissaoId)));
  const add = box.querySelector('#rh-add-aso');
  if (add) add.onclick = () => rhAnexarAso(colabId, admissaoId);
}

function rhAnexarAso(colabId, admissaoId) {
  openModal('Anexar ASO', \`
    <div class="field"><label for="aso-file">Arquivo do ASO</label><input type="file" id="aso-file"
      accept=".pdf,.jpg,.jpeg,.png,.webp"></div>
    <div class="rh-nota">PDF ou imagem, até 3 MB. O tipo real é conferido pelo conteúdo, não pela extensão.</div>\`,
    [{ label: 'Cancelar', onClick: () => rhAbrirCard(admissaoId) },
     { label: 'Anexar', cls: 'primary', onClick: async (ev) => {
        const f = $('#aso-file').files[0];
        if (!f) return modalError('Escolha um arquivo.');
        if (f.size > 3 * 1024 * 1024) return modalError('Arquivo acima do limite de 3 MB.');
        const btn = ev && ev.target; if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
        try {
          const data = await readFileAsBase64(f);
          await api(\`/api/attachments/rh_doc/\${colabId}\`, { method: 'POST', body: {
            file_name: f.name, mime_type: f.type || 'application/octet-stream', kind: 'outro', doc_tipo: 'aso', data } });
          closeModal(); toast('ASO anexado.'); rhAbrirCard(admissaoId);
        } catch (e) { modalError(e.message); if (btn) { btn.disabled = false; btn.textContent = 'Anexar'; } }
     }}]);
}

// Currículo do candidato — mesmo entity_type do laudo (rh_admissao_doc), só`);

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
