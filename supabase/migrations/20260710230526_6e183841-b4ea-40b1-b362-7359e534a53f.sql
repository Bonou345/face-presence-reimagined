
CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'student', 'parent');
CREATE TYPE public.attendance_status AS ENUM ('present', 'partial', 'absent', 'pending');
CREATE TYPE public.verification_method AS ENUM ('facial_recognition', 'manual', 'pending');
CREATE TYPE public.session_status AS ENUM ('scheduled', 'live', 'ended', 'cancelled');
CREATE TYPE public.notification_kind AS ENUM ('attendance_present','attendance_partial','attendance_absent','session_starting','manual_correction');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT, phone TEXT, avatar_url TEXT, student_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS SETOF public.app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
$$;

CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, level TEXT, description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.class_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(class_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_enrollments TO authenticated;
GRANT ALL ON public.class_enrollments TO service_role;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.class_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(class_id, teacher_id, subject)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_teachers TO authenticated;
GRANT ALL ON public.class_teachers TO service_role;
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.parent_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(parent_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parent_links TO authenticated;
GRANT ALL ON public.parent_links TO service_role;
ALTER TABLE public.parent_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT,
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  actual_start TIMESTAMPTZ, actual_end TIMESTAMPTZ,
  zoom_meeting_id TEXT, zoom_join_url TEXT, zoom_start_url TEXT, zoom_password TEXT,
  status public.session_status NOT NULL DEFAULT 'scheduled',
  face_similarity_threshold integer NOT NULL DEFAULT 80 CHECK (face_similarity_threshold BETWEEN 50 AND 99),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.face_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  rekognition_face_id TEXT, rekognition_external_id TEXT, image_url TEXT,
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.face_profiles TO authenticated;
GRANT ALL ON public.face_profiles TO service_role;
ALTER TABLE public.face_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.attendance_status NOT NULL DEFAULT 'pending',
  joined_at TIMESTAMPTZ, left_at TIMESTAMPTZ,
  confidence_score NUMERIC(5,2),
  verification_method public.verification_method NOT NULL DEFAULT 'pending',
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  last_seen_at TIMESTAMPTZ,
  total_seconds_present INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendances TO authenticated;
GRANT ALL ON public.attendances TO service_role;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_attendances_session ON public.attendances(session_id);
CREATE INDEX idx_attendances_student ON public.attendances(student_id);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  kind public.notification_kind NOT NULL,
  title TEXT NOT NULL, message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_id, created_at DESC);

CREATE TABLE public.face_check_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  started_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ, label TEXT, threshold integer
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.face_check_rounds TO authenticated;
GRANT ALL ON public.face_check_rounds TO service_role;
ALTER TABLE public.face_check_rounds ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_fcr_session ON public.face_check_rounds(session_id, started_at DESC);

CREATE TABLE public.face_check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.face_check_rounds(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  present BOOLEAN NOT NULL DEFAULT false,
  similarity NUMERIC(5,2), error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.face_check_results TO authenticated;
GRANT ALL ON public.face_check_results TO service_role;
ALTER TABLE public.face_check_results ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_fcres_round ON public.face_check_results(round_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER face_profiles_updated_at BEFORE UPDATE ON public.face_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER attendances_updated_at BEFORE UPDATE ON public.attendances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student'));
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.notify_parents_on_attendance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session_title TEXT; v_student_name TEXT; v_kind public.notification_kind; v_title TEXT; v_msg TEXT;
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

CREATE OR REPLACE FUNCTION public.link_creator_as_class_teacher()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NOT NULL AND public.has_role(NEW.created_by, 'teacher') THEN
    INSERT INTO public.class_teachers (class_id, teacher_id)
    VALUES (NEW.id, NEW.created_by) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_link_creator_as_class_teacher
AFTER INSERT ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.link_creator_as_class_teacher();

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_roles(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_creator_as_class_teacher() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;

CREATE POLICY "profiles_read_all_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_read_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_roles_admin_read" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_write" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_update" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_delete" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "classes_read_all" ON public.classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "classes_admin_write" ON public.classes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY classes_teacher_insert ON public.classes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'teacher') AND created_by = auth.uid());
CREATE POLICY classes_teacher_update_own ON public.classes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'teacher') AND created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE POLICY "enrollments_read_own_student" ON public.class_enrollments FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "enrollments_read_teacher" ON public.class_enrollments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.class_teachers ct WHERE ct.class_id = class_enrollments.class_id AND ct.teacher_id = auth.uid()));
CREATE POLICY "enrollments_read_parent" ON public.class_enrollments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.parent_links pl WHERE pl.parent_id = auth.uid() AND pl.student_id = class_enrollments.student_id));
CREATE POLICY "enrollments_admin_all" ON public.class_enrollments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "enrollments_teacher_insert" ON public.class_enrollments FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.class_teachers ct WHERE ct.class_id = class_enrollments.class_id AND ct.teacher_id = auth.uid()));
CREATE POLICY "enrollments_teacher_delete" ON public.class_enrollments FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.class_teachers ct WHERE ct.class_id = class_enrollments.class_id AND ct.teacher_id = auth.uid()));
CREATE POLICY "enrollments_student_self_insert" ON public.class_enrollments FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid() AND public.has_role(auth.uid(), 'student'));
CREATE POLICY "enrollments_student_self_delete" ON public.class_enrollments FOR DELETE TO authenticated USING (student_id = auth.uid());

CREATE POLICY "class_teachers_read_all" ON public.class_teachers FOR SELECT TO authenticated USING (true);
CREATE POLICY "class_teachers_admin_all" ON public.class_teachers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "parent_links_read_own" ON public.parent_links FOR SELECT TO authenticated USING (parent_id = auth.uid() OR student_id = auth.uid());
CREATE POLICY "parent_links_admin_all" ON public.parent_links FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sessions_read_teacher_own" ON public.sessions FOR SELECT TO authenticated USING (teacher_id = auth.uid());
CREATE POLICY "sessions_read_student" ON public.sessions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.class_enrollments ce WHERE ce.class_id = sessions.class_id AND ce.student_id = auth.uid()));
CREATE POLICY "sessions_read_parent" ON public.sessions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.class_enrollments ce JOIN public.parent_links pl ON pl.student_id = ce.student_id WHERE ce.class_id = sessions.class_id AND pl.parent_id = auth.uid()));
CREATE POLICY "sessions_read_admin" ON public.sessions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sessions_teacher_insert" ON public.sessions FOR INSERT TO authenticated WITH CHECK (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "sessions_teacher_update" ON public.sessions FOR UPDATE TO authenticated USING (teacher_id = auth.uid());
CREATE POLICY "sessions_teacher_delete" ON public.sessions FOR DELETE TO authenticated USING (teacher_id = auth.uid());
CREATE POLICY "sessions_admin_all" ON public.sessions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "face_read_own" ON public.face_profiles FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "face_admin_all" ON public.face_profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "face_student_insert_own" ON public.face_profiles FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "face_student_update_own" ON public.face_profiles FOR UPDATE TO authenticated USING (student_id = auth.uid());

CREATE POLICY "att_read_own_student" ON public.attendances FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "att_read_teacher" ON public.attendances FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = attendances.session_id AND s.teacher_id = auth.uid()));
CREATE POLICY "att_read_parent" ON public.attendances FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.parent_links pl WHERE pl.parent_id = auth.uid() AND pl.student_id = attendances.student_id));
CREATE POLICY "att_read_admin" ON public.attendances FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "att_teacher_write" ON public.attendances FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = attendances.session_id AND s.teacher_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = attendances.session_id AND s.teacher_id = auth.uid()));
CREATE POLICY "att_student_insert_own" ON public.attendances FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "att_admin_all" ON public.attendances FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "notif_read_own" ON public.notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid());
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
CREATE POLICY "notif_admin_all" ON public.notifications FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "fcr_teacher_all" ON public.face_check_rounds FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = face_check_rounds.session_id AND s.teacher_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = face_check_rounds.session_id AND s.teacher_id = auth.uid()));
CREATE POLICY "fcr_student_read" ON public.face_check_rounds FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.sessions s JOIN public.class_enrollments ce ON ce.class_id = s.class_id WHERE s.id = face_check_rounds.session_id AND ce.student_id = auth.uid()));
CREATE POLICY "fcr_admin_all" ON public.face_check_rounds FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "fcres_teacher_read" ON public.face_check_results FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.face_check_rounds r JOIN public.sessions s ON s.id = r.session_id WHERE r.id = face_check_results.round_id AND s.teacher_id = auth.uid()));
CREATE POLICY "fcres_student_own" ON public.face_check_results FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "fcres_student_insert_own" ON public.face_check_results FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "fcres_admin_all" ON public.face_check_results FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.face_check_rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.face_check_results;
ALTER TABLE public.face_check_rounds REPLICA IDENTITY FULL;
ALTER TABLE public.face_check_results REPLICA IDENTITY FULL;
