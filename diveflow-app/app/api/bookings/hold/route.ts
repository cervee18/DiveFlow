import { createServiceClient } from '@/utils/supabase/service';
import { NextRequest } from 'next/server';

interface Guest {
  name: string;
  email?: string;
}

interface HoldBody {
  trip_id:    string;
  pax_count:  number;
  lead_name:  string;
  lead_email?: string;
  lead_phone?: string;
  guests:     Guest[];
}

export async function POST(req: NextRequest) {
  let body: HoldBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { trip_id, pax_count, lead_name, lead_email, lead_phone, guests } = body;

  if (!trip_id || !pax_count || !lead_name || !guests?.length) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (pax_count !== guests.length) {
    return Response.json({ error: 'pax_count must match guests array length' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc('create_booking_hold', {
    p_trip_id:    trip_id,
    p_pax_count:  pax_count,
    p_lead_name:  lead_name,
    p_lead_email: lead_email ?? null,
    p_lead_phone: lead_phone ?? null,
    p_guests:     guests,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (data?.error) {
    const status = data.error === 'Trip not found' ? 404 : 409;
    return Response.json(data, { status });
  }

  return Response.json(data, { status: 201 });
}
