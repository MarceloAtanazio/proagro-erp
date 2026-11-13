// Propósito: gerar public/br-mapa.js (mapa do Brasil por estado, para o painel de Recursos Humanos) a partir da malha oficial do IBGE por UF em SVG
//   (https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=image/svg+xml&qualidade=minima&intrarregiao=UF, guardada em scripts/2026-11-13_mapa_brasil_ibge_uf.svg).
//   Os caminhos já vêm em graus (x = longitude, y = −latitude, dentro de um grupo com escala 0,0001); além deles, calcula o centro de cada estado (usado só quando a cidade não tem coordenada).
// Entrada: o SVG do IBGE (argv[2], padrão scripts/2026-11-13_mapa_brasil_ibge_uf.svg). Saída: public/br-mapa.js (argv[3] opcional).
// Como executar: node scripts/2026-11-13_mapa_brasil_gerar.js [svg] [saida]
const fs = require('fs'), path = require('path');
const svgArq = process.argv[2] || path.join(__dirname, '2026-11-13_mapa_brasil_ibge_uf.svg');
const saida = process.argv[3] || path.join(__dirname, '..', 'public', 'br-mapa.js');
const COD = { 11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF' };
const svg = fs.readFileSync(svgArq, 'utf8');
const vb = /viewBox="([^"]+)"/.exec(svg)[1];
const caminhos = [...svg.matchAll(/<path id="(\d+)" d="([^"]+)"/g)];
if (caminhos.length !== 27) throw new Error('esperava 27 estados, achei ' + caminhos.length);
// centro do maior contorno (caixa envolvente), em graus: x = lon, y = lat
function centro(d) {
  const subs = []; let atual = null, x = 0, y = 0;
  for (const m of d.matchAll(/([MlhvZz])([^MlhvZz]*)/g)) {
    const c = m[1], n = (m[2].match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (c === 'M') { x = n[0]; y = n[1]; atual = { pts: [[x, y]] }; subs.push(atual); for (let i = 2; i + 1 < n.length; i += 2) { x = n[i]; y = n[i + 1]; atual.pts.push([x, y]); } }
    else if (c === 'l') for (let i = 0; i + 1 < n.length; i += 2) { x += n[i]; y += n[i + 1]; atual.pts.push([x, y]); }
    else if (c === 'h') n.forEach(v => { x += v; atual.pts.push([x, y]); });
    else if (c === 'v') n.forEach(v => { y += v; atual.pts.push([x, y]); });
  }
  const caixa = s => { const xs = s.pts.map(p => p[0]), ys = s.pts.map(p => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
  const todos = subs.flatMap(s => s.pts), bx = todos.map(p => p[0] * 0.0001), by = todos.map(p => -p[1] * 0.0001);
  const caixaTotal = [+Math.min(...bx).toFixed(3), +Math.min(...by).toFixed(3), +Math.max(...bx).toFixed(3), +Math.max(...by).toFixed(3)];   // x0, y0, x1, y1 em unidades do viewBox (x = lon, y = −lat)
  const maior = subs.map(s => ({ s, b: caixa(s) })).sort((a, b) => (b.b.x1 - b.b.x0) * (b.b.y1 - b.b.y0) - (a.b.x1 - a.b.x0) * (a.b.y1 - a.b.y0))[0].b;
  // no arquivo y já é a latitude NEGADA pelo grupo (scale(0.0001,-0.0001)): lat = y * 0.0001 * -1 * -1 ... os caminhos guardam y = −lat/0,0001 × −1; na prática lat = −(y × −0.0001) = y × 0,0001
  return { lon: +(((maior.x0 + maior.x1) / 2) * 0.0001).toFixed(3), lat: +(((maior.y0 + maior.y1) / 2) * 0.0001).toFixed(3), b: caixaTotal };
}
const ufs = {}; caminhos.forEach(([, id, d]) => { { const { b, ...c } = centro(d); ufs[COD[id]] = { d, c, b }; } });
const out = '// Mapa do Brasil por estado (malha do IBGE, qualidade mínima). Gerado por scripts/2026-11-13_mapa_brasil_gerar.js — não editar à mão.\n' +
  '// Cada caminho está em 1/10000 de grau dentro de um grupo com transform="scale(0.0001,-0.0001)": x = longitude, y = −latitude em unidades do viewBox.\n' +
  'const BR_MAPA = ' + JSON.stringify({ viewBox: vb, ufs }) + ';\n';
fs.writeFileSync(saida, out); console.log('ok', Object.keys(ufs).length, 'estados,', Math.round(out.length / 1024) + ' KB');
console.log(Object.entries(ufs).slice(0, 5).map(([k, v]) => k + ' ' + JSON.stringify(v.c)).join(' | '));
