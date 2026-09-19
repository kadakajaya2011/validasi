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

  const { data: callerProfile, error: profileError } = await adminClient
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError || callerProfile?.role !== 'admin') {
    return json({ error: 'Hanya administrator yang dapat mengelola akun operator' }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON tidak valid' }, 400); }
  const action = String(body?.action || '').toLowerCase();
  const userId = String(body?.user_id || '').trim();
  if (!userId) return json({ error: 'ID operator wajib diisi' }, 400);
  if (userId === user.id) return json({ error: 'Akun administrator aktif tidak dapat dikelola sebagai operator' }, 400);

  const { data: targetProfile, error: targetError } = await adminClient
    .from('profiles').select('id,email,role,permissions').eq('id', userId).maybeSingle();
  if (targetError) return json({ error: targetError.message }, 500);
  if (!targetProfile || targetProfile.role !== 'operator') return json({ error: 'Akun operator tidak ditemukan' }, 404);

  if (action === 'update') {
    const email = String(body?.email || '').trim().toLowerCase();
    const password = body?.password == null ? '' : String(body.password);
    if (!email || !email.includes('@')) return json({ error: 'Email operator tidak valid' }, 400);
    if (password && password.length < 8) return json({ error: 'Password baru minimal 8 karakter' }, 400);

    const authUpdate: Record<string, unknown> = { email, email_confirm: true };
    if (password) authUpdate.password = password;
    const { error: authError } = await adminClient.auth.admin.updateUserById(userId, authUpdate);
    if (authError) return json({ error: authError.message }, 400);

    // Keep this list IDENTICAL to the 17 permission keys used by index.html.
    // Do not rename these keys: the UI reads profiles.permissions directly.
    const PERMISSION_KEYS = [
      'view_data', 'add_data', 'edit_data', 'delete_data', 'import_data', 'export_data',
      'backup_data', 'dashboard', 'report', 'age_report', 'dp4', 'family', 'letters',
      'death_application', 'mutation_register', 'history', 'settings'
    ] as const;
    const rawPermissions = body?.permissions && typeof body.permissions === 'object' ? body.permissions : {};
    const safePermissions: Record<string, boolean> = {};
    for (const key of PERMISSION_KEYS) safePermissions[key] = rawPermissions[key] === true;

    const { error: updateError } = await adminClient.from('profiles').update({
      email,
      permissions: safePermissions,
      updated_at: new Date().toISOString()
    }).eq('id', userId).eq('role', 'operator');
    if (updateError) return json({ error: updateError.message }, 500);
    return json({ ok: true, action: 'update', user_id: userId, email });
  }

  if (action === 'delete') {
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) return json({ error: deleteError.message }, 400);
    // profiles.id references auth.users with ON DELETE CASCADE, so the profile is removed automatically.
    return json({ ok: true, action: 'delete', user_id: userId });
  }

  return json({ error: 'Aksi tidak dikenali. Gunakan update atau delete.' }, 400);
});
