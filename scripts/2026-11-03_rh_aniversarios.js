// Propósito: aba "Aniversários" em Recursos Humanos, com aviso em pop-up antes e no dia. Backend: GET /api/rh/aniversarios (próxima
//   ocorrência de cada colaborador ativo, com os dias que faltam; a idade só para quem tem a permissão de dados sensíveis).
//   Front: a aba (cards de hoje / próximos 7 dias / mês, busca e filtro por mês, preferências de aviso) e o pop-up, que aparece quando
//   alguém com acesso a RH abre o sistema: uma vez quando entra na antecedência escolhida, na véspera e no dia. Sem mudança no banco.
// Entrada: api/index.js, public/app.js e public/styles.css (ou a pasta indicada em argv[2]) e os blocos scripts/2026-11-03_rh_aniversarios_*_bloco.txt.
// Saída: os três arquivos editados. Uso: node scripts/2026-11-03_rh_aniversarios.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const bloco = n => fs.readFileSync(path.join(__dirname, n), 'utf8').replace(/\r\n/g, '\n');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel);
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const unico = m => {
    const i = s.indexOf(m);
    if (i < 0) throw new Error(rel + ': trecho não achado: ' + m.slice(0, 80));
    if (s.indexOf(m, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + m.slice(0, 80));
  };
  fn({
    troca: (de, para) => { unico(de); s = s.replace(de, () => para); },
    antes: (m, t) => { unico(m); const i = s.indexOf(m); s = s.slice(0, i) + t + s.slice(i); },
    fim: t => { s = s.replace(/\n*$/, '\n') + t; }
  });
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};

edita('api/index.js', ({ antes }) => {
  antes("app.get('/api/rh/organograma', requireAuth, requireViewAny(['rh']),", bloco('2026-11-03_rh_aniversarios_api_bloco.txt'));
});

edita('public/app.js', ({ troca, antes }) => {
  troca("{ k: 'ferias', t: 'Férias' }, { k: 'beneficios', t: 'Benefícios' }];",
    "{ k: 'ferias', t: 'Férias' }, { k: 'beneficios', t: 'Benefícios' },\n                { k: 'aniversarios', t: 'Aniversários' }];");
  troca("  if (RH_ABA === 'beneficios') return rhBeneficios(c);",
    "  if (RH_ABA === 'beneficios') return rhBeneficios(c);\n  if (RH_ABA === 'aniversarios') return rhAniversarios(c);");
  antes('// ---------------- Organograma ----------------\n//\n// A árvore é montada AQUI', bloco('2026-11-03_rh_aniversarios_front_bloco.txt'));
  // Aviso ao entrar no sistema (e de novo a cada 3 h, para quem deixa o sistema aberto de um dia para o outro).
  troca("  if (USER && USER.must_change_password) openForcedPasswordChange();\n}",
    "  if (USER && USER.must_change_password) openForcedPasswordChange();\n" +
    "  else {\n" +
    "    setTimeout(() => rhChecarAniversarios(false), 2000);\n" +
    "    if (!window.__NIVER_TIMER) window.__NIVER_TIMER = setInterval(() => rhChecarAniversarios(false), 3 * 60 * 60 * 1000);\n" +
    "  }\n}");
});

edita('public/styles.css', ({ fim }) => {
  fim('\n/* Aniversários (RH): lista do pop-up e linha de quem faz aniversário hoje */\n' +
    '.rh-niver-lista { margin: 0; padding-left: 18px; line-height: 1.8; }\n' +
    '.rh-niver-hoje td { background: var(--verde-050); font-weight: 600; }\n');
});
console.log('ok');
