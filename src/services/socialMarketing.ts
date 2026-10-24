import { supabase } from "@/supabase/client";
export type SocialNetwork = "threads" | "instagram" | "tiktok" | "youtube";
export interface SocialPost {
  id: string;
  league_id: string;
  network: SocialNetwork;
  title: string;
  caption: string;
  cta_url: string;
  source_kind: string;
  source_id: string;
  source_hash: string;
  facts: Record<string, unknown>;
  template_version: string;
  content_format: string;
  state: string;
  scheduled_at: string;
  asset_path: string | null;
  asset_sha256: string | null;
  asset_kind: string | null;
  last_error: string | null;
  provider_id: string | null;
  public_url: string | null;
}
export interface Campaign {
  league_id: string;
  generation_enabled: boolean;
  stopped: boolean;
  timezone: string;
  weekday: number;
  local_hour: number;
  formats: string[];
  external_rights_note: string | null;
  brand_id: string;
}
export interface SocialDashboard {
  campaign: Campaign | null;
  channels: {
    network: SocialNetwork;
    account_id: string;
    enabled: boolean;
    publish_authorization: string | null;
  }[];
  posts: SocialPost[];
  audit: { id: number; action: string; post_id: string | null; at: string }[];
  metrics: {
    post_id: string;
    sampled_at: string;
    metrics: Record<string, number>;
  }[];
}
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}
export const getSocialDashboard = (league: string) =>
  rpc<SocialDashboard>("vrc_social_dashboard", { p_league: league });
export const generateSocialDrafts = (league: string, kind: string | null) =>
  rpc<number>("vrc_social_generate", { p_league: league, p_kind: kind });
export const stopSocialPublishing = (league: string) =>
  rpc<void>("vrc_social_stop", { p_league: league });
export const configureSocial = (c: Campaign) =>
  rpc<void>("vrc_social_configure", {
    p_league: c.league_id,
    p_enabled: c.generation_enabled,
    p_stopped: c.stopped,
    p_timezone: c.timezone,
    p_weekday: c.weekday,
    p_hour: c.local_hour,
    p_rights: c.external_rights_note,
    p_formats: c.formats,
  });
export const reviewSocialPost = (
  id: string,
  approve: boolean,
  checks: Record<string, boolean>,
  date: string,
) =>
  rpc<void>("vrc_social_review", {
    p_post: id,
    p_approve: approve,
    p_checks: checks,
    p_scheduled_at: date,
  });
export async function attachSocialAsset(
  post: SocialPost,
  file: Blob,
  kind: "image" | "video",
) {
  if (file.size > 50 * 1024 * 1024) {
    throw new Error("Media must be smaller than 50 MB.");
  }
  const sha = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const path = `${post.league_id}/${post.id}/${crypto.randomUUID()}.${
    kind === "video" ? "mp4" : "png"
  }`;
  const { error } = await supabase.storage.from("social-marketing").upload(
    path,
    file,
    {
      contentType: kind === "video" ? "video/mp4" : "image/png",
      upsert: false,
    },
  );
  if (error) throw error;
  await rpc("vrc_social_attach_asset", {
    p_post: post.id,
    p_path: path,
    p_sha256: sha,
    p_kind: kind,
  });
}
export async function socialAssetUrl(path: string) {
  const { data, error } = await supabase.storage.from("social-marketing")
    .createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}
