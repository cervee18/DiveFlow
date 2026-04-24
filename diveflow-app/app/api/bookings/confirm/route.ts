import { createServiceClient } from '@/utils/supabase/service';
import { NextRequest } from 'next/server';

// Called by the payment webhook (or the demo "Pay" button).
// Body: { hold_id: string }
export async function POST(req: NextRequest) {
  let body: { hold_id: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { hold_id } = body;
  if (!hold_id) {
    return Response.json({ error: 'Missing hold_id' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc('confirm_booking_hold', {
    p_hold_id: hold_id,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (data?.error) {
    const status = data.error === 'Hold not found' ? 404 : 409;
    return Response.json(data, { status });
  }

  return Response.json(data, { status: 200 });
}
