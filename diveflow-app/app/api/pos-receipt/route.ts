import { createClient } from '@/utils/supabase/server';
import { NextRequest } from 'next/server';
import { fetchReceiptData, buildReceiptHtml } from '@/lib/documents/receipt';

export async function GET(request: NextRequest) {
  const invoiceId = request.nextUrl.searchParams.get('invoiceId');
  if (!invoiceId) return Response.json({ error: 'Missing invoiceId' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await fetchReceiptData(invoiceId, supabase);
  if (!data) return Response.json({ error: 'Invoice not found' }, { status: 404 });

  const html = buildReceiptHtml(data).replace('</body>', '<script>setTimeout(() => window.print(), 400);</script></body>');

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
