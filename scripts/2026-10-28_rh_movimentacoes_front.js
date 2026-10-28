// Propósito: telas das movimentações de carreira. (1) Aba Vínculo ganha "Carreira e remuneração" (linha do tempo, agendadas,
//   cancelar, + Registrar movimentação); (2) lista de colaboradores ganha o botão "Dissídio coletivo".
// Entrada: public/app.js (ou a pasta indicada em argv[2]) e scripts/2026-10-28_rh_movimentacoes_front_bloco.txt. Saída: public/app.js editado.
// Uso: node scripts/2026-10-28_rh_movimentacoes_front.js [raiz]   (depois do backend: 2026-10-28_rh_movimentacoes_api.js)
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const bloco = fs.readFileSync(path.join(__dirname, '2026-10-28_rh_movimentacoes_front_bloco.txt'), 'utf8').replace(/\r\n/g, '\n');
const unico = m => { const i = s.indexOf(m); if (i < 0) throw new Error('trecho não achado: ' + m.slice(0, 60)); if (s.indexOf(m, i + 1) >= 0) throw new Error('trecho repetido: ' + m.slice(0, 60)); };
const troca = (de, para) => { unico(de); s = s.replace(de, () => para); };
troca('async function rhFormVinculo(colabId, v, d) {', bloco + 'async function rhFormVinculo(colabId, v, d) {');
troca('    ${rhQuadroCusto(d.custo)}\n    ${rem ? \'<div class="rh-sec rh-resc" id="rh-rescisao"></div>\' : \'\'}',
      '    ${rem ? \'<div class="rh-sec" id="rh-carreira"></div>\' : \'\'}\n    ${rhQuadroCusto(d.custo)}\n    ${rem ? \'<div class="rh-sec rh-resc" id="rh-rescisao"></div>\' : \'\'}');
troca("  const br = painel.querySelector('#rh-rescisao');\n  if (br) rhQuadroRescisao(br, id);",
      "  const br = painel.querySelector('#rh-rescisao');\n  if (br) rhQuadroRescisao(br, id);\n  const bcar = painel.querySelector('#rh-carreira');\n  if (bcar) rhQuadroCarreira(bcar, id, ed, v);");
troca('      <button class="btn primary" id="btn-novo">+ Novo colaborador</button>',
      '      ${canEditPage(\'rh\') && rhTemRemuneracao() ? \'<button class="btn" id="btn-dissidio">Dissídio coletivo</button>\' : \'\'}\n      <button class="btn primary" id="btn-novo">+ Novo colaborador</button>');
troca("  $('#btn-novo').onclick = () => rhFormNovoColaborador(false);",
      "  $('#btn-novo').onclick = () => rhFormNovoColaborador(false);\n  const bdis = $('#btn-dissidio');\n  if (bdis) bdis.onclick = () => rhFormDissidio(() => renderRH());");
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
