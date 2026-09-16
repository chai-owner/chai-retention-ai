REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.org_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_role(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_org(uuid) TO authenticated, service_role;