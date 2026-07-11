-- Restrict classes SELECT to admins, teachers of the class, enrolled students, and linked parents
DROP POLICY IF EXISTS classes_read_all ON public.classes;

CREATE POLICY classes_read_admin ON public.classes
  FOR SELECT USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY classes_read_teacher ON public.classes
  FOR SELECT USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.class_teachers ct
      WHERE ct.class_id = classes.id AND ct.teacher_id = auth.uid()
    )
  );

CREATE POLICY classes_read_student ON public.classes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.class_enrollments ce
      WHERE ce.class_id = classes.id AND ce.student_id = auth.uid()
    )
  );

CREATE POLICY classes_read_parent ON public.classes
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.class_enrollments ce
      JOIN public.parent_links pl ON pl.student_id = ce.student_id
      WHERE ce.class_id = classes.id AND pl.parent_id = auth.uid()
    )
  );

-- Restrict class_teachers SELECT similarly
DROP POLICY IF EXISTS class_teachers_read_all ON public.class_teachers;

CREATE POLICY class_teachers_read_admin ON public.class_teachers
  FOR SELECT USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY class_teachers_read_self ON public.class_teachers
  FOR SELECT USING (teacher_id = auth.uid());

CREATE POLICY class_teachers_read_class_members ON public.class_teachers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.class_enrollments ce
      WHERE ce.class_id = class_teachers.class_id AND ce.student_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.class_enrollments ce
      JOIN public.parent_links pl ON pl.student_id = ce.student_id
      WHERE ce.class_id = class_teachers.class_id AND pl.parent_id = auth.uid()
    )
  );

-- Hide sensitive Zoom credentials from direct SELECT by authenticated users.
-- Server functions read them via the service role client, which bypasses these grants.
REVOKE SELECT (zoom_password, zoom_start_url, zoom_join_url, zoom_meeting_id)
  ON public.sessions FROM authenticated;
REVOKE SELECT (zoom_password, zoom_start_url, zoom_join_url, zoom_meeting_id)
  ON public.sessions FROM anon;