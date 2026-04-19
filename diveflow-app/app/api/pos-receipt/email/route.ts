import { createClient } from '@/utils/supabase/server';
import { NextRequest } from 'next/server';
import { fetchReceiptData, buildReceiptHtml } from '@/lib/documents/receipt';
import { generateReceiptPdf } from '@/lib/pdf';
import { sendEmailWithAttachment } from '@/lib/email';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { invoiceId, email } = body as { invoiceId?: string; email?: string };
  if (!invoiceId) return Response.json({ error: 'Missing invoiceId' }, { status: 400 });

  const data = await fetchReceiptData(invoiceId, supabase);
  if (!data) return Response.json({ error: 'Invoice not found' }, { status: 404 });

  const to = email ?? data.clientEmail;
  if (!to) return Response.json({ error: 'No email address available for this client' }, { status: 422 });

  const html = buildReceiptHtml(data);
  const pdfBuffer = await generateReceiptPdf(html);

  const { error } = await sendEmailWithAttachment({
    to,
    subject: `Your receipt from ${data.orgName}`,
    html: `<p>Hi${data.clientName ? ` ${data.clientName}` : ''},</p><p>Please find your receipt attached.</p><p>Thank you,<br>${data.orgName}</p>`,
    attachment: { filename: 'receipt.pdf', content: pdfBuffer },
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
