-- pos_parked_carts: open tabs that haven't been paid yet
CREATE TABLE IF NOT EXISTS public.pos_parked_carts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_pos_parked_carts_org ON public.pos_parked_carts(organization_id);

ALTER TABLE public.pos_parked_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view pos_parked_carts" ON public.pos_parked_carts FOR SELECT
  USING (organization_id = public.my_org_id());

CREATE POLICY "org members can manage pos_parked_carts" ON public.pos_parked_carts FOR ALL
  USING (organization_id = public.my_org_id());

-- pos_parked_cart_items: line items inside each parked cart
CREATE TABLE IF NOT EXISTS public.pos_parked_cart_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cart_id uuid REFERENCES public.pos_parked_carts(id) ON DELETE CASCADE NOT NULL,
  pos_product_id uuid REFERENCES public.pos_products(id) ON DELETE RESTRICT NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_pos_parked_cart_items_cart ON public.pos_parked_cart_items(cart_id);

ALTER TABLE public.pos_parked_cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage pos_parked_cart_items" ON public.pos_parked_cart_items FOR ALL
  USING (cart_id IN (SELECT id FROM public.pos_parked_carts WHERE organization_id = public.my_org_id()));
