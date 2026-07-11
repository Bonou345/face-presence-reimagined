DROP POLICY IF EXISTS "sessions_teacher_update" ON public.sessions;
DROP POLICY IF EXISTS "sessions_teacher_delete" ON public.sessions;
DROP POLICY IF EXISTS "att_read_teacher" ON public.attendances;
DROP POLICY IF EXISTS "att_teacher_write" ON public.attendances;
DROP POLICY IF EXISTS "fcr_teacher_all" ON public.face_check_rounds;
DROP POLICY IF EXISTS "fcres_teacher_read" ON public.face_check_results;

CREATE POLICY "sessions_teacher_update" ON public.sessions
FOR UPDATE TO authenticated
USING (
  teacher_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    WHERE ct.class_id = sessions.class_id
      AND ct.teacher_id = auth.uid()
  )
)
WITH CHECK (
  teacher_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    WHERE ct.class_id = sessions.class_id
      AND ct.teacher_id = auth.uid()
  )
);

CREATE POLICY "sessions_teacher_delete" ON public.sessions
FOR DELETE TO authenticated
USING (
  teacher_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    WHERE ct.class_id = sessions.class_id
      AND ct.teacher_id = auth.uid()
  )
);

CREATE POLICY "att_read_teacher" ON public.attendances
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.id = attendances.session_id
      AND (
        s.teacher_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.class_teachers ct
          WHERE ct.class_id = s.class_id
            AND ct.teacher_id = auth.uid()
        )
      )
  )
);

CREATE POLICY "att_teacher_write" ON public.attendances
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.id = attendances.session_id
      AND (
        s.teacher_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.class_teachers ct
          WHERE ct.class_id = s.class_id
            AND ct.teacher_id = auth.uid()
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.id = attendances.session_id
      AND (
        s.teacher_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.class_teachers ct
          WHERE ct.class_id = s.class_id
            AND ct.teacher_id = auth.uid()
        )
      )
  )
);

CREATE POLICY "fcr_teacher_all" ON public.face_check_rounds
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.id = face_check_rounds.session_id
      AND (
        s.teacher_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.class_teachers ct
          WHERE ct.class_id = s.class_id
            AND ct.teacher_id = auth.uid()
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.id = face_check_rounds.session_id
      AND (
        s.teacher_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.class_teachers ct
          WHERE ct.class_id = s.class_id
            AND ct.teacher_id = auth.uid()
        )
      )
  )
);

CREATE POLICY "fcres_teacher_read" ON public.face_check_results
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.face_check_rounds r
    JOIN public.sessions s ON s.id = r.session_id
    WHERE r.id = face_check_results.round_id
      AND (
        s.teacher_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.class_teachers ct
          WHERE ct.class_id = s.class_id
            AND ct.teacher_id = auth.uid()
        )
      )
  )
);