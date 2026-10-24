import type { SocialPost } from "@/services/socialMarketing";
/** Native brand typography and palette; never fetch portraits or third-party media. */
export function paintSocialCard(
  canvas: HTMLCanvasElement,
  post: SocialPost,
  vertical = false,
) {
  canvas.width = 1080;
  canvas.height = vertical ? 1920 : 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image export is unavailable in this browser.");
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, 1080, canvas.height);
  ctx.fillStyle = "#f97316";
  ctx.fillRect(72, 90, 8, 82);
  ctx.font = "700 52px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("VRC OPS", 110, 150);
  ctx.font = "600 25px system-ui, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("RACE WEEK. UNDER CONTROL.", 76, 224);
  let y = 420;
  function lines(
    text: string,
    font: string,
    color: string,
    lineHeight: number,
  ) {
    if (!ctx) return;
    ctx.font = font;
    ctx.fillStyle = color;
    let line = "";
    for (const word of text.split(/\s+/)) {
      const trial = line ? `${line} ${word}` : word;
      if (ctx.measureText(trial).width > 910 && line) {
        ctx.fillText(line, 76, y);
        y += lineHeight;
        line = word;
      } else line = trial;
    }
    if (line) {
      ctx.fillText(line, 76, y);
      y += lineHeight;
    }
  }
  lines(post.title, "700 70px system-ui, sans-serif", "#ffffff", 85);
  y += 55;
  const detail = post.source_kind === "app_feature"
    ? "Calendar. Official results. Championship standings."
    : String(post.facts.title ?? "");
  lines(detail, "500 42px system-ui, sans-serif", "#e6ecf5", 58);
  y += 25;
  if (post.source_kind !== "app_feature") {
    lines(
      "RFS League · powered by VRC Ops",
      "500 28px system-ui, sans-serif",
      "#fb923c",
      44,
    );
  }
  ctx.fillStyle = "#223049";
  ctx.fillRect(76, canvas.height - 250, 928, 2);
  ctx.font = "700 38px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Discover VRC Ops", 76, canvas.height - 170);
  ctx.font = "400 28px system-ui, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Available on the App Store", 76, canvas.height - 112);
}
export async function socialCardBlob(post: SocialPost, vertical = false) {
  const canvas = document.createElement("canvas");
  paintSocialCard(canvas, post, vertical);
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
