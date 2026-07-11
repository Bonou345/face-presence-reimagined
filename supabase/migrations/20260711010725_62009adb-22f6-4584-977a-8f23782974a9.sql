CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO service_role;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;

DROP POLICY IF EXISTS "att_admin_all" ON public.attendances;
CREATE POLICY "att_admin_all" ON public.attendances
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "att_read_admin" ON public.attendances;
CREATE POLICY "att_read_admin" ON public.attendances
FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "enrollments_admin_all" ON public.class_enrollments;
CREATE POLICY "enrollments_admin_all" ON public.class_enrollments
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "enrollments_student_self_insert" ON public.class_enrollments;
CREATE POLICY "enrollments_student_self_insert" ON public.class_enrollments
FOR INSERT TO authenticated
WITH CHECK ((student_id = auth.uid()) AND private.has_role(auth.uid(), 'student'));

DROP POLICY IF EXISTS "class_teachers_admin_all" ON public.class_teachers;
CREATE POLICY "class_teachers_admin_all" ON public.class_teachers
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "classes_admin_write" ON public.classes;
CREATE POLICY "classes_admin_write" ON public.classes
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS classes_teacher_insert ON public.classes;
CREATE POLICY classes_teacher_insert ON public.classes
FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'teacher') AND created_by = auth.uid());

DROP POLICY IF EXISTS classes_teacher_update_own ON public.classes;
CREATE POLICY classes_teacher_update_own ON public.classes
FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'teacher') AND created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "fcres_admin_all" ON public.face_check_results;
CREATE POLICY "fcres_admin_all" ON public.face_check_results
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "fcr_admin_all" ON public.face_check_rounds;
CREATE POLICY "fcr_admin_all" ON public.face_check_rounds
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "face_admin_all" ON public.face_profiles;
CREATE POLICY "face_admin_all" ON public.face_profiles
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "notif_admin_all" ON public.notifications;
CREATE POLICY "notif_admin_all" ON public.notifications
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "parent_links_admin_all" ON public.parent_links;
CREATE POLICY "parent_links_admin_all" ON public.parent_links
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "sessions_admin_all" ON public.sessions;
CREATE POLICY "sessions_admin_all" ON public.sessions
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "sessions_read_admin" ON public.sessions;
CREATE POLICY "sessions_read_admin" ON public.sessions
FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "sessions_teacher_insert" ON public.sessions;
CREATE POLICY "sessions_teacher_insert" ON public.sessions
FOR INSERT TO authenticated
WITH CHECK ((teacher_id = auth.uid()) AND private.has_role(auth.uid(), 'teacher'));

DROP POLICY IF EXISTS "user_roles_admin_delete" ON public.user_roles;
CREATE POLICY "user_roles_admin_delete" ON public.user_roles
FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user_roles_admin_read" ON public.user_roles;
CREATE POLICY "user_roles_admin_read" ON public.user_roles
FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user_roles_admin_update" ON public.user_roles;
CREATE POLICY "user_roles_admin_update" ON public.user_roles
FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user_roles_admin_write" ON public.user_roles;
CREATE POLICY "user_roles_admin_write" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.link_creator_as_class_teacher()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL AND private.has_role(NEW.created_by, 'teacher') THEN
    INSERT INTO public.class_teachers (class_id, teacher_id)
    VALUES (NEW.id, NEW.created_by)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;