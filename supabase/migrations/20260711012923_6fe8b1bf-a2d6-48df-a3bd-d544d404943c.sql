CREATE POLICY att_student_update_own ON public.attendances
FOR UPDATE TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());