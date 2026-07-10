ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS face_similarity_threshold integer NOT NULL DEFAULT 80
  CHECK (face_similarity_threshold BETWEEN 50 AND 99);

ALTER TABLE public.face_check_rounds
  ADD COLUMN IF NOT EXISTS threshold integer;