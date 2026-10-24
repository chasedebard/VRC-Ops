import { useCallback, useEffect, useRef, useState } from "react";
import { useLeagueSession } from "@/hooks/useLeagueSession";
import { RequirePermission } from "@/permissions/Guard";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { backendErrorMessage } from "@/utils/backendErrors";
import {
  attachSocialAsset,
  type Campaign,
  configureSocial,
  generateSocialDrafts,
  getSocialDashboard,
  reviewSocialPost,
  socialAssetUrl,
  type SocialDashboard,
  type SocialPost,
  stopSocialPublishing,
} from "@/services/socialMarketing";
import {
  downloadBlob,
  paintSocialCard,
  socialCardBlob,
} from "@/utils/socialCard";

export default function SocialMarketingPage() {
  const { selectedLeague } = useLeagueSession();
  return (
    <RequirePermission permission="canManageSetup">
      <Marketing key={selectedLeague?.league.id ?? "none"} />
    </RequirePermission>
  );
}
function Marketing() {
  const { selectedLeague, permissions } = useLeagueSession(),
    league = selectedLeague?.league.id;
  const [data, setData] = useState<SocialDashboard | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(""),
    [kind, setKind] = useState(""),
    [settings, setSettings] = useState<Campaign | null>(null);
  const load = useCallback(async () => {
    if (!league) return;
    setError(null);
    try {
      setData(await getSocialDashboard(league));
    } catch (e) {
      setError(backendErrorMessage(e, "Could not load social marketing."));
    }
  }, [league]);
  useEffect(() => {
    setData(null);
    setSettings(null);
    void load();
  }, [load]);
  async function action(task: () => Promise<unknown>, message: string) {
    setBusy(true);
    setNotice("");
    try {
      await task();
      setNotice(message);
      await load();
    } catch (e) {
      setNotice(backendErrorMessage(e, "Could not save this change."));
    } finally {
      setBusy(false);
    }
  }
  if (!league) return <EmptyState title="No league selected" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingState label="Loading social marketing…" />;
  if (!data.campaign) {
    return (
      <EmptyState
        title="Social marketing is not configured for this league"
        description="A campaign and its publishing accounts must be provisioned before drafts can be created."
      />
    );
  }
  const c = data.campaign;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Social marketing</h1>
          <p className="text-sm">
            VRC Ops first. RFS League shows it in action.
          </p>
        </div>
        <Button
          variant="danger"
          disabled={busy}
          onClick={() =>
            action(
              () => stopSocialPublishing(league),
              "Publishing stopped. Check Metricool for any post already submitted.",
            )}
        >
          Stop publishing
        </Button>
      </div>
      <Card>
        <p className="font-semibold">
          {c.stopped
            ? "Publishing is stopped"
            : "Approval is required for every post"}
        </p>
        <p className="mt-1 text-sm">
          Approving a draft does not authorize a channel. Publishing also
          requires channel authorization and an enabled server connection.
          Stopping here prevents new submissions; posts already in Metricool
          need to be stopped there.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {data.channels.map((n) => (
            <span key={n.network} className="text-sm">
              {n.network} · {n.account_id} ·{" "}
              {n.publish_authorization ? "authorized" : "publishing disabled"}
            </span>
          ))}
        </div>
      </Card>
      {notice && <p role="status" className="text-sm">{notice}</p>}
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          Content{" "}
          <select
            aria-label="Content type"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="ml-2 rounded border p-2 bg-transparent"
          >
            <option value="">Choose from verified sources</option>
            <option value="race_result">Official results</option>
            <option value="next_race">Next published race</option>
            <option value="championship">Championship standings</option>
            <option value="driver_spotlight">
              Driver spotlight with permission
            </option>
            <option value="app_feature">App features</option>
          </select>
        </label>
        <Button
          disabled={busy || !c.generation_enabled}
          onClick={() =>
            action(async () => {
              const count = await generateSocialDrafts(league, kind || null);
              if (!count) {
                throw new Error(
                  "No new eligible source or weekly slot is available.",
                );
              }
            }, "Drafts created for review.")}
        >
          Create weekly drafts
        </Button>
        {permissions.canManageLeague && (
          <Button
            variant="secondary"
            onClick={() => setSettings({ ...c })}
          >
            Campaign settings
          </Button>
        )}
      </div>
      {settings && (
        <Card>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                await configureSocial(settings);
                setSettings(null);
              }, "Campaign settings saved.");
            }}
          >
            <h2 className="font-semibold">Weekly campaign</h2>
            <label className="block text-sm">
              <input
                type="checkbox"
                checked={settings.generation_enabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    generation_enabled: e.target.checked,
                  })}
              />{" "}
              Create drafts automatically
            </label>
            <label className="block text-sm">
              <input
                type="checkbox"
                checked={settings.stopped}
                onChange={(e) =>
                  setSettings({ ...settings, stopped: e.target.checked })}
              />{" "}
              Stop all new publishing submissions
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="Time zone"
                value={settings.timezone}
                required
                onChange={(e) =>
                  setSettings({ ...settings, timezone: e.target.value })}
              />
              <label className="text-sm">
                Day<select
                  className="block w-full rounded border p-2 bg-transparent"
                  value={settings.weekday}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      weekday: Number(e.target.value),
                    })}
                >
                  {[
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ].map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </label>
              <Field
                label="Hour (0–23)"
                type="number"
                min="0"
                max="23"
                value={settings.local_hour}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    local_hour: Number(e.target.value),
                  })}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">
                Rotate content formats
              </legend>
              {["app_demo", "race_story", "still", "animation"].map(
                (format) => (
                  <label className="flex gap-2 text-sm" key={format}>
                    <input
                      type="checkbox"
                      checked={settings.formats.includes(format)}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          formats: e.target.checked
                            ? [...settings.formats, format]
                            : settings.formats.filter((f) => f !== format),
                        })}
                    />
                    {format.replaceAll("_", " ")}
                  </label>
                ),
              )}
            </fieldset>
            <Field
              label="Permission to use league data externally"
              hint="Record who granted permission, what it covers, and where the evidence is held. This does not grant permission to use driver identities or media."
              minLength={10}
              maxLength={2000}
              required
              value={settings.external_rights_note ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  external_rights_note: e.target.value,
                })}
            />
            <Button type="submit" disabled={busy}>Save settings</Button>{" "}
            <Button
              variant="ghost"
              type="button"
              onClick={() => setSettings(null)}
            >
              Cancel
            </Button>
          </form>
        </Card>
      )}
      {!data.posts.length && (
        <EmptyState
          title="No drafts yet"
          description="Only official results, published schedules, current standings and verified app features are eligible."
        />
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        {data.posts.map((p) => (
          <Post key={p.id} post={p} busy={busy} action={action} />
        ))}
      </div>
      <Card>
        <h2 className="font-semibold">Activity</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {data.audit.map((a) => (
            <li key={a.id}>
              {new Date(a.at).toLocaleString()} ·{" "}
              {a.action.replaceAll("_", " ")}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="font-semibold">Performance feedback</h2>
        <p className="text-sm mt-2">
          Compare reach, views and engagement after publication. Use results to
          propose the next content mix; new content still requires review.
        </p>
        {data.metrics.length
          ? (
            <pre className="text-xs overflow-auto mt-2">{JSON.stringify(data.metrics,null,2)}</pre>
          )
          : <p className="text-sm mt-2">No published performance data yet.</p>}
      </Card>
    </div>
  );
}
type Action = (task: () => Promise<unknown>, message: string) => Promise<void>;
function Post(
  { post: p, busy, action }: {
    post: SocialPost;
    busy: boolean;
    action: Action;
  },
) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [checks, setChecks] = useState<Record<string, boolean>>({}),
    [asset, setAsset] = useState<string | null>(null);
  const [when, setWhen] = useState(() => {
    const d = new Date(p.scheduled_at);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString()
      .slice(0, 16);
  });
  useEffect(() => {
    if (canvas.current) {
      paintSocialCard(canvas.current, p, p.network === "youtube");
    }
  }, [p]);
  useEffect(() => {
    setAsset(null);
    if (!p.asset_path) return;
    let current = true;
    socialAssetUrl(p.asset_path).then((url) => {
      if (current) setAsset(url);
    }).catch(() => {});
    return () => {
      current = false;
    };
  }, [p.asset_path]);
  const needsMedia = p.network !== "threads" || p.content_format !== "still";
  const editable = ["draft", "approved", "rejected"].includes(p.state),
    all = ["facts", "rights", "privacy", "brand", "moderation"].every((k) =>
      checks[k]
    );
  const labels: Record<string, string> = {
    facts: "Facts match the official source",
    rights: "League and media permissions cover this post",
    privacy:
      "Only approved aliases; no real names, driver pictures or private details",
    brand: "Caption, graphic and app call to action are correct",
    moderation: "Content is original, respectful and suitable for this channel",
  };
  return (
    <Card className="space-y-3">
      <div className="flex justify-between gap-2">
        <h2 className="font-semibold capitalize">
          {p.network} · {p.content_format.replaceAll("_", " ")} ·{" "}
          {p.source_kind.replaceAll("_", " ")}
        </h2>
        <span className="text-sm">{p.state}</span>
      </div>
      <canvas
        ref={canvas}
        aria-label={`Graphic preview: ${p.title}`}
        className="w-full max-w-xs rounded-lg"
      />
      <p className="whitespace-pre-wrap text-sm">{p.caption}</p>
      <a
        className="text-sm underline"
        href={p.cta_url}
        target="_blank"
        rel="noreferrer"
      >
        App call to action
      </a>
      <details className="text-sm">
        <summary>Verified source and revision</summary>
        <pre className="overflow-auto text-xs mt-2">{JSON.stringify({kind:p.source_kind,id:p.source_id,hash:p.source_hash,facts:p.facts},null,2)}</pre>
      </details>
      {p.last_error && (
        <p role="alert" className="text-sm">
          {p.last_error.replaceAll("_", " ")}
        </p>
      )}
      {asset && (p.asset_kind === "video"
        ? <video controls src={asset} className="max-w-xs rounded" />
        : (
          <img
            src={asset}
            alt="Attached publishing graphic"
            className="max-w-xs rounded"
          />
        ))}
      {p.provider_id && (
        <p className="text-sm">
          Metricool post {p.provider_id}.{" "}
          {p.public_url && (
            <a href={p.public_url} rel="noreferrer" target="_blank">
              View published post
            </a>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() =>
            action(async () =>
              downloadBlob(
                await socialCardBlob(p, p.network === "youtube"),
                `${p.id}.png`,
              ), "Graphic downloaded.")}
        >
          Download graphic
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            downloadBlob(
              new Blob([JSON.stringify(p, null, 2)], {
                type: "application/json",
              }),
              `${p.id}.json`,
            )}
        >
          Download video brief
        </Button>
        {editable && p.network !== "youtube" && p.content_format === "still" &&
          (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                action(
                  async () =>
                    attachSocialAsset(p, await socialCardBlob(p), "image"),
                  "Graphic attached. Review before approving.",
                )}
            >
              Use this graphic
            </Button>
          )}
      </div>
      {editable && (p.network === "youtube" || p.content_format !== "still") &&
        (
          <label className="block text-sm">
            Attach a 1080 × 1920 MP4 (H.264, 3–60 seconds, with media
            rights)<input
              aria-label="Attach MP4"
              type="file"
              accept="video/mp4"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void action(
                    () => attachSocialAsset(p, file, "video"),
                    "Video attached. Review before approving.",
                  );
                }
              }}
            />
          </label>
        )}
      {editable && (
        <>
          <Field
            label="Publish time (your local time)"
            type="datetime-local"
            value={when}
            required
            onChange={(e) => setWhen(e.target.value)}
          />
          <fieldset className="space-y-2">
            <legend className="font-semibold text-sm">
              Review before approval
            </legend>
            {Object.entries(labels).map(([key, label]) => (
              <label key={key} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!checks[key]}
                  onChange={(e) =>
                    setChecks({ ...checks, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <Button
              disabled={busy || !all || (needsMedia && !p.asset_path)}
              onClick={() =>
                action(
                  () =>
                    reviewSocialPost(
                      p.id,
                      true,
                      checks,
                      new Date(when).toISOString(),
                    ),
                  "Approved for the selected time. Channel authorization and server controls still apply.",
                )}
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                action(
                  () => reviewSocialPost(p.id, false, {}, p.scheduled_at),
                  "Draft rejected.",
                )}
            >
              Reject
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
