// Propósito: conferir o padrão dos títulos de seção na emissão das minutas (src/docx-merge.js → padronizarTitulos e docxParagrafos).
//   Para cada .docx de "Contrato de Trabalho*.docx" da pasta: o texto não pode mudar, o XML tem de continuar bem formado, a
//   minuta Externa passa a ter todos os títulos centralizados no padrão da Presencial, e as minutas que já estavam certas
//   não podem mudar no que o PDF lê.
// Entrada: pasta com as minutas .docx (argv[2]) e a raiz do projeto (argv[3], padrão: pasta acima de scripts/).
// Saída: PASS/FALHA por verificação; código de saída 1 se alguma falhar.
// Uso: node scripts/2026-10-28_minuta_titulos_verificacao.js "<pasta das minutas>"
const fs = require('fs'), path = require('path');
const raiz = process.argv[3] || path.join(__dirname, '..');
const { zipLer, destag, docxParagrafos, padronizarTitulos } = require(path.join(raiz, 'src/docx-merge.js'));
const pasta = process.argv[2];
const falhas = [];
const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  << ' + JSON.stringify(x))); if (!c) falhas.push(n); };

// Bem formado: toda abertura fecha na ordem certa (suficiente para pegar um replace que quebre o XML).
const bemFormado = xml => {
  const pilha = [];
  for (const m of xml.matchAll(/<(\/?)([A-Za-z][\w:.-]*)\b[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (!m[1]) pilha.push(m[2]);
    else if (pilha.pop() !== m[2]) return false;
  }
  return pilha.length === 0;
};
const RE_TIT = /^(CONTRATO DE TRABALHO|FOLHA DE ASSINATURAS|D[AOE]S?\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 ,.\-–\/()ºª]*)$/;
const ORDEM = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs',
  'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid',
  'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl',
  'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'];

const arquivos = fs.readdirSync(pasta).filter(f => /^Contrato de Trabalho.*\.docx$/.test(f));
for (const f of arquivos) {
  const xml = zipLer(fs.readFileSync(path.join(pasta, f))).find(e => e.nome === 'word/document.xml').dados.toString('utf8');
  const novo = padronizarTitulos(xml);
  const curto = f.replace(/^Contrato de Trabalho( Modelo)? - /, '').replace(/\.docx$/, '');
  console.log('\n== ' + curto);
  ok('o texto do documento não muda', destag(xml.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/g, '')) === destag(novo.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/g, '')), null);
  ok('o XML continua bem formado', bemFormado(novo), null);
  const antes = docxParagrafos(xml), depois = docxParagrafos(novo);
  // Bloco de assinaturas: igual em todas as minutas (traço de 63 sublinhados + nome embaixo, duas vezes; testemunhas em duas colunas).
  const ia = depois.findIndex(p => /^FOLHA DE ASSINATURAS/.test(p.texto));
  const bloco = depois.slice(ia);
  ok('assinaturas: nenhum parágrafo só de números (posição de desenho vazando como texto)', !depois.some(p => /^d{5,}$/.test(p.texto.trim())), depois.filter(p => /^d{5,}$/.test(p.texto.trim())).map(p => p.texto));
  const tracos = bloco.map((p, i) => [p, i]).filter(([p]) => /^_{5,}$/.test(p.texto));
  ok('assinaturas: dois traços do mesmo tamanho (63), cada um logo acima de um nome', tracos.length === 2 && tracos.every(([p, i]) => p.texto.length === 63 && bloco[i + 1] && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(bloco[i + 1].texto) && bloco[i + 1].alinhamento === 'left'), tracos.map(([p, i]) => [p.texto.length, (bloco[i + 1] || {}).texto]));
  ok('assinaturas: testemunhas em duas colunas (1) / 2), Nome:, CPF:)', ['1)', 'Nome:', 'CPF:'].every(t => bloco.some(p => p.texto.startsWith(t) && p.texto.includes('	'))), null);
  const titulosDepois = depois.filter(p => RE_TIT.test(p.texto.trim()) && p.titulo);
  if (/Técnico de Campo - Controle de Ponto - Jornada Externa/.test(f)) {
    const todos = depois.filter(p => RE_TIT.test(p.texto.trim()));
    ok('13 títulos de seção reconhecidos', todos.length === 13, todos.map(p => p.texto));
    ok('todos centralizados e tratados como título no PDF', todos.every(p => p.alinhamento === 'center' && p.titulo), todos.map(p => [p.texto, p.alinhamento, p.titulo]));
    const empresa = depois.find(p => /^PROTEÇÃO AGROPECUÁRIA/.test(p.texto));
    ok('o nome da empresa na assinatura NÃO é título (à esquerda, em negrito)', empresa && !empresa.titulo && empresa.alinhamento === 'left' && empresa.negrito, empresa);
    // cada parágrafo de título: padrão da Presencial
    const paras = novo.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g).filter(p => RE_TIT.test(destag(p.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/g, '')).replace(/\s+/g, ' ').trim()));
    ok('título no padrão: centro, Trebuchet MS 11 pt, negrito, sublinhado, sem sublinhado desligado',
      paras.length === 13 && paras.every(p => /<w:jc w:val="center"\/>/.test(p) && /Trebuchet MS/.test(p) && /<w:sz w:val="22"\/>/.test(p) && /<w:b\/>/.test(p) && /<w:u w:val="single"\/>/.test(p) && !/<w:u w:val="none"\/>/.test(p)), paras.length);
    ok('espaçamento e recuo padronizados (sem recuos de 101–140 do conversor)', paras.every(p => /w:before="0" w:line="276"/.test(p) && /<w:ind w:left="0"/.test(p)), null);
    ok('elementos do pPr na ordem do esquema do Word', paras.every(p => {
      const ppr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(p)[1];
      const nomes = [...ppr.matchAll(/<w:([A-Za-z]+)\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/w:\1>)/g)].map(m => ORDEM.indexOf(m[1]));
      return nomes.every((v, i) => v >= 0 && (i === 0 || v >= nomes[i - 1]));
    }), null);
    ok('as cláusulas não foram alteradas', (novo.match(/CLÁUSULA/g) || []).length === (xml.match(/CLÁUSULA/g) || []).length
      && novo.includes('<w:spacing w:before="1" w:line="360" w:lineRule="auto"/><w:ind w:left="107" w:right="247"/>'), null);
  } else {
    // Minutas que já estavam no padrão: o que o PDF lê não pode mudar.
    ok('o que o PDF lê (alinhamento, título, negrito, texto) não muda', JSON.stringify(antes.map(p => [p.texto, p.alinhamento, p.titulo])) === JSON.stringify(depois.map(p => [p.texto, p.alinhamento, p.titulo])),
      antes.map((p, i) => [p, depois[i]]).filter(([a, b]) => !b || a.texto !== b.texto || a.alinhamento !== b.alinhamento || a.titulo !== b.titulo).slice(0, 3));
    ok('quando há títulos, continuam centralizados', titulosDepois.every(p => p.alinhamento === 'center'), null);
  }
}
console.log('\n' + (falhas.length ? 'FALHAS: ' + falhas.join(' | ') : 'Todas as verificações passaram.'));
process.exit(falhas.length ? 1 : 0);
