import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getMyGlobalRating,
  getMyMmrParticipation,
  participationFailureMessage,
  updateMyMmrParticipation,
  type ParticipationTarget,
} from '@/services/mmr'
import { tierLabel, type GlobalRating, type GlobalRatingLedgerEntry, type MmrParticipation } from '@/types/mmr'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { MfaStepUp } from '@/components/MfaStepUp'
import { ChampionRewardModal } from '@/components/ChampionAwardHost'
import { ErrorState, LoadingState } from '@/components/States'
import { formatDate } from '@/utils/format'
import { backendErrorMessage } from '@/utils/backendErrors'

/**
 * Account ▸ Global Rating (iOS `VRCGlobalRatingParticipationView`) — the private cross-league rating control center.
 *
 * Two server-authoritative RPCs back it: `vrc_get_my_mmr_participation` / `vrc_update_my_mmr_participation` (the
 * opt-in/out control, which needs a fresh two-factor step-up) and `vrc_get_my_global_rating` (exact MMR, tier,
 * placement, provisional progress, activity, linked drivers and the private ledger). During the Shadow phase the
 * server returns `coming_soon` — this page then shows NO exact rating, tier, placement or delta, exactly like iOS.
 * The scoring formula, opponent MMR and every integrity/pace input are never available to the browser.
 */
export default function GlobalRatingPage() {
  const [participation, setParticipation] = useState<MmrParticipation | null>(null)
  const [rating, setRating] = useState<GlobalRating | null>(null)
  const [ledger, setLedger] = useState<GlobalRatingLedgerEntry[]>([])
  const [ledgerHasMore, setLedgerHasMore] = useState(false)
  const [ledgerNext, setLedgerNext] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<ParticipationTarget | null>(null)
  const [showReward, setShowReward] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setParticipation(await getMyMmrParticipation())
    } catch {
      setError('Global Rating status is unavailable right now. Try again.')
      setLoading(false)
      return
    }
    // The rich rating summary is best-effort: a failure (or Shadow) just leaves the participation cards.
    try {
      const summary = await getMyGlobalRating()
      setRating(summary)
      setLedger(summary.ledger?.entries ?? [])
      setLedgerHasMore(summary.ledger?.has_more ?? false)
      setLedgerNext(summary.ledger?.next_before ?? null)
    } catch {
      setRating(null)
      setLedger([])
      setLedgerHasMore(false)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function loadMore() {
    if (!ledgerNext || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await getMyGlobalRating(ledgerNext)
      setLedger((prev) => [...prev, ...(page.ledger?.entries ?? [])])
      setLedgerHasMore(page.ledger?.has_more ?? false)
      setLedgerNext(page.ledger?.next_before ?? null)
    } catch {
      setLedgerHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading && !participation) return <LoadingState label="Checking your Global Rating…" />
  if (error || !participation) {
    return <ErrorState message={error ?? 'Global Rating is unavailable.'} onRetry={() => void load()} />
  }

  const isShadow = (participation.feature_visibility_status ?? 'shadow') !== 'public'
  const mfaActive = Boolean(participation.mfa_active)
  const optedOut = participation.participation_status === 'opted_out' || rating?.state === 'opted_out'
  const comingSoon = rating?.state === 'coming_soon'

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link to="/account" className="text-sm underline" style={{ color: 'var(--color-text-muted)' }}>
          ← Account
        </Link>
        <h1 className="text-2xl font-bold">Global Rating</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Private cross-league rating
        </p>
      </div>

      {isShadow || comingSoon ? (
        <>
          <ShadowNotice />
          {!mfaActive ? <MfaRequiredCard onRefresh={load} /> : optedOut ? <OptedOutCard onOptIn={() => setPending('opted_in')} /> : <OptedInCard onOptOut={() => setPending('opted_out')} />}
        </>
      ) : !mfaActive ? (
        <MfaRequiredCard onRefresh={load} />
      ) : optedOut ? (
        <OptedOutCard onOptIn={() => setPending('opted_in')} />
      ) : rating ? (
        <>
          {(rating.is_world_champion || rating.title_badge === 'world_champion') && (
            <Card>
              <CardTitle>
                <span style={{ color: 'var(--color-warning)' }}>👑 The World Champion</span>
              </CardTitle>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                You finished the quarter as the #1 National Champion. Your title and a three-month Premium membership are
                active.
              </p>
              <Button className="mt-3" variant="secondary" onClick={() => setShowReward(true)}>
                Open reward screen
              </Button>
            </Card>
          )}
          <RatingSummary rating={rating} />
          {rating.provisional && rating.provisional_progress && <ProvisionalCard progress={rating.provisional_progress} />}
          {rating.linked_drivers && rating.linked_drivers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Linked drivers</CardTitle>
              </CardHeader>
              <ul className="space-y-2 text-sm">
                {rating.linked_drivers.map((d, i) => (
                  <li key={`${d.league_name}-${d.driver_display_name}-${i}`}>
                    <p>{d.driver_display_name ?? 'Driver'}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {[d.league_name, d.linked_at ? `Linked ${formatDate(d.linked_at)}` : null].filter(Boolean).join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <LedgerCard entries={ledger} hasMore={ledgerHasMore} loadingMore={loadingMore} onLoadMore={loadMore} />
          <OptedInCard onOptOut={() => setPending('opted_out')} />
        </>
      ) : (
        <OptedInCard onOptOut={() => setPending('opted_out')} />
      )}

      {pending && (
        <ParticipationConfirmModal
          target={pending}
          onClose={() => setPending(null)}
          onChanged={async () => {
            await load()
          }}
        />
      )}
      {showReward && <ChampionRewardModal onClose={() => setShowReward(false)} />}
    </div>
  )
}

function ShadowNotice() {
  return (
    <Card>
      <CardTitle>Coming soon</CardTitle>
      <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Global Rating isn&apos;t shown yet. This screen only controls whether your official races count toward it — your
        exact rating, tier, and placement stay hidden until it launches.
      </p>
    </Card>
  )
}

function MfaRequiredCard({ onRefresh }: { onRefresh: () => void }) {
  return (
    <Card>
      <CardTitle>Two-factor authentication required</CardTitle>
      <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Changing Global Rating participation needs two-factor authentication on your account. Turn it on under Account ▸
        Two-factor authentication, then come back here.
      </p>
      <Button className="mt-3" variant="secondary" onClick={onRefresh}>
        Refresh
      </Button>
    </Card>
  )
}

function OptedInCard({ onOptOut }: { onOptOut: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>You&apos;re participating</CardTitle>
        <Badge tone="success">On</Badge>
      </CardHeader>
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Your eligible official races count toward your account&apos;s Global Rating. Opting out ends your current rating
        period: your history is kept but never used again, and your rating stops changing. You can opt back in later — it
        starts a brand-new rating at 1,000.
      </p>
      <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        A change takes effect 24 hours before a race&apos;s scheduled start, so it never alters a race that has already
        started.
      </p>
      <Button className="mt-3" variant="danger" onClick={onOptOut}>
        Opt out of Global Rating
      </Button>
    </Card>
  )
}

function OptedOutCard({ onOptIn }: { onOptIn: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>You&apos;ve opted out</CardTitle>
        <Badge tone="neutral">Off</Badge>
      </CardHeader>
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Your races don&apos;t count toward Global Rating. Your earlier rating history is preserved for the record but isn&apos;t
        used in any rating, ranking, or prediction.
      </p>
      <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Opting back in starts a fresh rating at 1,000 and takes effect 24 hours before your next race&apos;s scheduled start.
        Your old rating never returns.
      </p>
      <Button className="mt-3" onClick={onOptIn}>
        Opt back into Global Rating
      </Button>
    </Card>
  )
}

function activityExplanation(reason: string): string {
  switch (reason) {
    case 'no_recent_event':
      return "You're inactive for ranking: your account has no eligible race in the last 90 days. Your rating is unchanged and returns to Active after your next qualifying race."
    case 'no_current_mfa':
      return "You're inactive for ranking because two-factor authentication is off. Turn it back on to restore Active status. Your rating is unchanged."
    default:
      return "You're inactive for ranking. Your rating is unchanged."
  }
}

function RatingSummary({ rating }: { rating: GlobalRating }) {
  const active = rating.activity_status === 'active'
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Global Rating</CardTitle>
        <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Active' : 'Inactive'}</Badge>
      </CardHeader>
      <p className="flex items-baseline gap-2">
        <span className="text-4xl font-bold tabular-nums">{rating.current_mmr ?? '—'}</span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          MMR
        </span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge tone={rating.tier === 'national_champion' ? 'warning' : 'accent'}>{tierLabel(rating.tier)}</Badge>
        {rating.global_rank != null && <Badge tone="neutral">Global #{rating.global_rank}</Badge>}
      </div>
      {rating.activity_reason && !active && (
        <p className="mt-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {activityExplanation(rating.activity_reason)}
        </p>
      )}
    </Card>
  )
}

function ProvisionalCard({ progress }: { progress: { eligible_event_count: number; required: number } }) {
  const fraction = progress.required > 0 ? Math.min(1, progress.eligible_event_count / progress.required) : 0
  return (
    <Card>
      <CardTitle>Provisional progress</CardTitle>
      <p className="mt-1 text-sm tabular-nums">
        {progress.eligible_event_count} of {progress.required} eligible races
      </p>
      <div
        className="mt-2 h-2 rounded-full"
        style={{ backgroundColor: 'var(--color-border)' }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.required}
        aria-valuenow={progress.eligible_event_count}
        aria-label="Provisional progress"
      >
        <div className="h-2 rounded-full" style={{ width: `${fraction * 100}%`, backgroundColor: 'var(--color-accent)' }} />
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Your rating stays Provisional and your tier isn&apos;t shown until you complete {progress.required} eligible races.
      </p>
    </Card>
  )
}

function signed(value: number) {
  return value >= 0 ? `+${value}` : `${value}`
}

function LedgerCard({
  entries,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  entries: GlobalRatingLedgerEntry[]
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rating history</CardTitle>
      </CardHeader>
      {entries.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No rated races yet.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {entries.map((entry, i) => (
            <li key={`${entry.occurred_at}-${entry.pre_mmr}-${entry.post_mmr}-${i}`} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{entry.race?.event_title ?? 'Race'}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {[
                    entry.race?.league_name,
                    entry.race?.class_name,
                    entry.race?.finish_position != null ? `P${entry.race.finish_position}` : null,
                    entry.occurred_at ? formatDate(entry.occurred_at) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {entry.mmr_display_status === 'revised' && <Badge tone="warning">Updated</Badge>}
                {entry.mmr_display_status === 'voided' && <Badge tone="neutral">Voided</Badge>}
              </div>
              <div className="text-right tabular-nums">
                <p
                  className="font-bold"
                  style={{
                    color:
                      entry.final_delta > 0 ? 'var(--color-success)' : entry.final_delta < 0 ? 'var(--color-danger)' : 'var(--color-text-muted)',
                  }}
                >
                  {signed(entry.final_delta)}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {entry.pre_mmr} → {entry.post_mmr}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <Button className="mt-3" variant="secondary" onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </Card>
  )
}

function ParticipationConfirmModal({
  target,
  onClose,
  onChanged,
}: {
  target: ParticipationTarget
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const optOut = target === 'opted_out'
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function confirm(factorId: string, code: string): Promise<string | null> {
    setBusy(true)
    try {
      const result = await updateMyMmrParticipation(target, factorId, code)
      if (!result.ok) return participationFailureMessage(result)
      setDone(true)
      await onChanged()
      return null
    } catch (err) {
      return backendErrorMessage(err, "That code didn't verify. Try the latest code from your authenticator app.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={optOut ? 'Opt out of Global Rating' : 'Opt back in'} onClose={onClose}>
      {done ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--color-success)' }}>
            {optOut ? "You've opted out" : "You're participating"}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {optOut
              ? "Your current rating period has ended. Your history is preserved but won't be used again."
              : 'A fresh rating at 1,000 has started. It takes effect 24 hours before your next race.'}
          </p>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {optOut
              ? 'This ends your current rating period. Your rating history is kept for the record but is permanently excluded from every future rating, ranking, and prediction. Your rating stops changing.'
              : "This starts a brand-new rating at 1,000. Your previous rating never returns. It takes effect 24 hours before your next race's scheduled start."}
          </p>
          <p className="text-sm font-medium">Confirm with two-factor authentication</p>
          <MfaStepUp
            actionLabel={optOut ? 'Confirm opt out' : 'Confirm opt in'}
            destructive={optOut}
            busy={busy}
            onConfirm={confirm}
          />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      )}
    </Modal>
  )
}
