import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({error:'Method not allowed'}), {status:405,headers:{...cors,'Content-Type':'application/json'}});

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return new Response(JSON.stringify({error:'Unauthorized'}), {status:401,headers:{...cors,'Content-Type':'application/json'}});

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const callerClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const adminClient = createClient(url, service);

  const { data: { user }, error: userError } = await callerClient.auth.getUser(token);
  if (userError || !user) return new Response(JSON.stringify({error:'Sesi login tidak valid'}), {status:401,headers:{...cors,'Content-Type':'application/json'}});

  const { data: callerProfile, error: profileError } = await adminClient
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError || callerProfile?.role !== 'admin') {
    return new Response(JSON.stringify({error:'Hanya administrator yang dapat membuat akun operator'}), {status:403,headers:{...cors,'Content-Type':'application/json'}});
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({error:'JSON tidak valid'}), {status:400,headers:{...cors,'Content-Type':'application/json'}}); }
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const permissions = (body?.permissions && typeof body.permissions === 'object') ? body.permissions : {};
  if (!email || !email.includes('@')) return new Response(JSON.stringify({error:'Email operator tidak valid'}), {status:400,headers:{...cors,'Content-Type':'application/json'}});
  if (password.length < 8) return new Response(JSON.stringify({error:'Password minimal 8 karakter'}), {status:400,headers:{...cors,'Content-Type':'application/json'}});

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'operator' }
  });
  if (createError || !created.user) return new Response(JSON.stringify({error:createError?.message || 'Gagal membuat akun'}), {status:400,headers:{...cors,'Content-Type':'application/json'}});

  const safePermissions: Record<string, boolean> = {};
  for (const key of ['view_data','add_data','edit_data','delete_data','import_data','export_data','reports','letters','mutation']) {
    safePermissions[key] = permissions[key] === true;
  }

  const { error: insertError } = await adminClient.from('profiles').insert({
    id: created.user.id,
    email,
    role: 'operator',
    permissions: safePermissions
  });
  if (insertError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return new Response(JSON.stringify({error:'Akun dibuat tetapi profil gagal disimpan: '+insertError.message}), {status:500,headers:{...cors,'Content-Type':'application/json'}});
  }

  return new Response(JSON.stringify({ok:true,user_id:created.user.id,email}), {status:200,headers:{...cors,'Content-Type':'application/json'}});
});
