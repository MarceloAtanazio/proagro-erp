// Propósito: ASO e Contrato de trabalho assinado passam a ser documentos OBRIGATÓRIOS do dossiê do colaborador (entram no "N documentos
//   faltando" da lista, da ficha e do PDF da ficha). Os dois só existem DEPOIS de partes do processo de admissão (o ASO no exame, o contrato
//   na assinatura), então não podem travar a etapa Documentação nem aparecer como falta no checklist do candidato: ficam marcados como
//   `posAdmissao` e o checklist do card/quadro os deixa de fora. No Painel, o "Dossiê incompleto" também os deixa de fora, porque eles já
//   têm indicadores próprios ("Sem ASO" e "Sem contrato no dossiê") — contar nos dois somaria a mesma falta duas vezes.
// Entrada: api/index.js (ou a pasta indicada em argv[2]). Saída: api/index.js editado. Sem mudança no banco.
// Uso: node scripts/2026-11-03_rh_dossie_aso_contrato_obrigatorios.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const arq = path.join(raiz, 'api/index.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => {
  const i = s.indexOf(de);
  if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 80));
  if (s.indexOf(de, i + 1) >= 0) throw new Error('trecho repetido: ' + de.slice(0, 80));
  s = s.replace(de, () => para);
};

troca("// Tipos de documento do dossiê. Os 11 primeiros são os obrigatórios definidos\n// pela empresa; os demais existem para arquivar sem virar pendência.",
  "// Tipos de documento do dossiê. Os marcados `obrigatorio` são os exigidos pela empresa; os demais existem para arquivar sem virar\n" +
  "// pendência. `posAdmissao`: o documento só passa a existir depois de uma etapa do processo (o ASO no exame admissional, o contrato\n" +
  "// na assinatura), então é cobrado do colaborador, mas NÃO do candidato em admissão — não trava a Documentação.");
troca("  { cod: 'aso',                  nome: 'ASO (saúde ocupacional)',             obrigatorio: false },\n  { cod: 'contrato_assinado',    nome: 'Contrato de trabalho assinado',       obrigatorio: false },",
  "  { cod: 'aso',                  nome: 'ASO (saúde ocupacional)',             obrigatorio: true, posAdmissao: true },\n" +
  "  { cod: 'contrato_assinado',    nome: 'Contrato de trabalho assinado',       obrigatorio: true, posAdmissao: true },");

troca("function rhChecklist(colab, anexos) {", "// `opcoes.semPosAdmissao`: deixa de fora os documentos que só existem depois do processo de admissão (ver RH_DOC_TIPOS).\nfunction rhChecklist(colab, anexos, opcoes = {}) {");
troca("    .filter(d => d.obrigatorio)\n", "    .filter(d => d.obrigatorio)\n    .filter(d => !(opcoes.semPosAdmissao && d.posAdmissao))\n");

// Processo de admissão (card e quadro): o checklist não cobra o que ainda não existe.
troca("  return { adm, colab, checklist: rhChecklist(colab, anexos), mapa };", "  return { adm, colab, checklist: rhChecklist(colab, anexos, { semPosAdmissao: true }), mapa };");
troca("    const chk = rhChecklist(r, tipos.map(t => ({ doc_tipo: t })));\n    const pend = rhPendencias(",
  "    const chk = rhChecklist(r, tipos.map(t => ({ doc_tipo: t })), { semPosAdmissao: true });\n    const pend = rhPendencias(");
// Painel: ASO e contrato têm indicador próprio.
troca("    const chk = rhChecklist(d, (Array.isArray(d.tipos) ? d.tipos : []).map(t => ({ doc_tipo: t })));\n    return chk.some(x => !x.ok);",
  "    const chk = rhChecklist(d, (Array.isArray(d.tipos) ? d.tipos : []).map(t => ({ doc_tipo: t })), { semPosAdmissao: true });\n    return chk.some(x => !x.ok);");

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
