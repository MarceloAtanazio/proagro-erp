// Propósito: mapa de RH — bolhas menores e botão "Ampliar na equipe" / "Brasil inteiro": a equipe fica concentrada em poucos estados, então o botão aproxima o mapa deles
//   (o desenho é reescalado: bolhas, números e siglas acompanham o zoom). Padrão continua sendo o Brasil inteiro.
// Entrada: public/rh-mapa.js e public/styles.css (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-13_rh_mapa_zoom.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel); let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 90)); if (s.indexOf(de, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  fn(troca, () => s, v => { s = v; }); fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
edita('public/rh-mapa.js', troca => {
  troca("const r = (0.5 + 0.3 * Math.sqrt(c.n)).toFixed(2);", "const r = (0.38 + 0.24 * Math.sqrt(c.n)).toFixed(2);");
  troca('<circle cx="${c.lon}" cy="${-c.lat}" r="${r}"/>', '<circle cx="${c.lon}" cy="${-c.lat}" r="${r}" data-r="${r}"/>');
  troca('<span class="b"><i></i> cidade (tamanho = pessoas)</span></div>', '<span class="b"><i></i> cidade (tamanho = pessoas)</span><button type="button" class="rh-mapa-zoom" aria-pressed="false">Ampliar na equipe</button></div>');
  troca("  el.querySelectorAll('.rh-mapa-uf').forEach(li => {",
    "  // zoom: enquadra as cidades da equipe (quadrado com folga) e reescala bolhas, números e siglas junto\n" +
    "  const svg = el.querySelector('.rh-mapa-svg'), vbCheio = BR_MAPA.viewBox.split(' ').map(Number), btnZoom = el.querySelector('.rh-mapa-zoom');\n" +
    "  const pts = estados.flatMap(u => [...u.cidades.values()]), lons = pts.map(c => c.lon), lats = pts.map(c => c.lat);\n" +
    "  const lado = Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats)) + 7, cx = (Math.max(...lons) + Math.min(...lons)) / 2, cy = -(Math.max(...lats) + Math.min(...lats)) / 2;\n" +
    "  const aplicaZoom = on => {\n" +
    "    const vb = on ? [cx - lado / 2, cy - lado / 2, lado, lado] : vbCheio, k = on ? Math.min(1, lado / vbCheio[2]) : 1;\n" +
    "    svg.setAttribute('viewBox', vb.join(' '));\n" +
    "    svg.querySelectorAll('.pt circle').forEach(ci => ci.setAttribute('r', (Number(ci.dataset.r) * k).toFixed(3)));\n" +
    "    svg.querySelectorAll('.pt text').forEach(t => { t.style.fontSize = (0.95 * k) + 'px'; });\n" +
    "    svg.querySelectorAll('.rots text').forEach(t => { t.style.fontSize = ((t.classList.contains('tem') ? 0.8 : 0.72) * k) + 'px'; t.style.strokeWidth = (0.18 * k) + 'px'; });\n" +
    "    btnZoom.textContent = on ? 'Brasil inteiro' : 'Ampliar na equipe'; btnZoom.setAttribute('aria-pressed', String(on));\n" +
    "  };\n" +
    "  btnZoom.addEventListener('click', () => aplicaZoom(btnZoom.getAttribute('aria-pressed') !== 'true'));\n" +
    "  el.querySelectorAll('.rh-mapa-uf').forEach(li => {");
});
edita('public/styles.css', troca => {
  troca(".rh-mapa-leg .b { margin-left: 14px;", ".rh-mapa-zoom { margin-left: auto; border: 1px solid var(--line); background: var(--card); color: var(--ink); font: 600 12px var(--font); padding: 5px 12px; border-radius: 999px; cursor: pointer; }\n.rh-mapa-zoom:hover { border-color: var(--verde-500); }\n.rh-mapa-leg .b { margin-left: 14px;");
});
console.log('ok');
