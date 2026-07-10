
DO $$ BEGIN
  CREATE TYPE public.notification_kind AS ENUM (
    'attendance_present','attendance_partial','attendance_absent','session_starting','manual_correction'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  kind public.notification_kind NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_id, created_at DESC);

CREATE POLICY "notif_read_own" ON public.notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid());
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
CREATE POLICY "notif_admin_all" ON public.notifications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.notify_parents_on_attendance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session_title TEXT; v_student_name TEXT; v_kind public.notification_kind; v_title TEXT; v_msg TEXT;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status = NEW.status) THEN RETURN NEW; END IF;
  IF NEW.status = 'pending' THEN RETURN NEW; END IF;
  SELECT s.title INTO v_session_title FROM public.sessions s WHERE s.id = NEW.session_id;
  SELECT COALESCE(p.full_name, p.email, 'Votre enfant') INTO v_student_name FROM public.profiles p WHERE p.id = NEW.student_id;
  v_kind := CASE NEW.status WHEN 'present' THEN 'attendance_present'::public.notification_kind
    WHEN 'partial' THEN 'attendance_partial'::public.notification_kind
    WHEN 'absent'  THEN 'attendance_absent'::public.notification_kind
    ELSE 'attendance_present'::public.notification_kind END;
  v_title := CASE NEW.status WHEN 'present' THEN 'Présence confirmée' WHEN 'partial' THEN 'Présence partielle' WHEN 'absent' THEN 'Absence enregistrée' ELSE 'Mise à jour' END;
  v_msg := v_student_name || ' — ' || COALESCE(v_session_title, 'Session') ||
    CASE WHEN NEW.verification_method = 'manual' THEN ' (corrigé manuellement par l''enseignant)' ELSE '' END;
  INSERT INTO public.notifications (recipient_id, student_id, session_id, kind, title, message)
  SELECT pl.parent_id, NEW.student_id, NEW.session_id, v_kind, v_title, v_msg
  FROM public.parent_links pl WHERE pl.student_id = NEW.student_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_parents_attendance
AFTER INSERT OR UPDATE OF status ON public.attendances
FOR EACH ROW EXECUTE FUNCTION public.notify_parents_on_attendance();

CREATE POLICY "face_upload_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'face-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "face_read_own_storage" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'face-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "face_update_own_storage" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'face-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE TABLE public.face_check_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  started_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  label TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.face_check_rounds TO authenticated;
GRANT ALL ON public.face_check_rounds TO service_role;
ALTER TABLE public.face_check_rounds ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_fcr_session ON public.face_check_rounds(session_id, started_at DESC);

CREATE POLICY "fcr_teacher_all" ON public.face_check_rounds FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = face_check_rounds.session_id AND s.teacher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = face_check_rounds.session_id AND s.teacher_id = auth.uid()));
CREATE POLICY "fcr_student_read" ON public.face_check_rounds FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sessions s
    JOIN public.class_enrollments ce ON ce.class_id = s.class_id
    WHERE s.id = face_check_rounds.session_id AND ce.student_id = auth.uid()
  ));
CREATE POLICY "fcr_admin_all" ON public.face_check_rounds FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.face_check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.face_check_rounds(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  present BOOLEAN NOT NULL DEFAULT false,
  similarity NUMERIC(5,2),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.face_check_results TO authenticated;
GRANT ALL ON public.face_check_results TO service_role;
ALTER TABLE public.face_check_results ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_fcres_round ON public.face_check_results(round_id);

CREATE POLICY "fcres_teacher_read" ON public.face_check_results FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.face_check_rounds r
    JOIN public.sessions s ON s.id = r.session_id
    WHERE r.id = face_check_results.round_id AND s.teacher_id = auth.uid()
  ));
CREATE POLICY "fcres_student_own" ON public.face_check_results FOR SELECT TO authenticated
  USING (student_id = auth.uid());
CREATE POLICY "fcres_student_insert_own" ON public.face_check_results FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());
CREATE POLICY "fcres_admin_all" ON public.face_check_results FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.face_check_rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.face_check_results;
ALTER TABLE public.face_check_rounds REPLICA IDENTITY FULL;
ALTER TABLE public.face_check_results REPLICA IDENTITY FULL;
