import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { resolvePermissions } from "@/permissions/resolver";
let permission = resolvePermissions(["owner"]);
const load = vi.fn(), review = vi.fn(), stop = vi.fn(), generate = vi.fn();
vi.mock(
  "@/hooks/useLeagueSession",
  () => ({
    useLeagueSession: () => ({
      selectedLeague: { league: { id: "league" } },
      permissions: permission,
    }),
  }),
);
vi.mock("@/services/socialMarketing", () => ({
  getSocialDashboard: (...a: unknown[]) => load(...a),
  reviewSocialPost: (...a: unknown[]) => review(...a),
  stopSocialPublishing: (...a: unknown[]) => stop(...a),
  generateSocialDrafts: (...a: unknown[]) => generate(...a),
  configureSocial: vi.fn(),
  attachSocialAsset: vi.fn(),
  socialAssetUrl: vi.fn(),
}));
vi.mock(
  "@/utils/socialCard",
  () => ({
    paintSocialCard: vi.fn(),
    socialCardBlob: vi.fn(),
    downloadBlob: vi.fn(),
  }),
);
import Page from "./SocialMarketingPage";
const dashboard = {
  campaign: {
    league_id: "league",
    generation_enabled: true,
    stopped: true,
    timezone: "America/New_York",
    weekday: 3,
    local_hour: 12,
    external_rights_note: "Fixture permission",
    brand_id: "1",
  },
  channels: [{
    network: "threads",
    account_id: "vrc.ops",
    enabled: true,
    publish_authorization: null,
  }],
  posts: [{
    id: "post",
    league_id: "league",
    network: "threads",
    title: "VRC Ops",
    caption: "Verified official results",
    cta_url: "https://apps.apple.com/us/app/vrc-ops/id6780654622",
    source_kind: "race_result",
    source_id: "source",
    source_hash: "hash",
    facts: { title: "Fixture circuit" },
    template_version: "vrc-social-1",
    content_format: "still",
    state: "draft",
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    asset_path: null,
    asset_kind: null,
    provider_id: null,
  }],
  audit: [],
  metrics: [],
};
beforeEach(() => {
  permission = resolvePermissions(["owner"]);
  vi.clearAllMocks();
  load.mockResolvedValue(dashboard);
  review.mockResolvedValue(undefined);
  stop.mockResolvedValue(undefined);
});
describe("Social marketing approval boundary", () => {
  it("hides the workflow from drivers without making a request", async () => {
    permission = resolvePermissions(["driver"]);
    render(<Page />);
    expect(screen.getByText("Restricted")).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });
  it("shows the kill switch and disabled channel state", async () => {
    render(<Page />);
    expect(await screen.findByText("Publishing is stopped"))
      .toBeInTheDocument();
    expect(screen.getByText(/threads · vrc.ops · publishing disabled/))
      .toBeInTheDocument();
  });
  it("requires every review check before enabling approval", async () => {
    render(<Page />);
    const approve = await screen.findByRole("button", { name: "Approve" });
    expect(approve).toBeDisabled();
    const checks = screen.getAllByRole("checkbox");
    for (const c of checks.slice(0, -1)) fireEvent.click(c);
    expect(approve).toBeDisabled();
    fireEvent.click(checks.at(-1)!);
    expect(approve).toBeEnabled();
    fireEvent.click(approve);
    await waitFor(() => expect(review).toHaveBeenCalled());
    expect(review.mock.calls[0][0]).toBe("post");
    expect(review.mock.calls[0][1]).toBe(true);
    expect(review.mock.calls[0][2]).toEqual({
      facts: true,
      rights: true,
      privacy: true,
      brand: true,
      moderation: true,
    });
  });
  it("permits rejection without approving the content", async () => {
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(review).toHaveBeenCalledWith(
        "post",
        false,
        {},
        dashboard.posts[0].scheduled_at,
      )
    );
  });
  it("stops new submissions immediately through the server", async () => {
    render(<Page />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Stop publishing" }),
    );
    await waitFor(() => expect(stop).toHaveBeenCalledWith("league"));
  });
  it("shows unprovisioned campaigns without generation controls", async () => {
    load.mockResolvedValue({ ...dashboard, campaign: null, posts: [] });
    render(<Page />);
    expect(
      await screen.findByText(
        "Social marketing is not configured for this league",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create weekly drafts" })).not
      .toBeInTheDocument();
  });
});
