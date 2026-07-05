import { supabase } from '@/supabase/client'
import type { InvitationRow, VrcRole } from '@/types/database'

export async function getLeagueInvitations(leagueId: string): Promise<InvitationRow[]> {
  const { data, error } = await supabase
    .from('invitations')
    .select('*, invitation_roles(role)')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
    .returns<(InvitationRow & { invitation_roles: { role: VrcRole }[] })[]>()
  if (error) throw error
  return data ?? []
}

/** Code-only invitation, no email delivery. */
export async function createInvitationCode(
  leagueId: string,
  roles: VrcRole[],
  expiresAt: string | null,
): Promise<{ invitationId: string; code: string }> {
  const { data, error } = await supabase.rpc('vrc_create_invitation', {
    p_league: leagueId,
    p_roles: roles,
    p_email: null,
    p_expires_at: expiresAt,
  })
  if (error) throw error
  const row = data as { invitation_id: string; code: string }
  return { invitationId: row.invitation_id, code: row.code }
}

export interface InviteSendResult {
  success: boolean
  invitationId: string
  sendStatus: 'pending' | 'sent' | 'failed'
}

async function callSendLeagueInvite(body: Record<string, unknown>): Promise<InviteSendResult> {
  const { data, error } = await supabase.functions.invoke('send-league-invite', { body })
  if (error) throw error
  return data as InviteSendResult
}

/** Emailed invitation — creates the invite then asks the send-league-invite edge function to deliver it. */
export async function sendInvitationEmail(
  leagueId: string,
  roles: VrcRole[],
  email: string,
  expiresAt: string | null,
): Promise<InviteSendResult> {
  return callSendLeagueInvite({
    action: 'create',
    league_id: leagueId,
    roles,
    email,
    expires_at: expiresAt,
  })
}

export async function resendInvitationEmail(invitationId: string): Promise<InviteSendResult> {
  return callSendLeagueInvite({ action: 'resend', invitation_id: invitationId })
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc('vrc_revoke_invitation', { p_invitation: invitationId })
  if (error) throw error
}

/** Manual "enter a code" join flow (/join). */
export async function acceptInvitationCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('vrc_accept_invitation', { p_code: code })
  if (error) throw error
  return data as string
}

/** HTTPS invite-link flow (/invite/:token) — token is single-use, never shown to the user. */
export async function acceptInvitationToken(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('vrc_accept_invitation_by_token', { p_token: token })
  if (error) throw error
  return data as string
}

export async function createViewerCode(leagueId: string): Promise<string> {
  const { data, error } = await supabase.rpc('vrc_create_viewer_code', { p_league: leagueId })
  if (error) throw error
  return data as string
}

export async function revokeViewerCode(leagueId: string): Promise<void> {
  const { error } = await supabase.rpc('vrc_revoke_viewer_code', { p_league: leagueId })
  if (error) throw error
}

export async function acceptViewerCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('vrc_accept_viewer_code', { p_code: code })
  if (error) throw error
  return data as string
}
