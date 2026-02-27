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

    // Check if admin already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const adminExists = existingUsers?.users?.some(u => u.email === 'admin@mcalculo.com.br')

    if (adminExists) {
      return new Response(JSON.stringify({ message: 'Admin already exists' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create admin user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: 'admin@mcalculo.com.br',
      password: '123456',
      email_confirm: true,
      user_metadata: { name: 'Administrador' },
    })

    if (createError) throw createError

    // The trigger will create profile and default 'user' role
    // Now add admin role
    if (newUser.user) {
      await supabaseAdmin.from('user_roles').insert({
        user_id: newUser.user.id,
        role: 'admin',
      })

      // Update profile name
      await supabaseAdmin.from('profiles').update({ name: 'Administrador' })
        .eq('user_id', newUser.user.id)
    }

    return new Response(JSON.stringify({ message: 'Admin created successfully', userId: newUser.user?.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
