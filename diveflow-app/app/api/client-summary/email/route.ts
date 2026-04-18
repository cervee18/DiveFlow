import { createClient } from '@/utils/supabase/server';
import { NextRequest } from 'next/server';
import { fetchSummaryData, buildSummaryHtml } from '@/lib/documents/summary';
import { generatePdf } from '@/lib/pdf';
import { sendEmailWithAttachment } from '@/lib/email';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { clientId, email } = body as { clientId?: string; email?: string };
  if (!clientId) return Response.json({ error: 'Missing clientId' }, { status: 400 });

  const result = await fetchSummaryData(clientId, supabase);

  if (!result.ok) {
    if (result.error === 'not_found') return Response.json({ error: 'Client not found' }, { status: 404 });
    return Response.json({ error: 'missing_logs', trips: result.trips }, { status: 422 });
  }

  const { data } = result;
  const to = email ?? data.client.email;
  if (!to) return Response.json({ error: 'No email address available for this client' }, { status: 422 });

  const html = buildSummaryHtml(data);
  const pdfBuffer = await generatePdf(html);
  const clientFullName = `${data.client.first_name} ${data.client.last_name}`;

  const { error } = await sendEmailWithAttachment({
    to,
    subject: `Your dive history summary`,
    html: `<p>Hi ${clientFullName},</p><p>Please find your dive history summary attached.</p><p>Thank you,<br>DiveFlow</p>`,
    attachment: { filename: `dive-summary-${clientFullName.toLowerCase().replace(/\s+/g, '-')}.pdf`, content: pdfBuffer },
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
