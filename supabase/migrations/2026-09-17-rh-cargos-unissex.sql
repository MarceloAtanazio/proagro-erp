-- ============================================================================
-- RH — os cargos passam a ser unissex, com "(a)"
--
-- ADITIVA e idempotente.
--
-- Motivo concreto, não estético: o catálogo já tinha "Coordenador de Campo" E
-- "Coordenadora de Campo" — duas linhas para a MESMA função, criadas em
-- momentos diferentes. Enquanto o nome carregar gênero, isso se repete a cada
-- contratação: quem cadastra uma mulher tende a flexionar, e nasce um cargo
-- novo. Aí o filtro por cargo mostra duas entradas, o quadro conta duas
-- funções, e ninguém percebe porque as duas parecem certas.
--
-- Só flexiona quem flexiona. "Gerente" e "Analista" já são comuns de dois
-- gêneros em português — marcá-los seria ruído. Mudam "Coordenador" e
-- "Técnico", que têm forma feminina distinta.
--
-- A renomeação ARRASTA quem usa: mudar só o catálogo deixaria a ficha de todo
-- mundo com o nome antigo, e o antigo voltaria ao catálogo na próxima varredura
-- de "cargo em uso". É o mesmo que o endpoint PUT faz.
-- ============================================================================

DO $$
DECLARE
  par text[];
  mapa text[][] := ARRAY[
    ['Coordenador de Campo',        'Coordenador(a) de Campo'],
    ['Coordenadora de Campo',       'Coordenador(a) de Campo'],
    ['Coordenador de Subscrição',   'Coordenador(a) de Subscrição'],
    ['Coordenador Comercial',       'Coordenador(a) Comercial'],
    -- Aqui o adjetivo também flexiona ("Coordenadora Administrativa"), então a
    -- marca aparece duas vezes. É o nome mais pesado da lista; fica assim por
    -- coerência com os demais, e é um UPDATE para mudar se preferirem
    -- "Coordenador(a) Administrativo".
    ['Coordenador Administrativo',  'Coordenador(a) Administrativo(a)'],
    ['Técnico de Campo',            'Técnico(a) de Campo']
  ];
BEGIN
  FOREACH par SLICE 1 IN ARRAY mapa LOOP
    -- Onde o cargo está ESCRITO, nas três colunas de texto.
    UPDATE erp_rh_vinculos    SET cargo = par[2]            WHERE cargo = par[1];
    UPDATE erp_colaboradores  SET cargo = par[2]            WHERE cargo = par[1];
    UPDATE erp_rh_admissoes   SET cargo_pretendido = par[2] WHERE cargo_pretendido = par[1];

    -- E no catálogo. Se o nome novo já existe (caso de "Coordenadora de Campo",
    -- que funde com "Coordenador de Campo"), a linha antiga é removida em vez
    -- de renomeada — o índice único por nome recusaria a duplicata, e manter as
    -- duas era justamente o problema.
    IF EXISTS (SELECT 1 FROM erp_rh_cargos WHERE lower(nome) = lower(par[2])) THEN
      DELETE FROM erp_rh_cargos WHERE nome = par[1] AND lower(par[1]) <> lower(par[2]);
    ELSE
      UPDATE erp_rh_cargos SET nome = par[2] WHERE nome = par[1];
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM erp_rh_cargos
   WHERE nome IN ('Coordenador de Campo', 'Coordenadora de Campo', 'Coordenador de Subscrição',
                  'Coordenador Comercial', 'Coordenador Administrativo', 'Técnico de Campo');
  IF n <> 0 THEN RAISE EXCEPTION 'Sobrou % cargo(s) com o nome de genero no catalogo', n; END IF;
  -- Nenhum cargo em uso pode ter ficado fora do catálogo pela renomeação.
  SELECT count(*) INTO n FROM (
    SELECT cargo AS c FROM erp_rh_vinculos WHERE cargo IS NOT NULL AND btrim(cargo) <> ''
    UNION SELECT cargo FROM erp_colaboradores WHERE cargo IS NOT NULL AND btrim(cargo) <> ''
    UNION SELECT cargo_pretendido FROM erp_rh_admissoes WHERE cargo_pretendido IS NOT NULL AND btrim(cargo_pretendido) <> ''
  ) t WHERE NOT EXISTS (SELECT 1 FROM erp_rh_cargos g WHERE lower(g.nome) = lower(btrim(t.c)));
  IF n <> 0 THEN RAISE EXCEPTION 'Sobrou % cargo(s) em uso fora do catalogo', n; END IF;
END $$;
