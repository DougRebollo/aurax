-- Passo 6 do banco de dados do AuraX — rodar DEPOIS do supabase-schema-05-oratoria.sql.
-- Deixa o cadastro escolher "gestor" ou "funcionário" (o gatilho de criação
-- de perfil hoje ignora isso e sempre grava 'funcionario').
-- Como rodar: Supabase -> seu projeto -> SQL Editor -> colar tudo -> Run.

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role, email, cargo, empresa)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    case when new.raw_user_meta_data->>'role' = 'gestor' then 'gestor' else 'funcionario' end,
    new.email,
    new.raw_user_meta_data->>'cargo',
    new.raw_user_meta_data->>'empresa'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;
