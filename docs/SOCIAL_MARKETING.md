# Social marketing admin — staged

The new /admin/social-marketing route is restricted by the existing canManageSetup permission. It consumes the shared Supabase vrc_social_* RPCs and private social-marketing Storage bucket; it does not introduce a web database, points engine or publishing credential.

The backend migration is prepared on chasedebard/vrc-platform, branch codex/social-marketing-approval-first, at supabase/migrations/20261024142853_social_marketing_approval_pipeline.sql. Its documentation and validation receipt are in docs/social-marketing. It has not been applied to production. Deploy this website route after that contract is provisioned and verified; do not merge main as part of this staged change.

Owner/Admin can inspect verified facts, export a branded graphic or edit brief, attach an immutable asset, approve/reject with explicit facts/rights/privacy/brand/moderation review, and stop submissions. Campaign cadence/formats and external-use rights are Owner-only. Asset replacement clears approval. A channel cannot be authorized for publishing in this UI. Publishing remains separately disabled. Switching leagues remounts the review state to avoid retaining another league's drafts or checks.

All driver-facing copy uses the explicit backend aliases; no names or driver images are inferred. Video formats and YouTube require a video asset. The Canvas graphic is a native brand card, not an app screenshot. App demonstrations require actual footage from the user's SSD iPhone 17e. Media export destinations depend on the browser's save settings: choose Extreme, never the default internal Downloads folder, for this user's workflow.

Validation on 2026-10-24: 274 tests across 23 files, lint and production build pass. Six component tests cover restricted access, stopped/unauthorized channels, full approval review, rejection, stopping and unprovisioned campaign. Database/provider integration is validated separately; no live channel was posted to. Existing bundle-size and React Router future warnings remain. The metrics display is a scaffold; automated analytics ingestion and the Free Metricool MCP dispatch/receipt bridge remain future work.

No iOS/Android code was changed. Any later native marketing review/status/stop interface must reuse this shared contract and permissions, with no embedded publishing secrets or duplicate queues.
