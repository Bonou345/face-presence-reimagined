
CREATE OR REPLACE FUNCTION public.list_enrollable_students()
RETURNS TABLE(id uuid, full_name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, p.email
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'student'
    ORDER BY p.full_name NULLS LAST, p.email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_enrollable_students() TO authenticated;
