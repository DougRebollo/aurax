-- AuraX: sessões em que a pessoa falou pouco (< 35% do tempo) não devem ser penalizadas
-- por ritmo, pausas e projeção (elas medem o silêncio, não a fala). Esta migração aplica a
-- regra nova às sessões já gravadas: marca essas 3 dimensões como "excluded" e recalcula a nota
-- só com as demais (a média dá peso 2 a "vícios e gírias"). Pode rodar de novo sem problema. Rode no Supabase -> SQL Editor.

with calc as (
  select
    s.id,
    (select jsonb_agg(
              case when e->>'key' in ('ritmo','pausas','projecao') then e || '{"excluded": true}'::jsonb else e end
              order by ord)
       from jsonb_array_elements(s.oratoria_subscores) with ordinality as t(e, ord)) as new_subs,
    (select round(sum((e->>'score')::numeric * case when e->>'key' = 'vicios' then 2 else 1 end)
                  / sum(case when e->>'key' = 'vicios' then 2 else 1 end))
       from jsonb_array_elements(s.oratoria_subscores) as t(e)
      where e->>'key' not in ('ritmo','pausas','projecao')) as new_score
  from sessions s
  where s.oratoria_subscores is not null
    and jsonb_typeof(s.oratoria_subscores) = 'array'
    and (s.dynamics->>'pctYou') ~ '^[0-9]+$'
    and (s.dynamics->>'pctYou')::int < 35
)
update sessions s
set oratoria_subscores = c.new_subs,
    oratoria_score = coalesce(c.new_score, s.oratoria_score)
from calc c
where s.id = c.id;

-- Conferência: sessões afetadas e a nota nova.
select to_char(date, 'DD/MM HH24:MI') as quando, client_name, oratoria_score as nota_nova,
       (dynamics->>'pctYou') as pct_falou
from sessions
where (dynamics->>'pctYou') ~ '^[0-9]+$' and (dynamics->>'pctYou')::int < 35
order by date desc limit 20;

