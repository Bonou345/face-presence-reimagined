
CREATE POLICY "face_upload_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'face-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "face_read_own_storage" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'face-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "face_update_own_storage" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'face-images' AND (storage.foldername(name))[1] = auth.uid()::text);
