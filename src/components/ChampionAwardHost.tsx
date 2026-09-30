import { useCallback, useEffect, useRef, useState } from 'react'
import {
  acknowledgeChampionAward,
  acknowledgeMmrAnnouncement,
  getMyChampionAward,
  getMyGlobalRating,
  redeemChampionAppleOffer,
} from '@/services/mmr'
import type { ChampionAward } from '@/types/mmr'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { MfaStepUp } from '@/components/MfaStepUp'
import { formatDate } from '@/utils/format'
import { functionErrorMessage } from '@/utils/backendErrors'

/**
 * Hosts the one-time Global MMR modals that iOS presents from its app shell:
 *  - "Global MMR is live" announcement (`vrc_get_my_global_rating().announcement`, acked via
 *    `vrc_acknowledge_mmr_announcement` so the server never sends it again), and
 *  - the quarterly "The World Champion" reward (`vrc_get_my_champion_award` / `vrc_acknowledge_champion_award`).
 * Both are best-effort niceties, never gates: any failure just leaves them hidden until the next refresh.
 */
const REFRESH_MIN_INTERVAL_MS = 5 * 60 * 1000

export function ChampionAwardHost() {
  const [announcement, setAnnouncement] = useState<{ key: string; headline: string; body: string } | null>(null)
  const [award, setAward] = useState<ChampionAward | null>(null)
  const acknowledgedKeys = useRef(new Set<string>())
  const acknowledgedTerms = useRef(new Set<string>())
  const lastChecked = useRef(0)

  const refresh = useCallback(async () => {
    lastChecked.current = Date.now()
    try {
      const rating = await getMyGlobalRating()
      const dto = rating.announcement
      if (dto && !acknowledgedKeys.current.has(dto.key)) setAnnouncement((prev) => prev ?? dto)
    } catch {
      // non-fatal
    }
    try {
      const result = await getMyChampionAward()
      if (
        result.state !== 'none' &&
        result.term_id &&
        result.acknowledged !== true &&
        !acknowledgedTerms.current.has(result.term_id)
      ) {
        setAward((prev) => prev ?? result)
      }
    } catch {
      // non-fatal
    }
  }, [])

  useEffect(() => {
    void refresh()
    function onVisible() {
      if (document.visibilityState === 'visible' && Date.now() - lastChecked.current > REFRESH_MIN_INTERVAL_MS) {
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  async function dismissAnnouncement() {
    if (!announcement) return
    acknowledgedKeys.current.add(announcement.key)
    const key = announcement.key
    setAnnouncement(null)
    try {
      await acknowledgeMmrAnnouncement(key)
    } catch {
      // the session-level set prevents a re-prompt; the server dedup catches up on the next successful call
    }
  }

  async function dismissAward() {
    const termId = award?.term_id
    setAward(null)
    if (!termId) return
    acknowledgedTerms.current.add(termId)
    try {
      await acknowledgeChampionAward(termId)
    } catch {
      // non-fatal
    }
  }

  // The announcement is the more general message; show the champion reward after it is dismissed.
  if (announcement) {
    return (
      <Modal title={announcement.headline} onClose={dismissAnnouncement}>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {announcement.body}
        </p>
        <Button className="mt-4 w-full" onClick={dismissAnnouncement}>
          Got it
        </Button>
      </Modal>
    )
  }
  if (award) return <ChampionRewardModal initialAward={award} onClose={dismissAward} />
  return null
}

type AppleOfferState =
  | { kind: 'idle' }
  | { kind: 'verifying' }
  | { kind: 'revealed'; code: string; redeemUrl: string | null }
  | { kind: 'failed'; message: string }

/**
 * The World Champion reward screen (iOS `VRCChampionRewardView`). Restrained gold + crown. Shows the recoverable
 * delivery state — entitlement ready, Apple offer pending/revealed, email retrying. No tie-break input, opponent,
 * pace/integrity value or selection MMR is ever shown. An Apple-paid winner can reveal their one-time App Store
 * offer code after a fresh two-factor check; redemption itself happens in the App Store.
 */
export function ChampionRewardModal({ initialAward, onClose }: { initialAward?: ChampionAward; onClose: () => void }) {
  const [award, setAward] = useState<ChampionAward | null>(initialAward ?? null)
  const [offer, setOffer] = useState<AppleOfferState>({ kind: 'idle' })

  useEffect(() => {
    getMyChampionAward()
      .then(setAward)
      .catch(() => undefined)
  }, [])

  async function reveal(factorId: string, code: string): Promise<string | null> {
    if (!award?.term_id) return 'This award is no longer available.'
    setOffer({ kind: 'verifying' })
    try {
      const result = await redeemChampionAppleOffer(award.term_id, factorId, code)
      if (result.apple_offer?.code) {
        setOffer({ kind: 'revealed', code: result.apple_offer.code, redeemUrl: result.apple_offer.redeem_url ?? null })
        return null
      }
      if (result.state === 'entitlement_active') {
        setOffer({ kind: 'idle' })
        return null
      }
      const message = await functionErrorMessage(result.error ?? null, offerFallback(result.error))
      setOffer({ kind: 'failed', message })
      return message
    } catch (err) {
      const message = await functionErrorMessage(err, offerFallback(null))
      setOffer({ kind: 'failed', message })
      return message
    } finally {
      getMyChampionAward()
        .then(setAward)
        .catch(() => undefined)
    }
  }

  const entitlement = award?.entitlement_status
  const title =
    entitlement === 'revoked'
      ? 'Title removed'
      : entitlement === 'expired'
        ? 'Quarter complete'
        : entitlement === 'paid_subscription_preserved'
          ? 'Your subscription is untouched'
          : 'Premium is active'
  const body =
    entitlement === 'revoked'
      ? 'Your two-factor authentication was turned off or you opted out of Global MMR, so the title and complimentary Premium were removed. An App Store offer you already redeemed keeps running through the App Store.'
      : entitlement === 'expired'
        ? 'The quarter is over. Thanks for racing — a new World Champion is chosen at the start of each quarter.'
        : entitlement === 'paid_subscription_preserved'
          ? 'You already subscribe through the App Store, so your paid plan continues exactly as before. Redeem the free three-month App Store offer below to add time on top.'
          : 'A three-month Premium membership is active on your account right now — no charge, and it ends automatically when the quarter does.'

  const offerStatus = award?.apple_offer?.status
  const showOffer = award?.apple_offer?.required === true && award.state === 'active'

  return (
    <Modal title="World Champion" onClose={onClose}>
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-4xl" aria-hidden>
            👑
          </p>
          <p className="mt-1 text-lg font-bold">{award?.headline ?? 'You are the World Champion'}</p>
          {award?.body && (
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {award.body}
            </p>
          )}
          {award?.term_end_at && (
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Your title runs through {formatDate(award.term_end_at)}.
            </p>
          )}
        </div>

        {award ? (
          <Card>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {body}
            </p>
          </Card>
        ) : (
          <Card>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Your World Champion details are loading…
            </p>
          </Card>
        )}

        {showOffer && (
          <Card>
            <p className="text-sm font-semibold">Your free three-month App Store offer</p>
            <p className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Redeemed inside the App Store — your paid plan resumes afterward.
            </p>
            {offer.kind === 'revealed' ? (
              <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Your one-time code
                </p>
                <p
                  className="select-all rounded-lg border p-3 font-mono text-lg font-bold"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                >
                  {offer.code}
                </p>
                {offer.redeemUrl && (
                  <a
                    href={offer.redeemUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block rounded-lg px-3.5 py-2 text-sm font-medium"
                    style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }}
                  >
                    Redeem in the App Store
                  </a>
                )}
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Keep this code — it&apos;s shown here only. After the free three months, normal App Store billing resumes.
                </p>
              </div>
            ) : offerStatus === 'redeemed' ? (
              <p className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>
                Offer redeemed
              </p>
            ) : offerStatus === 'cancelled' ? (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                This offer was cancelled when the title was removed.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Confirm a fresh two-factor code to reveal your one-time offer code. We never email the code.
                </p>
                {offer.kind === 'failed' && (
                  <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
                    {offer.message}
                  </p>
                )}
                <MfaStepUp actionLabel="Confirm and reveal offer" busy={offer.kind === 'verifying'} onConfirm={reveal} />
              </div>
            )}
          </Card>
        )}

        {(award?.email_status === 'failed' || award?.email_status === 'pending') && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            We&apos;re still sending your confirmation email. You don&apos;t need it to keep your reward — everything is already
            active on your account.
          </p>
        )}

        <Button className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  )
}

function offerFallback(code: string | null | undefined): string {
  switch (code) {
    case 'APPLE_OFFER_NOT_CONFIGURED':
      return "The App Store offer isn't available yet. Your Premium membership is active for the quarter — try the redemption again later."
    case 'MFA_REQUIRED':
      return 'Confirm a fresh two-factor code, then try again.'
    case 'UNAUTHORIZED':
      return "This offer isn't available for your account."
    default:
      return "The App Store offer couldn't be issued right now. Your Premium membership is active — try again shortly."
  }
}
