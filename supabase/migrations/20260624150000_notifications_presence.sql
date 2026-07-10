-- ============================================================
-- Notifications + heartbeat de présence + storage des visages
-- ============================================================

-- Heartbeat de présence (détection déconnexion / partiel)
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_seconds_present INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_attendances_session ON public.attendances(session_id);
CREATE INDEX IF NOT EXISTS idx_attendances_student ON public.attendances(student_id);

-- ============================================================
-- NOTIFICATIONS (parents + élèves)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.notification_kind AS ENUM (
    'attendance_present',
    'attendance_partial',
    'attendance_absent',
    'session_starting',
    'manual_correction'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.notifications (
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

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, created_at DESC);

DROP POLICY IF EXISTS "notif_read_own" ON public.notifications;
CREATE POLICY "notif_read_own" ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());
DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
DROP POLICY IF EXISTS "notif_admin_all" ON public.notifications;
CREATE POLICY "notif_admin_all" ON public.notifications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- Trigger : notif parents quand présence change
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_parents_on_attendance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session_title TEXT;
  v_student_name TEXT;
  v_kind public.notification_kind;
  v_title TEXT;
  v_msg TEXT;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status = NEW.status) THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT s.title INTO v_session_title FROM public.sessions s WHERE s.id = NEW.session_id;
  SELECT COALESCE(p.full_name, p.email, 'Votre enfant') INTO v_student_name
    FROM public.profiles p WHERE p.id = NEW.student_id;

  v_kind := CASE NEW.status
    WHEN 'present' THEN 'attendance_present'::public.notification_kind
    WHEN 'partial' THEN 'attendance_partial'::public.notification_kind
    WHEN 'absent'  THEN 'attendance_absent'::public.notification_kind
    ELSE 'attendance_present'::public.notification_kind
  END;

  v_title := CASE NEW.status
    WHEN 'present' THEN 'Présence confirmée'
    WHEN 'partial' THEN 'Présence partielle'
    WHEN 'absent'  THEN 'Absence enregistrée'
    ELSE 'Mise à jour'
  END;

  v_msg := v_student_name || ' — ' || COALESCE(v_session_title, 'Session') ||
    CASE WHEN NEW.verification_method = 'manual' THEN ' (corrigé manuellement par l''enseignant)' ELSE '' END;

  INSERT INTO public.notifications (recipient_id, student_id, session_id, kind, title, message)
  SELECT pl.parent_id, NEW.student_id, NEW.session_id, v_kind, v_title, v_msg
  FROM public.parent_links pl
  WHERE pl.student_id = NEW.student_id;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_parents_attendance ON public.attendances;
CREATE TRIGGER trg_notify_parents_attendance
AFTER INSERT OR UPDATE OF status ON public.attendances
FOR EACH ROW EXECUTE FUNCTION public.notify_parents_on_attendance();

-- ============================================================
-- Bucket de stockage des photos de référence (privé)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('face-images', 'face-images', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "face_upload_own" ON storage.objects;
CREATE POLICY "face_upload_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'face-images' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "face_read_own_storage" ON storage.objects;
CREATE POLICY "face_read_own_storage" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'face-images' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "face_update_own_storage" ON storage.objects;
CREATE POLICY "face_update_own_storage" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'face-images' AND (storage.foldername(name))[1] = auth.uid()::text);
