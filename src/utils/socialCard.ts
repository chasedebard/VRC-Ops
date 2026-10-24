import type { SocialPost } from "@/services/socialMarketing";

/** Exact original artwork from Extreme. Supporting composition is black/white;
 * customizable UI accents are not an official marketing palette. */
export const SOCIAL_BRAND = {
  version: "vrc-official-artwork-1",
  logo: "vrc-official-logo.png",
  logo_sha256:
    "25142c6bb01b5cbff42a46420151038b3501913c08d6cac4f8f853dd64b9ff18",
  background: "#000000",
  text: "#FFFFFF",
} as const;
let artwork: Promise<ImageBitmap> | undefined;
async function officialArtwork() {
  if (!artwork) {
    artwork = (async () => {
      const result = await fetch(
        `${import.meta.env.BASE_URL}${SOCIAL_BRAND.logo}`,
        { cache: "no-cache" },
      );
      if (!result.ok) {
        throw new Error(
          "The official VRC logo is unavailable. Export is stopped.",
        );
      }
      const bytes = await result.arrayBuffer();
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== SOCIAL_BRAND.logo_sha256) {
        throw new Error(
          "The official VRC logo failed verification. Export is stopped.",
        );
      }
      return createImageBitmap(new Blob([bytes], { type: "image/png" }));
    })().catch((error) => {
      artwork = undefined;
      throw error;
    });
  }
  return artwork;
}
export async function paintSocialCard(
  canvas: HTMLCanvasElement,
  post: SocialPost,
  vertical = false,
) {
  canvas.width = 1080;
  canvas.height = vertical ? 1920 : 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image export is unavailable in this browser.");
  ctx.fillStyle = SOCIAL_BRAND.background;
  ctx.fillRect(0, 0, 1080, canvas.height);
  const logo = await officialArtwork();
  // Preserve the original image's aspect and pixels. Only transparent padding
  // extends beyond the composition; all visible artwork remains inside it.
  ctx.drawImage(logo, -60, -310, 1200, 1200);
  ctx.fillStyle = SOCIAL_BRAND.text;
  let y = 480;
  function lines(text: string, font: string, lineHeight: number) {
    if (!ctx) return;
    ctx.font = font;
    let line = "";
    for (const word of text.split(/\s+/)) {
      const trial = line ? `${line} ${word}` : word;
      if (ctx.measureText(trial).width > 920 && line) {
        ctx.fillText(line, 80, y);
        y += lineHeight;
        line = word;
      } else line = trial;
    }
    if (line) {
      ctx.fillText(line, 80, y);
      y += lineHeight;
    }
  }
  lines(post.title, "600 64px system-ui, sans-serif", 80);
  y += 48;
  lines(
    post.source_kind === "app_feature"
      ? "Calendar. Official results. Championship standings."
      : String(post.facts.title ?? ""),
    "400 42px system-ui, sans-serif",
    58,
  );
  if (post.source_kind !== "app_feature") {
    y += 35;
    lines("RFS League example", "400 30px system-ui, sans-serif", 44);
  }
  ctx.font = "600 38px system-ui, sans-serif";
  ctx.fillText("Discover VRC Ops", 80, canvas.height - 180);
  ctx.font = "400 28px system-ui, sans-serif";
  ctx.fillText("Available on the App Store", 80, canvas.height - 120);
}
export async function socialCardBlob(post: SocialPost, vertical = false) {
  const canvas = document.createElement("canvas");
  await paintSocialCard(canvas, post, vertical);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Image export failed.")),
      "image/png",
    )
  );
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
