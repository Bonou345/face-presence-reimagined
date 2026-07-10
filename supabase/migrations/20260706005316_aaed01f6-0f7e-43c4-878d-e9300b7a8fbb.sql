
-- Auto-link class creator as class_teacher when they have the teacher role
CREATE OR REPLACE FUNCTION public.link_creator_as_class_teacher()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NOT NULL AND public.has_role(NEW.created_by, 'teacher') THEN
    INSERT INTO public.class_teachers (class_id, teacher_id)
    VALUES (NEW.id, NEW.created_by)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_link_creator_as_class_teacher ON public.classes;
CREATE TRIGGER trg_link_creator_as_class_teacher
AFTER INSERT ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.link_creator_as_class_teacher();

-- Backfill: link existing classes to their creators when they are teachers
INSERT INTO public.class_teachers (class_id, teacher_id)
SELECT c.id, c.created_by
FROM public.classes c
WHERE c.created_by IS NOT NULL
  AND public.has_role(c.created_by, 'teacher')
ON CONFLICT DO NOTHING;

-- Allow teachers of a class to manage its enrollments
CREATE POLICY "enrollments_teacher_insert"
ON public.class_enrollments FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.class_teachers ct
  WHERE ct.class_id = class_enrollments.class_id AND ct.teacher_id = auth.uid()
));

CREATE POLICY "enrollments_teacher_delete"
ON public.class_enrollments FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.class_teachers ct
  WHERE ct.class_id = class_enrollments.class_id AND ct.teacher_id = auth.uid()
));
