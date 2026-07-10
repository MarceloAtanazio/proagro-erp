// ============================================================
// ProAgro ERP — Servidor local de desenvolvimento
// Uso: npm run dev  →  http://localhost:3000
// (Na Vercel, este arquivo NÃO é usado — lá o api/index.js roda
//  como função serverless. Isso aqui é só para testar localmente
//  antes do deploy, apontando para o mesmo Supabase.)
// ============================================================
require('dotenv').config();
const app = require('./api/index.js');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('====================================================');
  console.log(' ProAgro ERP — Módulo Financeiro (dev local)');
  console.log(` Servidor ativo em: http://localhost:${PORT}`);
  console.log(' Banco: Supabase (definido em DATABASE_URL no .env)');
  console.log('====================================================');
});
