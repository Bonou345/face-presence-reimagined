-- Break the class_teachers ↔ class_enrollments recursion.
-- Students/teachers already have full read access via the role-based policies
-- added previously; the class-member policy created the cycle.
DROP POLICY IF EXISTS class_teachers_read_class_members ON public.class_teachers;

-- classes_read_student is now redundant with classes_read_any_student
DROP POLICY IF EXISTS classes_read_student ON public.classes;

-- Add a parent role-based read for class_teachers so parents don't lose visibility
CREATE POLICY class_teachers_read_any_parent ON public.class_teachers
  FOR SELECT USING (private.has_role(auth.uid(), 'parent'::app_role));