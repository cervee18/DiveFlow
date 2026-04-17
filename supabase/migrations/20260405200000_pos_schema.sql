-- Migration: POS schema initialization (Categories and Products), mapping trip_types.

-- 1. pos_categories
CREATE TABLE IF NOT EXISTS public.pos_categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pos_categories_org ON public.pos_categories(organization_id);

-- 2. pos_products
CREATE TABLE IF NOT EXISTS public.pos_products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  category_id uuid REFERENCES public.pos_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  is_automated boolean DEFAULT false NOT NULL,
  price numeric(10, 2) DEFAULT 0.00 NOT NULL,
  stock integer,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pos_products_org ON public.pos_products(organization_id);

-- 3. Modify trip_types to link to pos_products
ALTER TABLE public.trip_types
ADD COLUMN IF NOT EXISTS pos_product_id uuid REFERENCES public.pos_products(id) ON DELETE SET NULL;

-- 4. RLS for pos_categories
ALTER TABLE public.pos_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view pos_categories"
  ON public.pos_categories FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org admins can manage pos_categories"
  ON public.pos_categories FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 5. RLS for pos_products
ALTER TABLE public.pos_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view pos_products"
  ON public.pos_products FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "org admins can manage pos_products"
  ON public.pos_products FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
