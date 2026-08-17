
CREATE POLICY "vistorias_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'vistorias');
CREATE POLICY "vistorias_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'vistorias');
CREATE POLICY "vistorias_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'vistorias');
CREATE POLICY "vistorias_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'vistorias');
