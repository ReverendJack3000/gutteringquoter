-- Run this in Supabase Dashboard → SQL Editor if "Custom Access Token" dropdown
-- does not list public.custom_access_token_hook. The dashboard often only lists
-- functions named "custom_access_token". This wrapper delegates to our hook.
-- After running: Authentication → Hooks → Customize access token → select "custom_access_token".

create or replace function public.custom_access_token(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return public.custom_access_token_hook(event);
end;
$$;

grant execute on function public.custom_access_token(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token(jsonb) from authenticated, anon, public;
