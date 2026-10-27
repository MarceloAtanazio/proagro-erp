-- Último acesso de cada usuário, com data e hora. last_seen_at não serve: o logout o zera para o usuário
-- aparecer offline na hora. Este campo nunca é zerado. Preenche o histórico com o mais recente entre a
-- presença e o log de auditoria (login/ações). Idempotente.
ALTER TABLE erp_users ADD COLUMN IF NOT EXISTS ultimo_acesso_em timestamptz;

UPDATE erp_users u
   SET ultimo_acesso_em = GREATEST(u.last_seen_at, (SELECT max(l.created_at) FROM erp_audit_log l WHERE l.user_id = u.id))
 WHERE u.ultimo_acesso_em IS NULL
   AND (u.last_seen_at IS NOT NULL OR EXISTS (SELECT 1 FROM erp_audit_log l WHERE l.user_id = u.id));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='erp_users' AND column_name='ultimo_acesso_em') THEN
    RAISE EXCEPTION 'coluna ultimo_acesso_em não foi criada';
  END IF;
END $$;
