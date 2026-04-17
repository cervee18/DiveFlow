-- Create a mapping table for trip_clients rental fields to pos_products

CREATE TABLE IF NOT EXISTS public.pos_rental_mappings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  rental_field text NOT NULL, -- e.g. 'mask', 'fins', 'bcd', 'regulator', 'wetsuit', 'computer'
  pos_product_id uuid REFERENCES public.pos_products(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (organization_id, rental_field)
);

CREATE INDEX IF NOT EXISTS idx_pos_rental_mappings_org ON public.pos_rental_mappings(organization_id);

ALTER TABLE public.pos_rental_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view pos_rental_mappings"
  ON public.pos_rental_mappings FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org admins can manage pos_rental_mappings"
  ON public.pos_rental_mappings FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
