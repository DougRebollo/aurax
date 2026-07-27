-- Passo 2 do banco de dados do AuraX — rodar DEPOIS do supabase-schema.sql.
-- Cria automaticamente uma linha em "profiles" toda vez que alguém se
-- cadastra (login novo), já puxando o nome informado no cadastro.
-- Como rodar: Supabase -> seu projeto -> SQL Editor -> colar tudo -> Run.

create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    'funcionario'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
