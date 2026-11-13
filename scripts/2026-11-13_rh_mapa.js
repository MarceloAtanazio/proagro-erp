// Propósito: mapa do Brasil no painel de Recursos Humanos ("Onde estamos"): mostra onde cada colaborador ativo está alocado (estado, cidade e pessoas).
//   Servidor: /api/rh/painel passa a devolver headcount.localizacao (por colaborador ativo: cidade-base de Viáticos; se faltar, cidade de residência do cadastro de RH). Somente leitura.
//   Tela: nova seção depois do Headcount (app.js), módulo public/rh-mapa.js, geometria public/br-mapa.js (gerada por scripts/2026-11-13_mapa_brasil_gerar.js), estilos no fim de public/styles.css
//   (valem no Clássico e no Novo, só com variáveis comuns) e os dois scripts carregados em public/index.html.
// Entrada: api/index.js, public/app.js, public/index.html, public/styles.css (ou a pasta em argv[2]) e scripts/2026-11-13_rh_mapa_css.txt. Saída: arquivos editados.
// Como executar: node scripts/2026-11-13_rh_mapa.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const css = fs.readFileSync(path.join(__dirname, '2026-11-13_rh_mapa_css.txt'), 'utf8').replace(/\r\n/g, '\n');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel); let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 90)); if (s.indexOf(de, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  fn(troca, () => s, v => { s = v; }); fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
edita('api/index.js', troca => {
  troca("    SELECT c.id, c.name, c.sexo, c.data_nascimento, c.ativo, c.arquivado_em,\n           v.id AS vinculo_id,",
    "    SELECT c.id, c.name, c.sexo, c.data_nascimento, c.ativo, c.arquivado_em,\n           c.cidade_base_uf, c.cidade_base_municipio, c.uf AS res_uf, c.municipio AS res_municipio,\n           v.id AS vinculo_id,");
  troca("      por_sexo: contarPor(ativos, 'sexo'),\n",
    "      por_sexo: contarPor(ativos, 'sexo'),\n      // Onde cada colaborador ativo está alocado (mapa do Brasil): cidade-base (a mesma de Viáticos); sem ela, a cidade de residência do cadastro de RH.\n      localizacao: ativos.map(r => {\n        const ufB = String(r.cidade_base_uf || '').trim().toUpperCase(), munB = String(r.cidade_base_municipio || '').trim();\n        const temBase = ufB.length === 2 && !!munB;\n        const uf = temBase ? ufB : String(r.res_uf || '').trim().toUpperCase(), mun = temBase ? munB : String(r.res_municipio || '').trim();\n        return { id: r.id, nome: r.name, uf: uf.length === 2 ? uf : null, municipio: mun || null, origem: temBase ? 'base' : (uf.length === 2 ? 'residencia' : null),\n          departamento: r.departamento || null, modelo: r.modelo_trabalho || null };\n      }),\n");
});
edita('public/app.js', troca => {
  troca("    <div class=\"rh-painel-sec\"><h3>Recrutamento</h3>\n      <h5>Vagas</h5>",
    "    <div class=\"rh-painel-sec\" id=\"rh-sec-mapa\"><h3>Onde estamos</h3><div id=\"rh-mapa\"></div></div>\n\n    <div class=\"rh-painel-sec\"><h3>Recrutamento</h3>\n      <h5>Vagas</h5>");
  troca("  setTimeout(() => document.dispatchEvent(new CustomEvent('proagro:rh')), 0);   // visual Novo (tema-rh.js)\n}",
    "  if (typeof rhMapaRender === 'function') { try { rhMapaRender($('#rh-mapa'), hc.localizacao || []); } catch (e) { console.error('[mapa RH]', e); } }   // mapa do Brasil (rh-mapa.js)\n  setTimeout(() => document.dispatchEvent(new CustomEvent('proagro:rh')), 0);   // visual Novo (tema-rh.js)\n}");
});
edita('public/index.html', troca => {
  troca('  <script src="/br-localidades.js"></script>\n', '  <script src="/br-localidades.js"></script>\n  <script src="/br-mapa.js"></script>\n  <script src="/rh-mapa.js"></script>\n');
});
edita('public/styles.css', (troca, ler, grava) => {
  if (ler().includes('.rh-mapa')) throw new Error('já aplicado');
  grava(ler().replace(/\s+$/, '\n') + css);
});
console.log('ok');
