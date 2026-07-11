CREATE TABLE public.zoom_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  allowed boolean NOT NULL,
  reason text NOT NULL,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX zoom_access_logs_session_idx ON public.zoom_access_logs(session_id, created_at DESC);
CREATE INDEX zoom_access_logs_user_idx ON public.zoom_access_logs(user_id, created_at DESC);

GRANT SELECT ON public.zoom_access_logs TO authenticated;
GRANT ALL ON public.zoom_access_logs TO service_role;

ALTER TABLE public.zoom_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY zoom_logs_read_own ON public.zoom_access_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY zoom_logs_read_teacher ON public.zoom_access_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = zoom_access_logs.session_id
      AND (s.teacher_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.class_teachers ct
        WHERE ct.class_id = s.class_id AND ct.teacher_id = auth.uid()
      ))
  ));

CREATE POLICY zoom_logs_read_admin ON public.zoom_access_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));