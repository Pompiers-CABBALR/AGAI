import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-device-id, x-agai-admin-caserne',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
})

const normalizeLogin = (value: unknown) => String(value ?? '').trim().toLowerCase()
// La connexion et chaque vérification de session appliquent le statut serveur.
// Ce verrou est déployé avant la fermeture de l'ancien accès anonyme.
const personnelEnforcement = true
const pilotCreateOnlyLogins = new Set([
  'millecamps.alicia',
  'canneson.eric',
  'leriche.valery',
])

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
  if (req.method === 'GET') return json({ status: 'ready', version: 'v240-auth-cutover', pilotCreateOnlyLogins: [...pilotCreateOnlyLogins],
    personnelEnforcementEnabled: personnelEnforcement })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!url || !serviceKey || !anonKey) return json({ error: 'server_configuration' }, 503)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  let payload: Record<string, unknown>
  try { payload = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }
  const mode = String(payload.mode ?? 'login')

  if (mode === 'login' || mode === 'pilot_link' || mode === 'pilot_login') {
    const createOnly = mode === 'pilot_link'
    const pilotLogin = mode === 'pilot_login'
    const login = normalizeLogin(payload.login)
    const password = String(payload.password ?? '')
    if (createOnly && !pilotCreateOnlyLogins.has(login)) return json({ error: 'pilot_not_allowed' }, 403)
    if (!login || !password || password.length > 256) return json({ error: 'invalid_credentials' }, 400)

    // Les deux lectures sont indépendantes : les lancer ensemble raccourcit
    // la vérification sans modifier le contrôle des tentatives ni des droits.
    const [{ data: attempt, error: attemptError }, { data: credential, error: credentialError }] = await Promise.all([
      admin.from('agai_auth_attempts').select('*').eq('login', login).maybeSingle(),
      admin.from('agai_identity_credentials').select('*').eq('login', login).eq('active', true).maybeSingle(),
    ])
    if (attemptError || credentialError) return json({ error: 'authentication_unavailable' }, 503)
    if (attempt?.locked_until && new Date(attempt.locked_until).getTime() > Date.now()) return json({ error: 'temporarily_locked' }, 429)
    const valid = credential ? await verifyLegacyPassword(password, credential.password_hash) : false
    if (!valid) {
      const failed = Number(attempt?.failed_count ?? 0) + 1
      const delay = failed >= 8 ? 15 * 60 : failed >= 5 ? 2 * 60 : 0
      await admin.from('agai_auth_attempts').upsert({ login, failed_count: failed, locked_until: delay ? new Date(Date.now() + delay * 1000).toISOString() : null, last_attempt_at: new Date().toISOString() })
      return json({ error: 'invalid_credentials' }, 401)
    }
    // Le pilote CIS05 exige le contrôle serveur sans modifier le mode historique.
    if (pilotLogin && credential.caserne_id !== 'CIS05') return json({ error: 'pilot_not_allowed' }, 403)
    if (personnelEnforcement || pilotLogin) {
      const access = await admin.rpc('agai_personnel_can_login', { p_login: login })
      if (access.error) return json({ error: 'personnel_access_unavailable' }, 503)
      if (access.data !== true) return json({ error: 'account_unavailable' }, 403)
    }
    await admin.from('agai_auth_attempts').upsert({ login, failed_count: 0, locked_until: null, last_attempt_at: new Date().toISOString() })

    const email = technicalEmail(login, credential.caserne_id)
    let { data: link } = await admin.from('agai_auth_links').select('*').eq('login', login).maybeSingle()
    let authUserId = link?.auth_user_id as string | undefined
    // Le pilote ne doit jamais modifier le mot de passe ou les métadonnées d'un compte déjà lié.
    if (createOnly && authUserId) return json({ error: 'already_linked' }, 409)
    if (!authUserId) {
      if (pilotLogin) return json({ error: 'identity_link_missing' }, 409)
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

    const publicClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    let signed = await publicClient.auth.signInWithPassword({ email, password })
    // Réécrire le mot de passe à chaque connexion révoque les sessions déjà
    // ouvertes sur les autres appareils et ralentit inutilement l'accès.
    // L'empreinte métier a déjà été vérifiée ci-dessus : ne réparer l'identité
    // Auth que si son mot de passe a réellement pris du retard. Une mise à jour
    // des droits ne touche jamais au mot de passe et reste exceptionnelle.
    const repairPassword = !createOnly && signed.error?.code === 'invalid_credentials'
    if (signed.error && !repairPassword) return json({ error: 'session_creation_failed' }, 503)
    const authUser = signed.data.user
    const repairMetadata = !createOnly && !repairPassword && authUser && (
      authUser.email !== email ||
      authUser.app_metadata?.agai_login !== login ||
      authUser.app_metadata?.caserne_id !== credential.caserne_id ||
      authUser.app_metadata?.app_role !== credential.app_role ||
      authUser.user_metadata?.first_name !== credential.first_name ||
      authUser.user_metadata?.last_name !== credential.last_name
    )
    if (repairPassword || repairMetadata) {
      const metadata = { agai_login: login, caserne_id: credential.caserne_id, app_role: credential.app_role }
      const updated = await admin.auth.admin.updateUserById(authUserId, {
        ...(repairPassword ? { password } : {}), email, email_confirm: true,
        app_metadata: metadata,
        user_metadata: { first_name: credential.first_name, last_name: credential.last_name },
      })
      if (updated.error) return json({ error: 'identity_update_failed' }, 503)
      signed = await publicClient.auth.signInWithPassword({ email, password })
    }
    if (signed.error || !signed.data.session) return json({ error: 'session_creation_failed' }, 503)
    await admin.from('agai_auth_links').update({ last_login_at: new Date().toISOString(), last_device_id: String(req.headers.get('x-device-id') ?? '').slice(0, 120), caserne_id: credential.caserne_id, app_role: credential.app_role }).eq('login', login)
    // Un appareil neuf ne peut plus télécharger les fiches pour retrouver le
    // compte avant connexion. Renvoyer uniquement l'identité minimale, jamais
    // l'empreinte du mot de passe ni les données opérationnelles.
    const profile = createOnly ? undefined : {
      login,
      caserneId: credential.caserne_id,
      appRole: credential.app_role,
      firstName: credential.first_name,
      lastName: credential.last_name,
    }
    return json({ status: 'linked', version: 'v239', login, caserneId: credential.caserne_id, appRole: credential.app_role,
      personnelEnforcementEnabled: personnelEnforcement || pilotLogin, authUserId, session: signed.data.session, profile })
  }

  const authorization = req.headers.get('Authorization') ?? ''
  const accessToken = authorization.replace(/^Bearer\s+/i, '')
  if (!accessToken) return json({ error: 'authentication_required' }, 401)
  const caller = await admin.auth.getUser(accessToken)
  if (caller.error || !caller.data.user) return json({ error: 'authentication_required' }, 401)
  const callerLogin = normalizeLogin(caller.data.user.app_metadata?.agai_login)
  const { data: callerCredential } = await admin.from('agai_identity_credentials')
    .select('active,app_role,caserne_id').eq('login', callerLogin).maybeSingle()
  if (!callerCredential?.active) return json({ error: 'account_unavailable' }, 403)
  const callerRole = String(callerCredential.app_role ?? '')
  const callerStation = String(callerCredential.caserne_id ?? '')

  if (mode === 'account_status' || mode === 'pilot_account_status') {
    const pilotStatus = mode === 'pilot_account_status'
    if (!personnelEnforcement && !pilotStatus) return json({ error: 'personnel_enforcement_disabled' }, 503)
    if (!callerLogin) return json({ error: 'identity_unavailable' }, 403)
    if (pilotStatus) {
      if (callerStation !== 'CIS05') return json({ error: 'pilot_not_allowed' }, 403)
      const { data: link, error: linkError } = await admin.from('agai_auth_links')
        .select('auth_user_id,caserne_id,app_role').eq('login', callerLogin).maybeSingle()
      if (linkError) return json({ error: 'identity_link_unavailable' }, 503)
      if (!link || link.auth_user_id !== caller.data.user.id || link.caserne_id !== callerStation || link.app_role !== callerRole)
        return json({ error: 'identity_link_invalid' }, 403)
    }
    const loginAllowed = await admin.rpc('agai_personnel_can_login', { p_login: callerLogin })
    const operationAllowed = await admin.rpc('agai_personnel_can_operate', { p_login: callerLogin })
    if (loginAllowed.error || operationAllowed.error) return json({ error: 'personnel_access_unavailable' }, 503)
    const { data: access } = await admin.from('agai_personnel_access').select('status,starts_on,ends_on,revision').eq('login', callerLogin).maybeSingle()
    return json({ login: callerLogin, caserneId: callerStation, status: access?.status ?? 'actif', startsOn: access?.starts_on ?? null,
      endsOn: access?.ends_on ?? null, revision: access?.revision ?? 0,
      personnelEnforcementEnabled: true,
      canLogin: loginAllowed.data === true, canOperate: operationAllowed.data === true })
  }

  if (personnelEnforcement) {
    const callerAllowed = await admin.rpc('agai_personnel_can_login', { p_login: callerLogin })
    if (callerAllowed.error) return json({ error: 'personnel_access_unavailable' }, 503)
    if (callerAllowed.data !== true) return json({ error: 'account_unavailable' }, 403)
  }

  if (mode === 'my_admin_stations') {
    if (callerRole !== 'administrateur_caserne') return json({ error: 'forbidden' }, 403)
    const { data: link, error: linkError } = await admin.from('agai_auth_links')
      .select('auth_user_id,caserne_id,app_role').eq('login', callerLogin).maybeSingle()
    if (linkError || !link || link.auth_user_id !== caller.data.user.id
      || link.caserne_id !== callerStation || link.app_role !== callerRole)
      return json({ error: 'identity_link_invalid' }, 403)
    const grants = await admin.from('agai_admin_station_grants')
      .select('caserne_id').eq('login', callerLogin).eq('active', true)
    if (grants.error) return json({ error: 'admin_station_service_unavailable' }, 503)
    return json({ homeStation: callerStation,
      stations: [callerStation, ...(grants.data ?? []).map(grant => grant.caserne_id)] })
  }

  let effectiveStation = callerStation
  const requestedStation = String(req.headers.get('x-agai-admin-caserne') ?? '').trim()
  if (requestedStation && requestedStation !== callerStation) {
    if (callerRole !== 'administrateur_caserne') return json({ error: 'forbidden' }, 403)
    const granted = await admin.from('agai_admin_station_grants')
      .select('caserne_id').eq('login', callerLogin).eq('caserne_id', requestedStation)
      .eq('active', true).maybeSingle()
    if (granted.error || !granted.data) return json({ error: 'admin_station_not_allowed' }, 403)
    effectiveStation = requestedStation
  }

  // Inventaire réservé au superadmin : aucune empreinte de mot de passe,
  // aucun jeton ni identifiant Auth n'est transmis au navigateur.
  if (mode === 'admin_access_audit') {
    if (callerRole !== 'superadmin') return json({ error: 'forbidden' }, 403)
    const credentials = await admin.from('agai_identity_credentials')
      .select('login,caserne_id,app_role,active,first_name,last_name')
      .eq('active', true).order('login')
    if (credentials.error) return json({ error: 'access_audit_unavailable' }, 503)
    const logins = (credentials.data ?? []).map(account => account.login)
    const links = logins.length
      ? await admin.from('agai_auth_links').select('login,caserne_id,app_role,auth_user_id').in('login', logins)
      : { data: [], error: null }
    if (links.error) return json({ error: 'access_audit_unavailable' }, 503)
    const grants = await admin.from('agai_admin_station_grants')
      .select('login,caserne_id,active').eq('active', true)
    const grantsAvailable = !grants.error
    const grantsByLogin = new Map<string, string[]>()
    if (grantsAvailable) for (const grant of grants.data ?? []) {
      const key = normalizeLogin(grant.login)
      grantsByLogin.set(key, [...(grantsByLogin.get(key) ?? []), grant.caserne_id])
    }
    const byLogin = new Map((links.data ?? []).map(link => [normalizeLogin(link.login), link]))
    const accounts = (credentials.data ?? []).map(account => {
      const link = byLogin.get(normalizeLogin(account.login))
      return {
        login: account.login,
        caserneId: account.caserne_id,
        appRole: account.app_role,
        firstName: account.first_name,
        lastName: account.last_name,
        adminStations: grantsByLogin.get(normalizeLogin(account.login)) ?? [],
        linkStatus: !link || !link.auth_user_id ? 'missing'
          : link.caserne_id !== account.caserne_id || link.app_role !== account.app_role ? 'mismatch' : 'linked',
      }
    })
    return json({ accounts, grantsAvailable })
  }

  if (mode === 'admin_station_grant' || mode === 'admin_station_grant_history') {
    if (callerRole !== 'superadmin') return json({ error: 'forbidden' }, 403)
    const { data: callerLink, error: callerLinkError } = await admin.from('agai_auth_links')
      .select('auth_user_id,caserne_id,app_role').eq('login', callerLogin).maybeSingle()
    if (callerLinkError || !callerLink || callerLink.auth_user_id !== caller.data.user.id
      || callerLink.caserne_id !== callerStation || callerLink.app_role !== callerRole)
      return json({ error: 'identity_link_invalid' }, 403)
    const targetLogin = normalizeLogin(payload.login)
    if (!targetLogin) return json({ error: 'invalid_target' }, 400)
    if (mode === 'admin_station_grant_history') {
      const history = await admin.from('agai_admin_station_grant_audit')
        .select('caserne_id,old_active,new_active,changed_by,changed_at')
        .eq('login', targetLogin).order('changed_at', { ascending: false }).limit(100)
      if (history.error) return json({ error: 'admin_station_history_unavailable' }, 503)
      return json({ history: history.data ?? [] })
    }
    const targetStation = String(payload.caserneId ?? '').trim()
    const enabled = payload.enabled === true
    if (!/^CIS[0-9]{2,}$/.test(targetStation)) return json({ error: 'invalid_station' }, 400)
    const { data: target, error: targetError } = await admin.from('agai_identity_credentials')
      .select('login,caserne_id,app_role,active').eq('login', targetLogin).maybeSingle()
    if (targetError || !target?.active || target.app_role !== 'administrateur_caserne'
      || target.caserne_id === targetStation) return json({ error: 'invalid_admin_target' }, 400)
    const { data: targetLink, error: targetLinkError } = await admin.from('agai_auth_links')
      .select('caserne_id,app_role,auth_user_id').eq('login', targetLogin).maybeSingle()
    if (targetLinkError || !targetLink?.auth_user_id || targetLink.caserne_id !== target.caserne_id
      || targetLink.app_role !== target.app_role) return json({ error: 'target_link_invalid' }, 409)
    const { data: currentGrant, error: grantReadError } = await admin.from('agai_admin_station_grants')
      .select('active').eq('login', targetLogin).eq('caserne_id', targetStation).maybeSingle()
    if (grantReadError) return json({ error: 'admin_station_service_unavailable' }, 503)
    if (currentGrant?.active === enabled || (!currentGrant && !enabled)) return json({ status: 'unchanged' })
    const changed = await admin.from('agai_admin_station_grants').upsert({
      login: targetLogin, caserne_id: targetStation, active: enabled, changed_by: callerLogin,
    }, { onConflict: 'login,caserne_id' })
    if (changed.error) return json({ error: 'admin_station_change_failed' }, 409)
    return json({ status: enabled ? 'granted' : 'revoked' })
  }

  if (mode === 'admin_personnel_status') {
    if (!personnelEnforcement) return json({ error: 'personnel_enforcement_disabled' }, 503)
    if (!['superadmin', 'administrateur_caserne'].includes(callerRole)) return json({ error: 'forbidden' }, 403)
    const targetLogin = normalizeLogin(payload.login)
    const targetStatus = String(payload.status ?? '')
    const start = payload.startsOn == null || payload.startsOn === '' ? null : String(payload.startsOn)
    const end = payload.endsOn == null || payload.endsOn === '' ? null : String(payload.endsOn)
    if (!targetLogin || targetLogin === callerLogin) return json({ error: 'invalid_target' }, 400)
    const { data: target, error: targetError } = await admin.from('agai_identity_credentials')
      .select('login,caserne_id,app_role').eq('login', targetLogin).maybeSingle()
    if (targetError || !target) return json({ error: 'unknown_account' }, 404)
    if (callerRole !== 'superadmin' &&
      (target.caserne_id !== effectiveStation ||
       ['superadmin','chef_corps','administrateur_caserne'].includes(target.app_role)))
      return json({ error: 'forbidden' }, 403)
    const { data: currentStatus, error: currentStatusError } = await admin.from('agai_personnel_access')
      .select('status').eq('login', targetLogin).maybeSingle()
    if (currentStatusError) return json({ error: 'personnel_access_unavailable' }, 503)
    if (callerRole !== 'superadmin' &&
      ['demission','licenciement','retraite'].includes(currentStatus?.status ?? ''))
      return json({ error: 'superadmin_approval_required' }, 403)
    const changed = await admin.rpc('agai_set_personnel_access', {
      p_login: targetLogin, p_status: targetStatus, p_start: start, p_end: end, p_actor: callerLogin,
    })
    if (changed.error) return json({ error: 'personnel_status_rejected' }, 409)
    return json({ status: 'updated', login: targetLogin, revision: changed.data })
  }

  if (mode === 'admin_provision') {
    if (!['superadmin', 'administrateur_caserne'].includes(callerRole)) return json({ error: 'forbidden' }, 403)
    const targetLogin = normalizeLogin(payload.login)
    const targetStation = String(payload.caserneId ?? '').trim()
    const targetRole = String(payload.appRole ?? 'agent')
    const newPassword = String(payload.newPassword ?? '')
    if (!targetLogin || !targetStation || newPassword.length < 12) return json({ error: 'invalid_account' }, 400)
    if (callerRole !== 'superadmin' && (targetStation !== effectiveStation || targetRole !== 'agent')) return json({ error: 'forbidden' }, 403)
    const hash = await hashLegacyPassword(newPassword)
    // La creation ne doit jamais reprendre un login deja attribue a une
    // autre caserne. Une mutation suit une procedure distincte et approuvee.
    const provisioned = await admin.from('agai_identity_credentials').insert({
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
    if (callerRole !== 'superadmin' && (targetStation !== effectiveStation || targetRole !== 'agent')) return json({ error: 'forbidden' }, 403)
    const { data: currentTarget, error: currentTargetError } = await admin.from('agai_identity_credentials')
      .select('caserne_id,app_role').eq('login', targetLogin).maybeSingle()
    if (currentTargetError || !currentTarget) return json({ error: 'unknown_account' }, 404)
    if (currentTarget.caserne_id !== targetStation) return json({ error: 'transfer_approval_required' }, 403)
    if (callerRole !== 'superadmin' && (currentTarget.caserne_id !== effectiveStation || currentTarget.app_role !== 'agent')) return json({ error: 'forbidden' }, 403)
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
    if (!target || targetLogin === callerLogin || (callerRole !== 'superadmin' &&
      (target.caserne_id !== effectiveStation || ['superadmin','chef_corps','administrateur_caserne'].includes(target.app_role))))
      return json({ error: 'forbidden' }, 403)
    const deactivated = await admin.from('agai_identity_credentials').update({ active: false, source_updated_at: new Date().toISOString() }).eq('login', targetLogin)
    if (deactivated.error) return json({ error: 'credential_update_failed' }, 503)
    const { data: targetLink } = await admin.from('agai_auth_links').select('*').eq('login', targetLogin).maybeSingle()
    if (targetLink?.auth_user_id) {
      const banned = await admin.auth.admin.updateUserById(targetLink.auth_user_id, { ban_duration: '876000h' })
      if (banned.error) return json({ error: 'identity_update_failed' }, 503)
    }
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
    if (!target || targetLogin === callerLogin || (callerRole !== 'superadmin' &&
      (target.caserne_id !== effectiveStation || ['superadmin','chef_corps','administrateur_caserne'].includes(target.app_role))))
      return json({ error: 'forbidden' }, 403)
    if (newPassword.length < 12) return json({ error: 'password_policy' }, 400)
    const hash = await hashLegacyPassword(newPassword)
    const changed = await admin.from('agai_identity_credentials').update({ password_hash: hash, source_updated_at: new Date().toISOString() }).eq('login', targetLogin)
    if (changed.error) return json({ error: 'credential_update_failed' }, 503)
    const { data: targetLink } = await admin.from('agai_auth_links').select('*').eq('login', targetLogin).maybeSingle()
    if (targetLink?.auth_user_id) {
      const authChanged = await admin.auth.admin.updateUserById(targetLink.auth_user_id, { password: newPassword })
      if (authChanged.error) return json({ error: 'identity_update_failed' }, 503)
    }
    return json({ status: 'password_updated' })
  }

  return json({ error: 'unsupported_mode' }, 400)
})
