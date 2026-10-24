import { webcrypto } from "node:crypto";
import { Buffer } from "node:buffer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SocialPost } from "@/services/socialMarketing";
beforeEach(() => {
  vi.resetModules();
  // Bridge jsdom's ArrayBuffer realm to Node's real SHA-256 implementation.
  vi.stubGlobal("crypto", {
    subtle: {
      digest: (algorithm: string, data: ArrayBuffer) =>
        webcrypto.subtle.digest(algorithm, Buffer.from(new Uint8Array(data))),
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    { fillRect: vi.fn() } as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("cannot export a substitute when the official artwork is missing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("", { status: 404 })),
  );
  const { socialCardBlob } = await import("./socialCard");
  await expect(socialCardBlob({} as SocialPost)).rejects.toThrow(
    "official VRC logo is unavailable",
  );
});
it("cannot export altered logo bytes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("unapproved artwork")),
  );
  const { socialCardBlob } = await import("./socialCard");
  await expect(socialCardBlob({} as SocialPost)).rejects.toThrow(
    "official VRC logo failed verification",
  );
});
