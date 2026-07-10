# ProAgro ERP — Módulo Financeiro (versão Vercel + Supabase)

Esta é a versão adaptada do ERP para rodar na nuvem, na mesma arquitetura
usada na plataforma de subscrição: **frontend estático + API serverless
na Vercel** e **banco de dados Postgres no Supabase**. Assim, qualquer
colega com e-mail `@proagroseguros.com` ou `@proagroinsur.tech` pode
criar a própria conta e acessar o sistema pela internet, sem precisar
rodar nada localmente.

## O que mudou em relação à versão local (Express + SQLite)

| Antes (local) | Agora (nuvem) |
|---|---|
| Banco SQLite em arquivo (`data/proagro.db`) | Postgres no Supabase |
| Sessão em memória (`express-session`) | Cookie httpOnly assinado com JWT (stateless) |
| Rate limit de login em `Map()` | Tabela `erp_login_attempts` no Postgres |
| `node server.js` | Função serverless na Vercel (`api/index.js`) |

A tela de login, o SPA (`index.html`, `app.js`, `styles.css`), as regras de
negócio, validações e a identidade visual **não mudaram nada** — é o mesmo
sistema, só que hospedado.

## Passo a passo do deploy

### 1. Criar as tabelas no Supabase

1. Crie um projeto no [supabase.com](https://supabase.com) (ou use um projeto
   já existente — as tabelas aqui usam o prefixo `erp_` para não colidir com
   as tabelas da plataforma de subscrição).
2. Abra **SQL Editor** e rode o conteúdo de `supabase/schema.sql`.
3. (Opcional) Rode `supabase/seed.sql` para carregar os dados de exemplo.
   Leia o comentário no final do arquivo — o hash de senha do usuário
   admin de exemplo precisa ser gerado à parte (o arquivo explica como).
   **Alternativa mais simples:** pule o seed do usuário admin e crie a
   primeira conta direto pela tela de "Criar conta" do sistema — o
   primeiro usuário cadastrado vira administrador automaticamente,
   exatamente como na versão local.
4. Em **Project Settings > Database > Connection string**, copie a string
   no modo **Transaction pooler** (porta `6543`) — é a indicada para
   funções serverless.

### 2. Configurar variáveis de ambiente

Veja `.env.example`. Você vai precisar de:

- `DATABASE_URL` — a connection string do passo anterior.
- `JWT_SECRET` — uma string aleatória longa. Gere uma com:
  ```
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

### 3. Deploy na Vercel

1. Suba esta pasta para um repositório no GitHub (ou importe a pasta
   direto pela CLI da Vercel: `vercel --prod`).
2. Em [vercel.com](https://vercel.com), importe o repositório.
3. Framework preset: **Other** (não precisa de build — não há passo de
   compilação).
4. Em **Environment Variables**, adicione `DATABASE_URL`, `JWT_SECRET` e
   `NODE_ENV=production`.
5. Deploy. A Vercel detecta automaticamente `api/index.js` como função
   serverless (todas as rotas `/api/*` são roteadas para ela via
   `vercel.json`) e serve `index.html`, `app.js` e `styles.css` como
   arquivos estáticos.

### 4. Testar localmente antes do deploy (opcional)

```bash
npm install
cp .env.example .env   # preencha DATABASE_URL e JWT_SECRET
npm run dev
```
Acesse `http://localhost:3000`. Isso roda a mesma API já conectada ao
Supabase — é só um jeito de testar antes de subir para a Vercel.

## Estrutura de arquivos

```
proagro-erp/
├── api/
│   └── index.js          # API Express, roda como função serverless
├── src/
│   └── db.js              # conexão Postgres (Supabase) via pg.Pool
├── public/
│   └── index.html, app.js, styles.css   # frontend (SPA), inalterado
├── supabase/
│   ├── schema.sql          # criação das tabelas (rodar 1x no SQL Editor)
│   └── seed.sql             # dados de exemplo (opcional)
├── local-dev-server.js      # só para testar localmente
├── vercel.json               # roteia tudo para a função (que também serve o frontend)
├── package.json
└── .env.example
```

Note: apenas o conteúdo de `public/` fica publicamente acessível como arquivo
estático. Tudo que está fora dele (`src/`, `supabase/`, etc.) não é exposto
publicamente — só é usado internamente pela função serverless.

## Segurança (mantida da versão original)

- Cadastro e login restritos aos domínios `@proagroseguros.com` e
  `@proagroinsur.tech`.
- Senhas com hash bcrypt (10 rounds), mínimo 8 caracteres.
- Cookie de sessão httpOnly, `sameSite=lax`, expira em 8 horas.
- Todas as rotas de API exigem autenticação; rotas de administração de
  usuários exigem perfil admin.
- Rate limit de login: 10 tentativas por IP a cada 15 minutos.
- Primeiro usuário cadastrado vira administrador; os demais entram como
  usuário comum.

## Próximos passos sugeridos

1. Rodar o schema no Supabase e testar o cadastro do primeiro usuário.
2. Validar as 10 telas (dashboard, contas a pagar/receber, fornecedores,
   conciliação, orçamento, orçado x realizado, relatórios, usuários).
3. Convidar outro colega a criar a própria conta para uso compartilhado.
