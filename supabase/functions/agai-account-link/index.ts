import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-device-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
})

const normalizeLogin = (value: unknown) => String(value ?? '').trim().toLowerCase()

const hexToBytes = (hex: string) => {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) throw new Error('invalid hash')
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

const bytesToHex = (value: ArrayBuffer) => Array.from(new Uint8Array(value)).map((byte) => byte.toString(16).padStart(2, '0')).join('')

async function verifyLegacyPassword(password: string, stored: string) {
  if (!/^[0-9a-f]{32}:[0-9a-f]{64}$/i.test(stored)) return false
  const [saltHex, expected] = stored.split(':')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: 100000, hash: 'SHA-256' }, key, 256)
  const actual = bytesToHex(bits)
  let diff = actual.length ^ expected.length
  for (let index = 0; index < Math.min(actual.length, expected.length); index++) diff |= actual.charCodeAt(index) ^ expected.charCodeAt(index)
  return diff === 0
}

async function hashLegacyPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256)
  return Array.from(salt).map((byte) => byte.toString(16).padStart(2, '0')).join('') + ':' + bytesToHex(bits)
}

function technicalEmail(login: string, caserneId: string) {
  const safeLogin = login.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9._-]/g, '-').slice(0, 60)
  const safeStation = caserneId.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30)
  return `${safeLogin}.${safeStation}@auth.agai-app.fr`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method === 'GET') return json({ status: 'ready', version: 'v239.1', pilotCreateOnlyLogin: 'lericque.brian' })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!url || !serviceKey || !anonKey) return json({ error: 'server_configuration' }, 503)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  let payload: Record<string, unknown>
  try { payload = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }
  const mode = String(payload.mode ?? 'login')

  if (mode === 'login' || mode === 'pilot_link') {
    const createOnly = mode === 'pilot_link'
    const login = normalizeLogin(payload.login)
    const password = String(payload.password ?? '')
    if (createOnly && login !== 'lericque.brian') return json({ error: 'pilot_not_allowed' }, 403)
    if (!login || !password || password.length > 256) return json({ error: 'invalid_credentials' }, 400)

    const { data: attempt } = await admin.from('agai_auth_attempts').select('*').eq('login', login).maybeSingle()
    if (attempt?.locked_until && new Date(attempt.locked_until).getTime() > Date.now()) return json({ error: 'temporarily_locked' }, 429)
    const { data: credential } = await admin.from('agai_identity_credentials').select('*').eq('login', login).eq('active', true).maybeSingle()
    const valid = credential ? await verifyLegacyPassword(password, credential.password_hash) : false
    if (!valid) {
      const failed = Number(attempt?.failed_count ?? 0) + 1
      const delay = failed >= 8 ? 15 * 60 : failed >= 5 ? 2 * 60 : 0
      await admin.from('agai_auth_attempts').upsert({ login, failed_count: failed, locked_until: delay ? new Date(Date.now() + delay * 1000).toISOString() : null, last_attempt_at: new Date().toISOString() })
      return json({ error: 'invalid_credentials' }, 401)
    }
    await admin.from('agai_auth_attempts').upsert({ login, failed_count: 0, locked_until: null, last_attempt_at: new Date().toISOString() })

    const email = technicalEmail(login, credential.caserne_id)
    let { data: link } = await admin.from('agai_auth_links').select('*').eq('login', login).maybeSingle()
    let authUserId = link?.auth_user_id as string | undefined
    // Le pilote ne doit jamais modifier le mot de passe ou les métadonnées d'un compte déjà lié.
    if (createOnly && authUserId) return json({ error: 'already_linked' }, 409)
    if (!authUserId) {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { agai_login: login, caserne_id: credential.caserne_id, app_role: credential.app_role },
        user_metadata: { first_name: credential.first_name, last_name: credential.last_name },
      })
      if (created.error || !created.data.user) return json({ error: 'identity_creation_failed' }, 503)
      authUserId = created.data.user.id
      const inserted = await admin.from('agai_auth_links').insert({ login, auth_user_id: authUserId, caserne_id: credential.caserne_id, app_role: credential.app_role }).select('*').single()
      if (inserted.error) {
        const existing = await admin.from('agai_auth_links').select('*').eq('login', login).single()
        if (createOnly) {
          if (existing.data?.auth_user_id !== authUserId) await admin.auth.admin.deleteUser(authUserId)
          return json({ error: existing.data ? 'already_linked' : 'identity_link_failed' }, existing.data ? 409 : 503)
        }
        if (existing.error || !existing.data) return json({ error: 'identity_link_failed' }, 503)
        if (existing.data.auth_user_id !== authUserId) await admin.auth.admin.deleteUser(authUserId)
        authUserId = existing.data.auth_user_id
        link = existing.data
      } else link = inserted.data
    }

    // createUser a déjà posé ces champs pour le pilote. L'ancien mode conserve sa mise à jour habituelle.
    if (!createOnly) {
      const metadata = { agai_login: login, caserne_id: credential.caserne_id, app_role: credential.app_role }
      const updated = await admin.auth.admin.updateUserById(authUserId, { password, email, email_confirm: true, app_metadata: metadata, user_metadata: { first_name: credential.first_name, last_name: credential.last_name } })
      if (updated.error) return json({ error: 'identity_update_failed' }, 503)
    }
    const publicClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const signed = await publicClient.auth.signInWithPassword({ email, password })
    if (signed.error || !signed.data.session) return json({ error: 'session_creation_failed' }, 503)
    await admin.from('agai_auth_links').update({ last_login_at: new Date().toISOString(), last_device_id: String(req.headers.get('x-device-id') ?? '').slice(0, 120), caserne_id: credential.caserne_id, app_role: credential.app_role }).eq('login', login)
    return json({ status: 'linked', version: 'v239', login, caserneId: credential.caserne_id, appRole: credential.app_role, authUserId, session: signed.data.session })
  }

  const authorization = req.headers.get('Authorization') ?? ''
  const accessToken = authorization.replace(/^Bearer\s+/i, '')
  if (!accessToken) return json({ error: 'authentication_required' }, 401)
  const caller = await admin.auth.getUser(accessToken)
  if (caller.error || !caller.data.user) return json({ error: 'authentication_required' }, 401)
  const callerRole = String(caller.data.user.app_metadata?.app_role ?? '')
  const callerLogin = normalizeLogin(caller.data.user.app_metadata?.agai_login)

  if (mode === 'admin_provision') {
    if (!['superadmin', 'administrateur_caserne'].includes(callerRole)) return json({ error: 'forbidden' }, 403)
    const targetLogin = normalizeLogin(payload.login)
    const targetStation = String(payload.caserneId ?? '').trim()
    const targetRole = String(payload.appRole ?? 'agent')
    const newPassword = String(payload.newPassword ?? '')
    if (!targetLogin || !targetStation || newPassword.length < 12) return json({ error: 'invalid_account' }, 400)
    if (callerRole !== 'superadmin' && (targetStation !== caller.data.user.app_metadata?.caserne_id || ['superadmin', 'chef_corps'].includes(targetRole))) return json({ error: 'forbidden' }, 403)
    const hash = await hashLegacyPassword(newPassword)
    const provisioned = await admin.from('agai_identity_credentials').upsert({
      login: targetLogin,
      caserne_id: targetStation,
      password_hash: hash,
      app_role: targetRole,
      first_name: String(payload.firstName ?? '').slice(0, 120),
      last_name: String(payload.lastName ?? '').slice(0, 120),
      active: true,
      source_updated_at: new Date().toISOString(),
    })
    if (provisioned.error) return json({ error: 'credential_creation_failed' }, 503)
    return json({ status: 'account_provisioned' })
  }

  if (mode === 'admin_sync') {
    if (!['superadmin', 'administrateur_caserne'].includes(callerRole)) return json({ error: 'forbidden' }, 403)
    const targetLogin = normalizeLogin(payload.login)
    const targetStation = String(payload.caserneId ?? '').trim()
    const targetRole = String(payload.appRole ?? 'agent')
    if (!targetLogin || !targetStation) return json({ error: 'invalid_account' }, 400)
    if (callerRole !== 'superadmin' && (targetStation !== caller.data.user.app_metadata?.caserne_id || ['superadmin', 'chef_corps', 'administrateur_caserne'].includes(targetRole))) return json({ error: 'forbidden' }, 403)
    const updatedCredential = await admin.from('agai_identity_credentials').update({
      caserne_id: targetStation,
      app_role: targetRole,
      first_name: String(payload.firstName ?? '').slice(0, 120),
      last_name: String(payload.lastName ?? '').slice(0, 120),
      source_updated_at: new Date().toISOString(),
    }).eq('login', targetLogin)
    if (updatedCredential.error) return json({ error: 'credential_update_failed' }, 503)
    const { data: targetLink } = await admin.from('agai_auth_links').select('*').eq('login', targetLogin).maybeSingle()
    if (targetLink?.auth_user_id) {
      const metadata = { agai_login: targetLogin, caserne_id: targetStation, app_role: targetRole }
      const authUpdated = await admin.auth.admin.updateUserById(targetLink.auth_user_id, { app_metadata: metadata, user_metadata: { first_name: String(payload.firstName ?? ''), last_name: String(payload.lastName ?? '') } })
      if (authUpdated.error) return json({ error: 'identity_update_failed' }, 503)
      await admin.from('agai_auth_links').update({ caserne_id: targetStation, app_role: targetRole }).eq('login', targetLogin)
    }
    return json({ status: 'account_synced' })
  }

  if (mode === 'admin_deactivate') {
    if (!['superadmin', 'administrateur_caserne'].includes(callerRole)) return json({ error: 'forbidden' }, 403)
    const targetLogin = normalizeLogin(payload.login)
    const { data: target } = await admin.from('agai_identity_credentials').select('*').eq('login', targetLogin).maybeSingle()
    if (!target || (callerRole !== 'superadmin' && target.caserne_id !== caller.data.user.app_metadata?.caserne_id)) return json({ error: 'forbidden' }, 403)
    await admin.from('agai_identity_credentials').update({ active: false, source_updated_at: new Date().toISOString() }).eq('login', targetLogin)
    const { data: targetLink } = await admin.from('agai_auth_links').select('*').eq('login', targetLogin).maybeSingle()
    if (targetLink?.auth_user_id) await admin.auth.admin.updateUserById(targetLink.auth_user_id, { ban_duration: '876000h' })
    return json({ status: 'account_deactivated' })
  }

  if (mode === 'change_password') {
    const newPassword = String(payload.newPassword ?? '')
    if (newPassword.length < 12) return json({ error: 'password_policy' }, 400)
    const hash = await hashLegacyPassword(newPassword)
    const changed = await admin.from('agai_identity_credentials').update({ password_hash: hash, source_updated_at: new Date().toISOString() }).eq('login', callerLogin)
    if (changed.error) return json({ error: 'credential_update_failed' }, 503)
    const authChanged = await admin.auth.admin.updateUserById(caller.data.user.id, { password: newPassword })
    if (authChanged.error) return json({ error: 'identity_update_failed' }, 503)
    return json({ status: 'password_updated' })
  }

  if (mode === 'admin_reset') {
    if (!['superadmin', 'administrateur_caserne'].includes(callerRole)) return json({ error: 'forbidden' }, 403)
    const targetLogin = normalizeLogin(payload.login)
    const newPassword = String(payload.newPassword ?? '')
    const { data: target } = await admin.from('agai_identity_credentials').select('*').eq('login', targetLogin).maybeSingle()
    if (!target || (callerRole !== 'superadmin' && target.caserne_id !== caller.data.user.app_metadata?.caserne_id)) return json({ error: 'forbidden' }, 403)
    if (newPassword.length < 12) return json({ error: 'password_policy' }, 400)
    const hash = await hashLegacyPassword(newPassword)
    await admin.from('agai_identity_credentials').update({ password_hash: hash, source_updated_at: new Date().toISOString() }).eq('login', targetLogin)
    const { data: targetLink } = await admin.from('agai_auth_links').select('*').eq('login', targetLogin).maybeSingle()
    if (targetLink?.auth_user_id) await admin.auth.admin.updateUserById(targetLink.auth_user_id, { password: newPassword })
    return json({ status: 'password_updated' })
  }

  return json({ error: 'unsupported_mode' }, 400)
})
