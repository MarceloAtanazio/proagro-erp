// Extrai de um .docx: (a) o texto corrido, (b) os trechos com REALCE (highlight),
// agrupando runs realçados contíguos, e (c) quantos runs cada trecho ocupa no XML
// -- esse último número é o que decide se um replace ingênuo funcionaria.
const fs = require('fs'), zlib = require('zlib');

function lerZip(buf, alvo) {
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue;
    const metodo = buf.readUInt16LE(i + 8);
    let compTam = buf.readUInt32LE(i + 18);
    const nomeTam = buf.readUInt16LE(i + 26), extraTam = buf.readUInt16LE(i + 28);
    const nome = buf.toString('utf8', i + 30, i + 30 + nomeTam);
    if (nome !== alvo) continue;
    const ini = i + 30 + nomeTam + extraTam;
    if (compTam === 0) {                       // tamanho no descritor: acha o próximo header
      let fim = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), ini);
      if (fim < 0) fim = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), ini);
      compTam = (fim < 0 ? buf.length : fim) - ini - 16;
    }
    const dados = buf.slice(ini, ini + compTam);
    return metodo === 8 ? zlib.inflateRawSync(dados) : dados;
  }
  return null;
}

const destag = s => s.replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const xml = lerZip(fs.readFileSync(process.argv[2]), 'word/document.xml').toString('utf8');

// ---- texto corrido, parágrafo por parágrafo ----
// Fatia por parágrafo COMPLETO. Cortando em `<w:p ` os atributos do próprio
// <w:p> sobram no texto -- eles não têm "<" na frente para o destag remover.
const paras = [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map(mm => mm[1]);
const linhas = paras.map(p => destag(p.replace(/<w:tab\b[^>]*\/>/g, '\t')).trim());

// ---- runs, com a marca de realce ----
// Um run é <w:r>...</w:r>; o realce vive em <w:rPr><w:highlight w:val="..."/>
const runs = [];
const reRun = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
let m, ordem = 0;
while ((m = reRun.exec(xml)) !== null) {
  const interno = m[1];
  const realce = /<w:highlight\s+w:val="([^"]+)"/.exec(interno);
  const txt = destag(interno.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, ''));
  runs.push({ ordem: ordem++, realce: realce ? realce[1] : null, txt, pos: m.index });
}

// ---- agrupa runs realçados CONTÍGUOS num só trecho ----
const trechos = [];
let atual = null;
for (const r of runs) {
  const marcado = r.realce && r.realce !== 'none';
  if (marcado) {
    if (atual && atual.ultimoOrdem === r.ordem - 1) {
      atual.txt += r.txt; atual.runs++; atual.ultimoOrdem = r.ordem;
    } else {
      atual = { txt: r.txt, cor: r.realce, runs: 1, ultimoOrdem: r.ordem, primeiroOrdem: r.ordem };
      trechos.push(atual);
    }
  } else if (atual && r.txt.trim() === '' && atual.ultimoOrdem === r.ordem - 1) {
    // run vazio entre dois realçados: não quebra o trecho
    atual.ultimoOrdem = r.ordem; atual.runs++;
  }
}

const modo = process.argv[3] || 'realce';

if (modo === 'texto') {
  linhas.forEach((l, i) => { if (l) console.log(String(i + 1).padStart(3) + '  ' + l); });
} else if (modo === 'realce') {
  console.log('REALCES ENCONTRADOS: ' + trechos.length + '   (de ' + runs.length + ' runs no documento)\n');
  trechos.forEach((t, i) => {
    const frag = t.runs > 1 ? '  ⚠ FATIADO EM ' + t.runs + ' RUNS' : '';
    console.log(String(i + 1).padStart(2) + '. [' + t.cor + '] "' + t.txt.trim() + '"' + frag);
  });
  console.log('\n--- contexto de cada realce (parágrafo onde aparece) ---');
  trechos.forEach((t, i) => {
    const alvo = t.txt.trim();
    if (!alvo) return;
    const li = linhas.findIndex(l => l.includes(alvo));
    if (li >= 0) {
      const l = linhas[li];
      const p = l.indexOf(alvo);
      const ini = Math.max(0, p - 110), fim = Math.min(l.length, p + alvo.length + 110);
      console.log('\n' + String(i + 1).padStart(2) + '. …' + l.slice(ini, p) + ' >>>' + alvo + '<<< ' + l.slice(p + alvo.length, fim) + '…');
    }
  });
}
