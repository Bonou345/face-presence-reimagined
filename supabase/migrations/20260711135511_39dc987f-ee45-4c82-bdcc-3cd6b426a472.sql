-- Allow any authenticated student or teacher to read classes
CREATE POLICY classes_read_any_student ON public.classes
  FOR SELECT USING (private.has_role(auth.uid(), 'student'::app_role));

CREATE POLICY classes_read_any_teacher ON public.classes
  FOR SELECT USING (private.has_role(auth.uid(), 'teacher'::app_role));

-- Allow class_teachers visibility to students/teachers too
CREATE POLICY class_teachers_read_any_student ON public.class_teachers
  FOR SELECT USING (private.has_role(auth.uid(), 'student'::app_role));

CREATE POLICY class_teachers_read_any_teacher ON public.class_teachers
  FOR SELECT USING (private.has_role(auth.uid(), 'teacher'::app_role));

-- Allow students to read all sessions (Zoom credential columns remain revoked)
CREATE POLICY sessions_read_any_student ON public.sessions
  FOR SELECT USING (private.has_role(auth.uid(), 'student'::app_role));

CREATE POLICY sessions_read_any_teacher ON public.sessions
  FOR SELECT USING (private.has_role(auth.uid(), 'teacher'::app_role));