import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Not authenticated')

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !caller) throw new Error('Not authenticated')

    const { userId, newPassword } = await req.json()

    if (!newPassword || newPassword.length < 6) {
      throw new Error('A senha deve ter pelo menos 6 caracteres')
    }

    // If changing another user's password, must be admin
    if (userId && userId !== caller.id) {
      const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { _user_id: caller.id, _role: 'admin' })
      if (!isAdmin) throw new Error('Sem permissão')
    }

    const targetUserId = userId || caller.id

    const { error } = await supabaseAdmin.auth.admin.updateUser(targetUserId, {
      password: newPassword,
    })

    if (error) throw error

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
