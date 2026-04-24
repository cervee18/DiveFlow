-- Allow users to update their own profile row
CREATE POLICY "profiles: update own"
  ON "public"."profiles"
  FOR UPDATE
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());
