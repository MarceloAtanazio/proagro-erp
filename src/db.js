// ============================================================
// ProAgro ERP — Camada de dados (Postgres / Supabase)
// Substitui o antigo src/db.js (better-sqlite3).
// ============================================================
const { Pool, types } = require('pg');

// Sem isso, colunas do tipo DATE (due_date, payment_date, receipt_date,
// txn_date) voltam do driver como objeto Date e são serializadas em JSON
// como "2026-07-15T00:00:00.000Z". O frontend espera "2026-07-15" (usa
// iso.split('-')), então mantemos o valor cru do Postgres como string.
types.setTypeParser(1082, val => val); // 1082 = OID do tipo "date"
types.setTypeParser(1700, val => (val === null ? null : parseFloat(val))); // 1700 = OID do tipo "numeric"
// (amount é numeric(14,2); o driver por padrão devolve string para não
// perder precisão, mas o frontend faz soma direta tipo "s + r.amount"
// esperando number, igual ao comportamento do SQLite REAL original)

if (!process.env.DATABASE_URL) {
  // Não derruba o processo — apenas avisa. Em produção na Vercel isso
  // deve estar configurado nas variáveis de ambiente do projeto.
  console.warn('[db] Variável DATABASE_URL não definida. Configure a connection string do Supabase (Project Settings > Database > Connection string, modo "Transaction pooler", porta 6543).');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
});

// Helper: roda uma query parametrizada ($1, $2, ...) e retorna as linhas.
async function query(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}

// Helper: converte valores numeric/bigint do Postgres (que chegam como
// string) em Number, evitando problemas de serialização no JSON de saída.
const n = v => (v === null || v === undefined ? 0 : Number(v));

module.exports = { query, pool, n };
