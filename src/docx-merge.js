// ============================================================================
// Motor de mesclagem de minutas .docx — protótipo
//
// Estratégia: o REALCE é o marcador, não o texto.
//
// Por que não procurar "[CAMPO]": nesta minuta dois campos diferentes têm o
// MESMO texto -- os dois `DD/MM/AAAA` (fim da experiência e fim da prorrogação)
// e os dois `XXXXXXXXX` (número e série da CTPS). Busca por texto não os
// distingue. Já a ordem dos trechos realçados no documento distingue, e é
// estável: é a ordem de leitura.
//
// Além disso o realce resolve o problema dos runs fatiados de graça: `R$
// XX.XXX,XX` está partido em 2 runs nesta minuta, e como o grupo de runs
// realçados contíguos é colapsado num só, a substituição não depende de o Word
// ter mantido o texto inteiro num run.
//
// Sem dependências: leitor e escritor de zip próprios.
// ============================================================================
const fs = require('fs'), zlib = require('zlib'), path = require('path');

// ---------------------------------------------------------------- zip: ler ---
function zipLer(buf) {
  // Percorre o diretório central (não os headers locais): é lá que estão os
  // tamanhos confiáveis, mesmo quando o header local usa data descriptor.
  const fimCD = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fimCD < 0) throw new Error('não é um zip: sem End of Central Directory');
  const nEntradas = buf.readUInt16LE(fimCD + 10);
  let off = buf.readUInt32LE(fimCD + 16);
  const entradas = [];
  for (let i = 0; i < nEntradas; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('diretório central corrompido');
    const metodo = buf.readUInt16LE(off + 10);
    const crc = buf.readUInt32LE(off + 16);
    const compTam = buf.readUInt32LE(off + 20);
    const brutoTam = buf.readUInt32LE(off + 24);
    const nomeTam = buf.readUInt16LE(off + 28);
    const extraTam = buf.readUInt16LE(off + 30);
    const comentTam = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const nome = buf.toString('utf8', off + 46, off + 46 + nomeTam);
    // dados: pula o header local (30 + nome + extra do header LOCAL)
    const lNomeTam = buf.readUInt16LE(localOff + 26);
    const lExtraTam = buf.readUInt16LE(localOff + 28);
    const ini = localOff + 30 + lNomeTam + lExtraTam;
    const comp = buf.slice(ini, ini + compTam);
    const dados = metodo === 8 ? zlib.inflateRawSync(comp) : comp;
    if (dados.length !== brutoTam) throw new Error('tamanho divergente em ' + nome);
    entradas.push({ nome, dados, crc });
    off += 46 + nomeTam + extraTam + comentTam;
  }
  return entradas;
}

// -------------------------------------------------------------- zip: crc32 ---
const TAB_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ TAB_CRC[(c ^ buf[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}

// ------------------------------------------------------------ zip: escrever ---
function zipEscrever(entradas) {
  const locais = [], central = [];
  let off = 0;
  for (const e of entradas) {
    const nome = Buffer.from(e.nome, 'utf8');
    const comp = zlib.deflateRawSync(e.dados, { level: 9 });
    const crc = crc32(e.dados);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(8, 8);                       // deflate
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);   // hora/data
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.dados.length, 22);
    lh.writeUInt16LE(nome.length, 26); lh.writeUInt16LE(0, 28);
    locais.push(lh, nome, comp);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(e.dados.length, 24);
    ch.writeUInt16LE(nome.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(off, 42);
    central.push(ch, nome);

    off += lh.length + nome.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entradas.length, 8); eocd.writeUInt16LE(entradas.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locais, cd, eocd]);
}

// --------------------------------------------------- número → texto (pt-BR) ---
const UNI = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEM = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function trio(n) {                                  // 0..999
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), d = Math.floor((n % 100) / 10), u = n % 10;
  const p = [];
  if (c) p.push(CEM[c]);
  if (d === 1) p.push(DEZ_A[u]);
  else { if (d) p.push(DEZ[d]); if (u) p.push(UNI[u]); }
  return p.join(' e ');
}
// Escalas em ordem decrescente. `trio` só sabe 0..999, então o número é quebrado
// em grupos de três antes de chegar nele -- foi o que faltava na primeira versão,
// que fazia R$ 1.026.446,01 sair como " e vinte e seis mil...".
const ESCALAS = [
  { valor: 1e9, sing: 'bilhão', plur: 'bilhões' },
  { valor: 1e6, sing: 'milhão', plur: 'milhões' },
  { valor: 1e3, sing: 'mil', plur: 'mil' }
];
function inteiroEmTexto(n) {
  if (n === 0) return 'zero';
  const partes = [];
  let resto = n;
  for (const e of ESCALAS) {
    const q = Math.floor(resto / e.valor);
    if (!q) continue;
    resto -= q * e.valor;
    // "mil" não leva "um" na frente: mil reais, não um mil reais
    if (e.valor === 1e3 && q === 1) partes.push('mil');
    else partes.push(inteiroEmTexto(q) + ' ' + (q === 1 ? e.sing : e.plur));
  }
  if (resto) partes.push(trio(resto));
  if (partes.length === 1) return partes[0];
  // O "e" liga o último grupo só quando ele é menor que 100 ou centena redonda:
  // "oito mil duzentos e trinta e seis", mas "mil e um".
  const ult = partes.pop();
  const ligaComE = resto > 0 && (resto < 100 || resto % 100 === 0);
  return partes.join(', ') + (ligaComE ? ' e ' : ' ') + ult;
}
function reaisEmTexto(valor) {
  const cent = Math.round(valor * 100);
  const r = Math.floor(cent / 100), c = cent % 100;
  const pc = c === 1 ? 'um centavo' : inteiroEmTexto(c) + ' centavos';
  if (!r) return pc;                                  // R$ 0,17 -> "dezessete centavos"
  const pr = r === 1 ? 'um real' : inteiroEmTexto(r) + ' reais';
  return c ? pr + ' e ' + pc : pr;
}
const brl = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ------------------------------------------------- mesclagem no document.xml ---
const destag = s => s.replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Localiza os grupos de runs realçados contíguos, na ordem do documento.
function acharSlots(xml) {
  const runs = [];
  const re = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const bruto = m[0];
    const rPr = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(bruto);
    const realce = /<w:highlight\s+w:val="([^"]+)"/.exec(rPr ? rPr[0] : '');
    runs.push({
      ini: m.index, fim: m.index + bruto.length, bruto,
      realce: realce && realce[1] !== 'none' ? realce[1] : null,
      txt: destag(bruto.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, ''))
    });
  }
  const slots = [];
  let atual = null;
  runs.forEach((r, i) => {
    if (r.realce) {
      if (atual && atual.fimIdx === i - 1) { atual.runs.push(r); atual.fimIdx = i; }
      else { atual = { runs: [r], fimIdx: i }; slots.push(atual); }
    } else if (atual && atual.fimIdx === i - 1 && r.txt.trim() === '' && r.txt.length === 0) {
      atual.runs.push(r); atual.fimIdx = i;      // run vazio não quebra o grupo
    }
  });
  return slots.map((s, i) => ({
    n: i + 1,
    texto: s.runs.map(r => r.txt).join(''),
    nRuns: s.runs.length,
    ini: s.runs[0].ini,
    fim: s.runs[s.runs.length - 1].fim,
    runs: s.runs
  }));
}

// Na minuta os colchetes ficam FORA do amarelo -- `[` e `]` estão em runs
// vizinhos, não no trecho realçado. Sem tratá-los, o contrato final sai com
// "e de outro, [ANA CAROLINA...], [brasileira], [solteira], portador(a) do RG".
// Estas duas funções comem o colchete do run vizinho, e só quando ele encosta
// num slot que foi realmente preenchido -- um `[` no meio de uma cláusula fica
// onde está.
const CONTEUDO_T = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
function comerColcheteFinal(gap) {          // remove o `[` no fim do último <w:t>
  const achados = [...gap.matchAll(CONTEUDO_T)];
  for (let i = achados.length - 1; i >= 0; i--) {
    const m = achados[i];
    if (!m[2].length) continue;                        // <w:t/> vazio: olha o anterior
    if (!/\[$/.test(m[2])) return gap;
    return gap.slice(0, m.index) + m[1] + m[2].replace(/\[$/, '') + m[3] + gap.slice(m.index + m[0].length);
  }
  return gap;
}
function comerColcheteInicial(gap) {        // remove o `]` no início do primeiro <w:t>
  for (const m of gap.matchAll(CONTEUDO_T)) {
    if (!m[2].length) continue;
    if (!/^\]/.test(m[2])) return gap;
    return gap.slice(0, m.index) + m[1] + m[2].replace(/^\]/, '') + m[3] + gap.slice(m.index + m[0].length);
  }
  return gap;
}

// Escreve os valores. Colapsa cada grupo num run só, tira o realce, come os
// colchetes que envolviam o campo.
function mesclar(xml, slots, valores) {
  const pedacos = [];
  let cursor = 0;
  let fecharAnterior = false;   // o slot anterior foi preenchido: este gap pode começar com `]`
  slots.forEach((s, i) => {
    const valor = valores[i];
    if (valor === undefined) return;              // slot sem mapeamento: intocado
    let gap = xml.slice(cursor, s.ini);
    if (fecharAnterior) gap = comerColcheteInicial(gap);
    gap = comerColcheteFinal(gap);
    pedacos.push(gap);

    const base = s.runs[0].bruto;
    let rPr = (/<w:rPr>[\s\S]*?<\/w:rPr>/.exec(base) || [''])[0];
    rPr = rPr.replace(/<w:highlight\s+w:val="[^"]*"\s*\/>/g, '');   // sai o amarelo
    const espacos = /^\s|\s$/.test(valor) ? ' xml:space="preserve"' : '';
    pedacos.push('<w:r>' + rPr + '<w:t' + espacos + '>' + esc(valor) + '</w:t></w:r>');
    cursor = s.fim;
    fecharAnterior = true;
  });
  let resto = xml.slice(cursor);
  if (fecharAnterior) resto = comerColcheteInicial(resto);
  pedacos.push(resto);
  return pedacos.join('');
}

// ----------------------------------------------------------------- exportado ---
// ------------------------------------------------------------------- CLI -----
// Exportado como função em vez de ficar solto sob `require.main === module`:
// tools/rh/docx-merge.js é uma ponte para cá, e por ela `require.main` aponta
// para a ponte — o CLI nunca dispararia.
function cli(argv) {
  const [, , modelo, saida, jsonValores] = argv;
  const entradas = zipLer(fs.readFileSync(modelo));
  const doc = entradas.find(e => e.nome === 'word/document.xml');
  const xml = doc.dados.toString('utf8');
  const slots = acharSlots(xml);

  if (!saida) {                                    // só inspecionar
    console.log('SLOTS REALÇADOS: ' + slots.length + '\n');
    slots.forEach(s => console.log(
      String(s.n).padStart(2) + '. "' + s.texto + '"' + (s.nRuns > 1 ? '   [' + s.nRuns + ' runs]' : '')));
    process.exit(0);
  }

  const valores = JSON.parse(fs.readFileSync(jsonValores, 'utf8'));
  const novo = mesclar(xml, slots, valores);
  doc.dados = Buffer.from(novo, 'utf8');
  fs.writeFileSync(saida, zipEscrever(entradas));
  console.log('gerado: ' + path.basename(saida));
}

module.exports = { zipLer, zipEscrever, acharSlots, mesclar, reaisEmTexto, inteiroEmTexto, brl, destag, cli };

if (require.main === module) cli(process.argv);

// ---------------------------------------------------------------------------
// Parágrafos com formatação, para gerar o PDF do documento mesclado.
//
// O alinhamento e o negrito são LIDOS do .docx (w:jc, w:b), não adivinhados por
// heurística de texto. Adivinhar erra: "DO OBJETO" e "CLÁUSULA 1ª: ..." são os
// dois em caixa alta no começo, e só um é título de seção.
// ---------------------------------------------------------------------------
const ehNegrito = s => /<w:b\s*\/>|<w:b\s+w:val="(?:1|true|on)"/.test(s);

function docxParagrafos(xml) {
  const paras = [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map(m => m[1]);
  return paras.map(p => {
    const props = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(p);
    const pPr = props ? props[1] : '';
    const jc = /<w:jc\s+w:val="([^"]+)"/.exec(pPr);
    // Os títulos de seção desta minuta ("DO OBJETO", "DO PRAZO"…) não são
    // negrito: são o estilo Título 1 do Word, com sublinhado. Detectar por
    // negrito perdia 8 dos 12.
    const pStyle = /<w:pStyle\s+w:val="([^"]+)"/.exec(pPr);
    const estiloTitulo = !!(pStyle && /^(T[íi]?tulo|Heading)\d?/i.test(pStyle[1]));
    // O negrito NÃO é lido do <w:pPr>: lá dentro o Word guarda um <w:rPr> que
    // formata só a marca de parágrafo (¶), não o texto. Lendo de lá, a cláusula
    // 6ª — que tem apenas o prefixo em negrito — vinha inteira como título.
    const runs = [...p.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)]
      .map(m => {
        const rPr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(m[1]);
        const t = destag(m[1].replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, ''));
        return { texto: t, negrito: !!(rPr && ehNegrito(rPr[1])) };
      })
      .filter(r => r.texto !== '');
    // Runs vizinhos com a mesma formatação viram um só: o Word fatia texto sem
    // critério, e 15 runs para uma frase viram 15 chamadas de desenho no PDF.
    const juntos = [];
    for (const r of runs) {
      const ult = juntos[juntos.length - 1];
      if (ult && ult.negrito === r.negrito) ult.texto += r.texto;
      else juntos.push({ ...r });
    }
    const texto = juntos.map(r => r.texto).join('');
    const alinhamento = jc ? jc[1] : 'left';
    const negrito = juntos.length > 0 && juntos.every(r => r.negrito);
    return {
      texto,
      runs: juntos,
      negrito,
      alinhamento,
      // As seções desta minuta vêm de duas formas: umas com o estilo Título 1
      // do Word (sublinhadas, sem negrito) e outras em negrito centralizado.
      // Só o negrito não basta como sinal — o bloco de assinaturas também é
      // todo negrito, e tratá-lo como seção poria um sublinhado embaixo da
      // linha de assinatura, que já é um traço. O que separa os dois é o
      // CENTRALIZADO: título é centralizado, assinatura é à esquerda.
      titulo: estiloTitulo || (negrito && alinhamento === 'center')
    };
  }).filter((x, i, a) => x.texto !== '' || (i > 0 && a[i - 1].texto !== ''));  // colapsa vazios seguidos
}

module.exports.docxParagrafos = docxParagrafos;
