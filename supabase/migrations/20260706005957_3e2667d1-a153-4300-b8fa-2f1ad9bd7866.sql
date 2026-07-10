
CREATE POLICY "enrollments_student_self_insert"
ON public.class_enrollments FOR INSERT TO authenticated
WITH CHECK (student_id = auth.uid() AND public.has_role(auth.uid(), 'student'));

CREATE POLICY "enrollments_student_self_delete"
ON public.class_enrollments FOR DELETE TO authenticated
USING (student_id = auth.uid());
