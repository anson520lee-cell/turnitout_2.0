-- Locks down helper functions flagged by Supabase's security advisor.
-- Apply after 0003. (Already applied to the hosted project.)
revoke all on function public.handle_new_user() from public, anon, authenticated;
alter function public.protect_profile_columns() set search_path = public;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
