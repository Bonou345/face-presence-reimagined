
-- 1. Sessions: remove overly permissive SELECT policy (scoped policies remain)
DROP POLICY IF EXISTS sessions_read_all_authenticated ON public.sessions;

-- 2. Profiles: replace read-all with relationship-scoped policies
DROP POLICY IF EXISTS profiles_read_all_auth ON public.profiles;

CREATE POLICY profiles_read_own ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid());

CREATE POLICY profiles_read_teacher_of_student ON public.profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.class_enrollments ce
    JOIN public.class_teachers ct ON ct.class_id = ce.class_id
    WHERE ce.student_id = profiles.id AND ct.teacher_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.class_enrollments ce
    JOIN public.classes c ON c.id = ce.class_id
    WHERE ce.student_id = profiles.id AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.teacher_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.class_enrollments ce2
        WHERE ce2.class_id = s.class_id AND ce2.student_id = profiles.id
      )
  )
);

CREATE POLICY profiles_read_student_of_teacher ON public.profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.class_enrollments ce
    JOIN public.class_teachers ct ON ct.class_id = ce.class_id
    WHERE ce.student_id = auth.uid() AND ct.teacher_id = profiles.id
  )
  OR EXISTS (
    SELECT 1
    FROM public.class_enrollments ce
    JOIN public.classes c ON c.id = ce.class_id
    WHERE ce.student_id = auth.uid() AND c.created_by = profiles.id
  )
);

CREATE POLICY profiles_read_parent_of_child ON public.profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.parent_links pl
    WHERE pl.parent_id = auth.uid() AND pl.student_id = profiles.id
  )
);

CREATE POLICY profiles_read_child_of_parent ON public.profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.parent_links pl
    WHERE pl.student_id = auth.uid() AND pl.parent_id = profiles.id
  )
);

CREATE POLICY profiles_read_classmate ON public.profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.class_enrollments ce_me
    JOIN public.class_enrollments ce_other ON ce_other.class_id = ce_me.class_id
    WHERE ce_me.student_id = auth.uid() AND ce_other.student_id = profiles.id
  )
);

-- 3. Storage: allow users to delete their own face-images
DROP POLICY IF EXISTS face_images_delete_own ON storage.objects;
CREATE POLICY face_images_delete_own ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'face-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
