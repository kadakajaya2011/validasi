import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const callerClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const adminClient = createClient(url, service);

  const { data: { user }, error: userError } = await callerClient.auth.getUser(token);
  if (userError || !user) return json({ error: 'Sesi login tidak valid' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON tidak valid' }, 400); }

  const fullName = String(body?.full_name || '').trim();
  const avatarUrl = String(body?.avatar_url || '').trim();
  const avatarPath = String(body?.avatar_path || '').trim();

  if (!fullName) return json({ error: 'Nama lengkap wajib diisi' }, 400);
  if (fullName.length > 120) return json({ error: 'Nama lengkap maksimal 120 karakter' }, 400);
  if (avatarUrl && !avatarUrl.startsWith(`${url}/storage/v1/object/public/avatars/`)) {
    return json({ error: 'URL foto profil tidak valid' }, 400);
  }
  if (avatarPath && !avatarPath.startsWith(`${user.id}/`)) {
    return json({ error: 'Path foto profil tidak valid' }, 400);
  }

  const { error } = await adminClient.from('profiles').update({
    full_name: fullName,
    avatar_url: avatarUrl || null,
    avatar_path: avatarPath || null,
    updated_at: new Date().toISOString()
  }).eq('id', user.id);

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, full_name: fullName, avatar_url: avatarUrl, avatar_path: avatarPath });
});
