import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const ACTIVE_EVENTS = new Set(['PURCHASE_APPROVED'])
const REVOKED_EVENTS = new Set([
  'PURCHASE_CANCELED',
  'PURCHASE_REFUNDED',
  'PURCHASE_CHARGEBACK',
  'PURCHASE_EXPIRED',
  'SUBSCRIPTION_CANCELLATION',
])

function sameSecret(received, expected) {
  if (!received || !expected) return false
  const left = Buffer.from(received)
  const right = Buffer.from(expected)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function getEventData(payload) {
  const data = payload?.data || payload || {}
  return {
    eventId: String(payload?.id || data?.id || ''),
    event: String(payload?.event || data?.event || ''),
    email: String(data?.buyer?.email || payload?.buyer?.email || '').trim().toLowerCase(),
    name: String(data?.buyer?.name || payload?.buyer?.name || '').trim(),
    productId: String(data?.product?.id || payload?.product?.id || ''),
    transactionId: String(data?.purchase?.transaction || payload?.purchase?.transaction || ''),
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Método não permitido.' })
  }

  const hottok = request.headers['x-hotmart-hottok']
  if (!sameSecret(String(hottok || ''), process.env.HOTMART_HOTTOK || '')) {
    return response.status(401).json({ error: 'Webhook não autorizado.' })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return response.status(500).json({ error: 'Integração Supabase não configurada.' })
  }

  const eventData = getEventData(request.body)
  if (!eventData.eventId || !eventData.event || !eventData.email) {
    return response.status(400).json({ error: 'Evento Hotmart sem identificação ou e-mail do comprador.' })
  }

  if (process.env.HOTMART_PRODUCT_ID && eventData.productId && eventData.productId !== process.env.HOTMART_PRODUCT_ID) {
    return response.status(202).json({ ignored: true, reason: 'Produto não vinculado à Área Premium.' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: previousEvent } = await supabase
    .from('hotmart_webhook_events')
    .select('id')
    .eq('id', eventData.eventId)
    .maybeSingle()

  if (previousEvent) return response.status(200).json({ ok: true, duplicate: true })

  const isActive = ACTIVE_EVENTS.has(eventData.event)
  const isRevoked = REVOKED_EVENTS.has(eventData.event)

  await supabase.from('hotmart_webhook_events').insert({
    id: eventData.eventId,
    event: eventData.event,
    buyer_email: eventData.email,
    product_id: eventData.productId || null,
    transaction_id: eventData.transactionId || null,
    payload: request.body,
  })

  if (!isActive && !isRevoked) {
    return response.status(200).json({ ok: true, ignored: true })
  }

  const status = isActive ? 'active' : 'revoked'
  await supabase.from('hotmart_accesses').upsert({
    email: eventData.email,
    buyer_name: eventData.name || null,
    status,
    product_id: eventData.productId || null,
    transaction_id: eventData.transactionId || null,
    last_event_id: eventData.eventId,
    last_event: eventData.event,
    purchased_at: isActive ? new Date().toISOString() : null,
    revoked_at: isRevoked ? new Date().toISOString() : null,
    payload: request.body,
  }, { onConflict: 'email' })

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('email', eventData.email)
    .maybeSingle()

  if (profile?.user_id) {
    await supabase
      .from('profiles')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('user_id', profile.user_id)

    await supabase
      .from('hotmart_accesses')
      .update({ user_id: profile.user_id, updated_at: new Date().toISOString() })
      .eq('email', eventData.email)
  }

  if (isActive && !profile?.user_id) {
    const { data: invitation, error: invitationError } = await supabase.auth.admin.inviteUserByEmail(eventData.email, {
      data: { name: eventData.name || null, access_source: 'hotmart' },
      redirectTo: process.env.APP_URL ? `${process.env.APP_URL}/login` : undefined,
    })

    if (!invitationError && invitation?.user?.id) {
      await supabase
        .from('profiles')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('user_id', invitation.user.id)

      await supabase
        .from('hotmart_accesses')
        .update({ user_id: invitation.user.id, updated_at: new Date().toISOString() })
        .eq('email', eventData.email)
    }
  }

  return response.status(200).json({ ok: true, status })
}
