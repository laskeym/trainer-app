-- v1: every signup is a trainer; revisit with a role check once client logins exist
create function public.handle_new_trainer()
returns trigger as $$
begin
  insert into public.trainer (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_trainer();
