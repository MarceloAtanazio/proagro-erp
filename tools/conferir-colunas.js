// Confere se as colunas citadas no SQL existem mesmo no banco.
//
// Por que existe: duas vezes um nome de coluna foi INVENTADO no código
// (`contato_emergencia` em vez de `emergencia_nome`; `dependente_ir` em vez de
// `irrf`). Postgres só reclama quando a linha executa — e as duas passaram
// despercebidas porque o caminho só roda para alguns registros. Este script faz
// a conferência sem banco, em segundos, antes de publicar.
//
//   node tools/conferir-colunas.js
//
// O schema fica em tools/schema-colunas.json; o próprio arquivo carrega a
// consulta que o regenera quando uma migração muda a estrutura.
//
// Só acusa o que dá para afirmar com CERTEZA, em duas frentes:
//  1. referência qualificada (`c.emergencia_nome`) — o apelido diz a tabela;
//  2. coluna solta (`dependente_ir`) quando o statement tem UMA tabela só e
//     nenhuma subconsulta — aí não há outra origem possível.
// Fora disso fica calado de propósito: aviso que erra treina a ser ignorado.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, 'schema-colunas.json'), 'utf8'));
const COLUNAS = {};
for (const [t, cols] of Object.entries(SCHEMA)) if (t[0] !== '_') COLUNAS[t] = new Set(cols.split(','));

// Colunas que o SQL cria na hora (alias de agregado, campo de subconsulta) e
// que não existem em tabela nenhuma — não são erro.
const EFEMERAS = new Set(['n', 'v', 'total', 'tipos', 'mes', 'docs']);

// Vocabulário do SQL: o que sobra depois de tirar isto é nome de coluna.
const PALAVRAS = new Set(`SELECT INSERT UPDATE DELETE WITH FROM WHERE SET VALUES INTO JOIN LEFT RIGHT
INNER OUTER FULL CROSS LATERAL ON AND OR NOT IN IS NULL TRUE FALSE AS ORDER BY GROUP HAVING LIMIT
OFFSET ASC DESC DISTINCT ALL ANY EXISTS BETWEEN LIKE ILIKE CASE WHEN THEN ELSE END RETURNING CONFLICT
DO NOTHING EXCLUDED UNION INTERSECT EXCEPT USING FILTER OVER PARTITION CAST INTERVAL DEFAULT
CURRENT_DATE CURRENT_TIMESTAMP NOW TEXT INT INTEGER BIGINT NUMERIC BOOLEAN DATE TIMESTAMP TIMESTAMPTZ
JSON JSONB UUID YEAR MONTH DAY HOUR MINUTE SECOND FOR NULLS FIRST LAST`.split(/\s+/));

const arquivos = ['api/index.js', 'src/db.js', 'local-dev-server.js']
  .filter(f => fs.existsSync(path.join(RAIZ, f)));

const achados = [];

for (const arq of arquivos) {
  const src = fs.readFileSync(path.join(RAIZ, arq), 'utf8');
  // Literais SQL: template string ou aspas simples começando por verbo SQL.
  const re = /(`|')(\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b[\s\S]*?)\1/gi;
  let m;
  while ((m = re.exec(src))) {
    const linha = src.slice(0, m.index).split('\n').length;
    // Trecho interpolado é decidido em tempo de execução: some daqui em vez de
    // virar acusação. Se a interpolação for aninhada, a consulta inteira sai.
    const sql = m[2].replace(/\$\{[^{}]*\}/g, ' ');
    if (sql.includes('${')) continue;

    // Apelidos declarados: "FROM erp_x c", "JOIN erp_y AS v", "UPDATE erp_z t".
    const apelido = {};
    const reAp = /\b(?:FROM|JOIN|UPDATE|INTO)\s+(erp_\w+)\s+(?:AS\s+)?(\w+)?/gi;
    let a;
    while ((a = reAp.exec(sql))) {
      const [, tabela, ap] = a;
      apelido[tabela] = tabela;                       // a tabela responde pelo próprio nome
      if (ap && !/^(SET|WHERE|VALUES|ON|LEFT|RIGHT|INNER|FULL|CROSS|LATERAL|ORDER|GROUP|LIMIT|RETURNING|USING|AS)$/i.test(ap))
        apelido[ap] = tabela;
    }
    if (!Object.keys(apelido).length) continue;

    // Referências qualificadas. `x.*` e casts (`::`) ficam de fora.
    const reRef = /\b(\w+)\.(\w+)\b/g;
    let r;
    while ((r = reRef.exec(sql))) {
      const [, ap, col] = r;
      const tabela = apelido[ap];
      if (!tabela || !COLUNAS[tabela]) continue;      // apelido de subconsulta: não dá para afirmar
      if (COLUNAS[tabela].has(col) || EFEMERAS.has(col)) continue;
      achados.push({ arq, linha, ref: `${ap}.${col}`, tabela, col });
    }

    // ---- 2. coluna solta, quando só pode ser de uma tabela ----
    // Com subconsulta ou mais de uma tabela, uma coluna sem prefixo pode vir de
    // outro escopo — aí não dá para afirmar nada e o teste se cala.
    const tabelas = [...new Set(Object.values(apelido))];
    const temSub = /\(\s*SELECT\b/i.test(sql);
    if (tabelas.length !== 1 || temSub || !COLUNAS[tabelas[0]]) continue;

    const tabela = tabelas[0];
    const semTexto = sql.replace(/'[^']*'/g, "''");     // literais não contêm colunas
    const reSolta = /\b([a-z_][a-z0-9_]*)\b/gi;
    let s;
    while ((s = reSolta.exec(semTexto))) {
      const tok = s[1];
      const antes = semTexto.slice(Math.max(0, s.index - 12), s.index);
      const depois = semTexto.slice(s.index + tok.length);
      if (/[.\w]$/.test(antes)) continue;               // qualificado ou parte de outro token
      if (/^\s*[.(]/.test(depois)) continue;            // apelido de tabela, ou função
      if (/\bAS\s+$/i.test(antes)) continue;            // apelido de coluna criado ali
      if (/::\s*$/.test(antes)) continue;               // nome de tipo num cast
      if (PALAVRAS.has(tok.toUpperCase())) continue;
      if (apelido[tok] || COLUNAS[tok]) continue;       // nome ou apelido de tabela
      if (COLUNAS[tabela].has(tok) || EFEMERAS.has(tok)) continue;
      achados.push({ arq, linha, ref: tok, tabela, col: tok });
    }
  }
}

// Um mesmo erro repetido em várias consultas é UM problema, não dez.
const unico = new Map();
for (const x of achados) {
  const k = `${x.tabela}.${x.col}`;
  if (!unico.has(k)) unico.set(k, { ...x, ocorrencias: [] });
  unico.get(k).ocorrencias.push(`${x.arq}:${x.linha}`);
}

if (!unico.size) {
  console.log(`Nenhuma coluna inexistente: ${arquivos.length} arquivo(s), ${Object.keys(COLUNAS).length} tabelas no schema.`);
  process.exit(0);
}

console.log(unico.size + ' COLUNA(S) QUE NÃO EXISTEM NO BANCO:\n');
for (const x of unico.values()) {
  console.log(`  ${x.tabela}.${x.col}`);
  console.log(`    em ${x.ocorrencias.join(', ')}`);
  // Sugerir o vizinho mais próximo ajuda mais do que só acusar.
  const perto = [...COLUNAS[x.tabela]].filter(c => c.includes(x.col) || x.col.includes(c) || c.slice(0, 4) === x.col.slice(0, 4));
  if (perto.length) console.log(`    existe(m): ${perto.join(', ')}`);
  console.log('');
}
process.exit(1);
