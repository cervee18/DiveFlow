-- 1. Modify activities to link to pos_products
ALTER TABLE public.activities
ADD COLUMN IF NOT EXISTS pos_product_id uuid REFERENCES public.pos_products(id) ON DELETE SET NULL;

-- 2. Modify courses to link to pos_products
ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS pos_product_id uuid REFERENCES public.pos_products(id) ON DELETE SET NULL;
