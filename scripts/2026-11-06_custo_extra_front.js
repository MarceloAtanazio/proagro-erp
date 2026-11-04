// Propósito: "OT de custo extra" em Viáticos (tela). Terceira opção no complementar — "Só um custo extra" — com formulário próprio de uma etapa
//   (tipo do custo, valor, justificativa), sem diárias. Também: o botão ↪ da lista aparece para OT aguardando comprovação (onde só o custo extra vale)
//   e some nas OTs de custo extra; OT de custo extra não gera PDF de viagem; a comprovação dela não prevê hospedagem (noites = 0) e o detalhe não mostra "Baixar PDF".
// Entrada: public/app.js (ou a pasta indicada em argv[2]) e scripts/2026-11-06_custo_extra_front_bloco.txt. Saída: o arquivo editado.
// Uso: node scripts/2026-11-06_custo_extra_front.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const bloco = fs.readFileSync(path.join(__dirname, '2026-11-06_custo_extra_front_bloco.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
const arq = path.join(raiz, 'public/app.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => {
  const i = s.indexOf(de);
  if (i < 0) throw new Error('trecho não achado: ' + de.slice(0, 90));
  if (s.indexOf(de, i + 1) >= 0) throw new Error('trecho repetido: ' + de.slice(0, 90));
  s = s.replace(de, () => para);
};

// 1) as duas telas (substitui a viaWizComplTipo antiga, com o comentário que a precede)
{
  const ini = s.indexOf('// Escolha do tipo de complementar (só quando o assistente foi aberto a partir de uma OT em curso).\nfunction viaWizComplTipo() {');
  const fim = s.indexOf('\nfunction viaWizProgress(atual) {');
  if (ini < 0 || fim < 0 || fim < ini) throw new Error('região de viaWizComplTipo não achada');
  s = s.slice(0, ini) + bloco + '\n' + s.slice(fim);
}

// 2) a OT de origem pode ser uma de custo extra? não (o botão some); guarda o status dela e tira o sufixo do número
troca("const raizOt = String(pai.ordem_trabalho || pai.id).replace(/ - Complementar( \\d+)?$/i, '');\n    const ini = String(pai.data_fim)",
      "const raizOt = String(pai.ordem_trabalho || pai.id).replace(/ - (Complementar|Custo extra)( \\d+)?$/i, '');\n    const ini = String(pai.data_fim)");
troca("VIA_WIZ.complementar = { pai_id: pai.id, tipo: null, raiz: raizOt,", "VIA_WIZ.complementar = { pai_id: pai.id, tipo: null, status_pai: pai.status, raiz: raizOt,");

// 3) botão da lista
troca("${meuColaborador && s.colaborador_id === meuColaborador.id && ['transferencia_agendada', 'liberado', 'em_viagem'].includes(s.status) ? `<button class=\"btn-ic\" data-compl=\"${s.id}\" title=\"Complementar: estender esta OT no local ou partir daqui para um novo destino\"",
      "${meuColaborador && s.colaborador_id === meuColaborador.id && s.complementar_tipo !== 'custo_extra' && ['transferencia_agendada', 'liberado', 'em_viagem', 'aguardando_comprovacao'].includes(s.status) ? `<button class=\"btn-ic\" data-compl=\"${s.id}\" title=\"Complementar: estender esta OT no local, ir a um novo destino ou pedir só um custo extra (ex.: remarcação de passagem)\"");

// 4) PDF: OT de custo extra não tem viagem para descrever
troca("function viaTemPdfSolicitacao(s) { return !!s && s.origem === 'colaborador'; }",
      "function viaTemPdfSolicitacao(s) { return !!s && s.origem === 'colaborador' && s.complementar_tipo !== 'custo_extra'; }");

// 5) comprovação: custo extra não prevê hospedagem
troca("  const { dias, noites: noitesPeriodo } = viaDiasNoites(s.data_inicio, s.data_fim, !!s.solicitacao_pai_id);\n  // Mesma regra da previsão",
      "  const { dias, noites: noitesPeriodo } = s.complementar_tipo === 'custo_extra' ? { dias: 0, noites: 0 } : viaDiasNoites(s.data_inicio, s.data_fim, !!s.solicitacao_pai_id);\n  // Mesma regra da previsão");

// 6) detalhe da OT: custo extra não tem PDF de viagem (o botão fica oculto em vez de cair numa mensagem enganosa)
troca("  botoes.push({ label: 'Baixar PDF', onClick: () => viaBaixarPdfSolicitacao(s) });",
      "  if (s.complementar_tipo !== 'custo_extra') botoes.push({ label: 'Baixar PDF', onClick: () => viaBaixarPdfSolicitacao(s) });");

fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
