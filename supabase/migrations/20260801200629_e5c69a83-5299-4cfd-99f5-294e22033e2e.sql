-- Explicit, least-privilege access rules for the private newsletter-images bucket.
-- Server-side automation uses the service role (bypasses RLS) and stays unaffected.

DROP POLICY IF EXISTS "Admins can read newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update newsletter images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete newsletter images" ON storage.objects;

CREATE POLICY "Admins can read newsletter images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'newsletter-images'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can upload newsletter images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'newsletter-images'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can update newsletter images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'newsletter-images'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'newsletter-images'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can delete newsletter images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'newsletter-images'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);