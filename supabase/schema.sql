-- ============================================================
-- ProAgro ERP — Módulo Financeiro
-- Schema Postgres para Supabase
-- Tabelas prefixadas com "erp_" para não colidir com o schema
-- da plataforma de subscrição, caso sejam usados no mesmo projeto Supabase.
-- Execute este arquivo inteiro no SQL Editor do Supabase.
-- ============================================================

create table if not exists erp_users (
  id serial primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'usuario' check (role in ('admin','usuario')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists erp_suppliers (
  id serial primary key,
  name text not null,
  cnpj text,
  category text,
  contact_name text,
  email text,
  phone text,
  payment_terms text,
  status text not null default 'ativo' check (status in ('ativo','inativo')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists erp_payables (
  id serial primary key,
  supplier_id integer references erp_suppliers(id) on delete set null,
  description text not null,
  category text not null,
  cost_center text,
  document text,
  amount numeric(14,2) not null check (amount > 0),
  due_date date not null,
  payment_date date,
  status text not null default 'pendente' check (status in ('pendente','pago')),
  notes text,
  created_by integer references erp_users(id),
  created_at timestamptz not null default now()
);

create table if not exists erp_receivables (
  id serial primary key,
  client_name text not null,
  description text not null,
  category text not null,
  document text,
  amount numeric(14,2) not null check (amount > 0),
  due_date date not null,
  receipt_date date,
  status text not null default 'pendente' check (status in ('pendente','recebido')),
  notes text,
  created_by integer references erp_users(id),
  created_at timestamptz not null default now()
);

create table if not exists erp_bank_transactions (
  id serial primary key,
  txn_date date not null,
  description text not null,
  amount numeric(14,2) not null,
  reconciled boolean not null default false,
  matched_type text,
  matched_id integer,
  imported_batch text,
  created_at timestamptz not null default now()
);

create table if not exists erp_budgets (
  id serial primary key,
  year integer not null,
  month integer not null check (month between 1 and 12),
  type text not null check (type in ('receita','despesa')),
  category text not null,
  amount numeric(14,2) not null default 0,
  unique (year, month, type, category)
);

-- Controle de tentativas de login (rate limit), necessário pois funções
-- serverless na Vercel não mantêm memória entre execuções.
create table if not exists erp_login_attempts (
  ip text primary key,
  count integer not null default 0,
  first_attempt timestamptz not null default now()
);

create index if not exists idx_erp_payables_due on erp_payables(due_date);
create index if not exists idx_erp_payables_status on erp_payables(status);
create index if not exists idx_erp_receivables_due on erp_receivables(due_date);
create index if not exists idx_erp_bank_date on erp_bank_transactions(txn_date);
create index if not exists idx_erp_budgets_year on erp_budgets(year);

-- Observação: RLS não é habilitado aqui de propósito. O backend acessa o
-- Postgres com a connection string direta (não com as chaves anon/service
-- do Supabase Auth) e implementa sua própria autenticação (JWT + bcrypt),
-- da mesma forma que outras rotinas do backend. Não exponha a
-- connection string no frontend.
