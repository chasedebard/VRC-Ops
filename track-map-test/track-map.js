const MAP_FILE = "./kyoto-yamagiwa-miyabi.svg";
const METADATA_FILE = "./kyoto-yamagiwa-miyabi.metadata.json";

const mount = document.getElementById("track-map-mount");
const detailTitle = document.getElementById("detail-title");
const detailList = document.getElementById("detail-list");

let svg = null;
let baseView = null;
let view = null;
let regionById = new Map();
let selectedRegionId = null;
let suppressNextClick = false;
let interactionMoved = false;
let lastPinchDistance = null;
let lastPinchCenter = null;

const activePointers = new Map();
const overlayClass = {
  turns: "hide-turns",
  sectors: "hide-sectors",
  elevation: "hide-elevation",
  braking: "hide-braking",
  start: "hide-start"
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    const { svgText, metadata } = await loadTrackAssets();
    regionById = new Map(metadata.regions.map((region) => [region.id, region]));

    mount.innerHTML = svgText;
    svg = mount.querySelector("svg");
    if (!svg) {
      throw new Error("SVG root was not found.");
    }

    setupViewBox();
    bindControls();
    bindSvgInteractions();
    applyOverlayState();
    renderDetail(null);
  } catch (error) {
    mount.innerHTML = `<div class="loading-state">${error.message}</div>`;
  }
}

async function loadTrackAssets() {
  try {
    const [svgResponse, metadataResponse] = await Promise.all([
      fetch(MAP_FILE),
      fetch(METADATA_FILE)
    ]);

    if (!svgResponse.ok || !metadataResponse.ok) {
      throw new Error("Track map assets did not load.");
    }

    return {
      svgText: await svgResponse.text(),
      metadata: await metadataResponse.json()
    };
  } catch (error) {
    if (EMBEDDED_TRACK_SVG && EMBEDDED_TRACK_METADATA) {
      return {
        svgText: EMBEDDED_TRACK_SVG,
        metadata: EMBEDDED_TRACK_METADATA
      };
    }

    throw error;
  }
}

function setupViewBox() {
  const numbers = svg.getAttribute("viewBox").split(/\s+/).map(Number);
  baseView = {
    x: numbers[0],
    y: numbers[1],
    width: numbers[2],
    height: numbers[3]
  };
  view = { ...baseView };
  setViewBox();
}

function bindControls() {
  document.getElementById("zoom-in").addEventListener("click", () => zoomBy(1.22));
  document.getElementById("zoom-out").addEventListener("click", () => zoomBy(1 / 1.22));
  document.getElementById("reset-view").addEventListener("click", resetView);
  document.getElementById("fit-view").addEventListener("click", fitView);
  document.getElementById("clear-selection").addEventListener("click", clearSelection);

  document.querySelectorAll("[data-overlay]").forEach((input) => {
    input.addEventListener("change", applyOverlayState);
  });

  const handleKeyboardShortcut = (event) => {
    if (event.defaultPrevented) {
      return;
    }

    const tagName = event.target?.tagName || "";
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      clearSelection();
    }

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomBy(1.22);
    }

    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomBy(1 / 1.22);
    }

    if (event.key === "0") {
      event.preventDefault();
      resetView();
    }
  };

  document.addEventListener("keydown", handleKeyboardShortcut);
  window.addEventListener("keydown", handleKeyboardShortcut);
}

function bindSvgInteractions() {
  regionById.forEach((_region, id) => {
    svg.querySelectorAll(regionSelector(id)).forEach((element) => {
      element.classList.add("is-interactive");
    });
  });

  svg.addEventListener("click", (event) => {
    if (suppressNextClick) {
      return;
    }

    const target = event.target.closest("[data-region-id]");
    if (!target || !svg.contains(target)) {
      return;
    }

    const regionId = target.dataset.regionId;
    if (regionById.has(regionId)) {
      setSelectedRegion(regionId);
    }
  });

  svg.addEventListener("pointerover", (event) => {
    if (!window.matchMedia("(hover: hover)").matches) {
      return;
    }

    const target = event.target.closest("[data-region-id]");
    if (target && svg.contains(target)) {
      target.classList.add("hovered");
    }
  });

  svg.addEventListener("pointerout", (event) => {
    const target = event.target.closest("[data-region-id]");
    if (target && svg.contains(target)) {
      target.classList.remove("hovered");
    }
  });

  svg.addEventListener("wheel", (event) => {
    event.preventDefault();
    const multiplier = event.deltaY < 0 ? 1.16 : 1 / 1.16;
    zoomBy(multiplier, { x: event.clientX, y: event.clientY });
  }, { passive: false });

  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", onPointerUp);
  svg.addEventListener("pointercancel", onPointerUp);
}

function applyOverlayState() {
  if (!svg) {
    return;
  }

  document.querySelectorAll("[data-overlay]").forEach((input) => {
    const className = overlayClass[input.dataset.overlay];
    if (className) {
      svg.classList.toggle(className, !input.checked);
    }
  });
}

function onPointerDown(event) {
  if (typeof event.button === "number" && event.button !== 0) {
    return;
  }

  event.preventDefault();
  svg.setPointerCapture(event.pointerId);
  svg.classList.add("is-panning");

  if (activePointers.size === 0) {
    interactionMoved = false;
  }

  activePointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY
  });

  if (activePointers.size === 2) {
    primePinch();
  }
}

function onPointerMove(event) {
  if (!activePointers.has(event.pointerId)) {
    return;
  }

  event.preventDefault();
  const previous = activePointers.get(event.pointerId);
  const next = {
    x: event.clientX,
    y: event.clientY
  };

  activePointers.set(event.pointerId, next);

  if (activePointers.size === 1) {
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    if (Math.hypot(dx, dy) > 1) {
      interactionMoved = true;
      panBy(dx, dy);
    }
    return;
  }

  if (activePointers.size === 2) {
    handlePinch();
  }
}

function onPointerUp(event) {
  if (activePointers.has(event.pointerId)) {
    activePointers.delete(event.pointerId);
  }

  if (svg.hasPointerCapture(event.pointerId)) {
    svg.releasePointerCapture(event.pointerId);
  }

  if (activePointers.size === 0) {
    svg.classList.remove("is-panning");
    lastPinchDistance = null;
    lastPinchCenter = null;
    suppressNextClick = interactionMoved;
    window.setTimeout(() => {
      suppressNextClick = false;
    }, 80);
    return;
  }

  if (activePointers.size === 1) {
    lastPinchDistance = null;
    lastPinchCenter = null;
  }
}

function primePinch() {
  const points = [...activePointers.values()];
  lastPinchDistance = distance(points[0], points[1]);
  lastPinchCenter = midpoint(points[0], points[1]);
}

function handlePinch() {
  const points = [...activePointers.values()];
  const nextDistance = distance(points[0], points[1]);
  const nextCenter = midpoint(points[0], points[1]);

  if (lastPinchDistance && nextDistance > 0) {
    const multiplier = nextDistance / lastPinchDistance;
    zoomBy(multiplier, nextCenter);
  }

  if (lastPinchCenter) {
    panBy(nextCenter.x - lastPinchCenter.x, nextCenter.y - lastPinchCenter.y);
  }

  interactionMoved = true;
  lastPinchDistance = nextDistance;
  lastPinchCenter = nextCenter;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function panBy(pixelDx, pixelDy) {
  const rect = svg.getBoundingClientRect();
  view.x -= pixelDx * (view.width / rect.width);
  view.y -= pixelDy * (view.height / rect.height);
  clampView();
  setViewBox();
}

function zoomBy(multiplier, clientPoint = null) {
  const rect = svg.getBoundingClientRect();
  const point = clientPoint || {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };

  const before = clientToSvgPoint(point);
  const newWidth = clamp(view.width / multiplier, baseView.width / 5.75, baseView.width);
  const newHeight = newWidth * (baseView.height / baseView.width);
  const widthRatio = newWidth / view.width;
  const heightRatio = newHeight / view.height;

  view.x = before.x - (before.x - view.x) * widthRatio;
  view.y = before.y - (before.y - view.y) * heightRatio;
  view.width = newWidth;
  view.height = newHeight;

  clampView();
  setViewBox();
}

function clientToSvgPoint(point) {
  const rect = svg.getBoundingClientRect();
  return {
    x: view.x + ((point.x - rect.left) / rect.width) * view.width,
    y: view.y + ((point.y - rect.top) / rect.height) * view.height
  };
}

function clampView() {
  view.width = clamp(view.width, baseView.width / 5.75, baseView.width);
  view.height = view.width * (baseView.height / baseView.width);
  view.x = clamp(view.x, baseView.x, baseView.x + baseView.width - view.width);
  view.y = clamp(view.y, baseView.y, baseView.y + baseView.height - view.height);
}

function setViewBox() {
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
}

function resetView() {
  view = { ...baseView };
  setViewBox();
}

function fitView() {
  resetView();
}

function setSelectedRegion(regionId) {
  if (selectedRegionId) {
    toggleSelected(selectedRegionId, false);
  }

  selectedRegionId = regionId;
  toggleSelected(regionId, true);
  renderDetail(regionById.get(regionId));
}

function clearSelection() {
  if (selectedRegionId) {
    toggleSelected(selectedRegionId, false);
  }

  selectedRegionId = null;
  renderDetail(null);
}

function toggleSelected(regionId, isSelected) {
  svg.querySelectorAll(regionSelector(regionId)).forEach((element) => {
    element.classList.toggle("is-selected", isSelected);
  });
}

function renderDetail(region) {
  if (!region) {
    detailTitle.textContent = "No region selected";
    detailList.innerHTML = `
      <div>
        <dt>Region type</dt>
        <dd>Tap a marker, sector, zone, or turn label.</dd>
      </div>
      <div>
        <dt>Selected region id</dt>
        <dd class="debug-id">none</dd>
      </div>
    `;
    return;
  }

  detailTitle.textContent = region.title;
  const rows = [
    ["Region type", region.type],
    ["Turn number", region.turnNumber],
    ["Sector", region.sector],
    ["Corner type", region.cornerType],
    ["Elevation note", region.elevation],
    ["Driving note", region.drivingNote],
    ["Racecraft note", region.racecraftNote],
    ["Suggested interaction note", region.uiNote],
    ["Selected region id", region.id, "debug-id"]
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");

  detailList.innerHTML = rows.map(([label, value, className]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd class="${className || ""}">${escapeHtml(String(value))}</dd>
    </div>
  `).join("");
}

function regionSelector(regionId) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return `[data-region-id="${window.CSS.escape(regionId)}"]`;
  }

  return `[data-region-id="${regionId.replace(/"/g, '\\"')}"]`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const EMBEDDED_TRACK_SVG = "<svg id=\"kyoto-map-svg\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1000 800\" role=\"img\" aria-labelledby=\"kyoto-map-title kyoto-map-desc\">\n  <title id=\"kyoto-map-title\">Kyoto Driving Park Yamagiwa plus Miyabi circuit map</title>\n  <desc id=\"kyoto-map-desc\">Clean vector circuit map with interactive sectors, turns, braking zones, elevation zones, speed zones, and start finish marker.</desc>\n  <style>\n    #kyoto-map-svg {\n      --map: #f5f7f4;\n      --track: #101217;\n      --muted: #7d8792;\n      --selected: #ff7a1a;\n      --sector-1: #2dd4bf;\n      --sector-2: #8b5cf6;\n      --sector-3: #22c55e;\n      --brake: #ef4444;\n      --elevation: #0ea5e9;\n      background: var(--map);\n    }\n\n    .track-shadow {\n      fill: none;\n      stroke: rgba(15, 23, 42, 0.16);\n      stroke-width: 36;\n      stroke-linecap: round;\n      stroke-linejoin: round;\n    }\n\n    .track-line {\n      fill: none;\n      stroke: var(--track);\n      stroke-width: 22;\n      stroke-linecap: round;\n      stroke-linejoin: round;\n    }\n\n    .track-inner {\n      fill: none;\n      stroke: #fefefe;\n      stroke-width: 8;\n      stroke-linecap: round;\n      stroke-linejoin: round;\n      opacity: 0.16;\n    }\n\n    .track-hit {\n      fill: none;\n      stroke: transparent;\n      stroke-width: 72;\n      stroke-linecap: round;\n      stroke-linejoin: round;\n      pointer-events: stroke;\n    }\n\n    .sector-path {\n      fill: none;\n      stroke-width: 10;\n      stroke-linecap: round;\n      stroke-linejoin: round;\n      opacity: 0.68;\n      pointer-events: stroke;\n    }\n\n    .sector-one {\n      stroke: var(--sector-1);\n    }\n\n    .sector-two {\n      stroke: var(--sector-2);\n    }\n\n    .sector-three {\n      stroke: var(--sector-3);\n    }\n\n    .zone-region {\n      opacity: 0.72;\n      pointer-events: stroke;\n    }\n\n    .zone-line {\n      fill: none;\n      stroke-linecap: round;\n      stroke-linejoin: round;\n    }\n\n    .braking-zone .zone-line {\n      stroke: var(--brake);\n      stroke-width: 10;\n      stroke-dasharray: 2 22;\n    }\n\n    .elevation-zone .zone-line {\n      stroke: var(--elevation);\n      stroke-width: 12;\n      stroke-dasharray: 18 14;\n    }\n\n    .speed-zone .zone-line {\n      stroke: var(--sector-1);\n      stroke-width: 7;\n      opacity: 0.82;\n    }\n\n    .turn-dot,\n    .marker-core {\n      fill: #ffffff;\n      stroke: var(--track);\n      stroke-width: 3;\n    }\n\n    .turn-text,\n    .marker-text,\n    .sector-text {\n      fill: var(--track);\n      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;\n      font-weight: 800;\n      text-anchor: middle;\n      dominant-baseline: middle;\n      pointer-events: none;\n    }\n\n    .turn-text {\n      font-size: 20px;\n    }\n\n    .marker-text {\n      font-size: 18px;\n    }\n\n    .sector-pill {\n      fill: rgba(255, 255, 255, 0.86);\n      stroke: rgba(17, 24, 39, 0.18);\n      stroke-width: 1.5;\n    }\n\n    .sector-text {\n      font-size: 18px;\n    }\n\n    .apex {\n      fill: #ffffff;\n      stroke: var(--selected);\n      stroke-width: 3;\n      opacity: 0.88;\n    }\n\n    .sf-line {\n      stroke: #ffffff;\n      stroke-width: 24;\n      stroke-linecap: round;\n    }\n\n    .sf-line-dark {\n      stroke: var(--track);\n      stroke-width: 5;\n      stroke-linecap: round;\n    }\n  </style>\n  <rect x=\"12\" y=\"12\" width=\"976\" height=\"776\" rx=\"28\" fill=\"var(--map)\"/>\n\n  <g id=\"elevation-overlay\">\n    <g id=\"elevation-zone-1\" class=\"zone-region elevation-zone\" data-region-id=\"elevation-zone-1\">\n      <path class=\"zone-line\" d=\"M 770 136 C 712 134 652 126 590 111\"/>\n    </g>\n    <g id=\"elevation-zone-2\" class=\"zone-region elevation-zone\" data-region-id=\"elevation-zone-2\">\n      <path class=\"zone-line\" d=\"M 125 233 C 182 283 247 365 309 475\"/>\n    </g>\n    <g id=\"elevation-zone-3\" class=\"zone-region elevation-zone\" data-region-id=\"elevation-zone-3\">\n      <path class=\"zone-line\" d=\"M 260 608 C 298 662 346 690 405 642\"/>\n    </g>\n    <g id=\"elevation-zone-4\" class=\"zone-region elevation-zone\" data-region-id=\"elevation-zone-4\">\n      <path class=\"zone-line\" d=\"M 595 576 C 662 613 668 676 628 717\"/>\n    </g>\n    <g id=\"elevation-zone-5\" class=\"zone-region elevation-zone\" data-region-id=\"elevation-zone-5\">\n      <path class=\"zone-line\" d=\"M 667 267 C 675 312 705 356 793 380\"/>\n    </g>\n  </g>\n\n  <g id=\"sector-overlay\">\n    <g id=\"sector-1\" class=\"sector-region\" data-region-id=\"sector-1\">\n      <path class=\"sector-path sector-one\" d=\"M 850 120 C 790 125 720 124 650 124 C 616 124 596 117 586 105 C 574 90 548 91 535 108 C 520 128 498 131 470 118 C 440 105 402 105 360 112 C 300 120 205 100 135 115 C 75 128 48 178 70 220 C 88 255 140 275 185 315 C 235 360 275 430 318 493\"/>\n    </g>\n    <g id=\"sector-2\" class=\"sector-region\" data-region-id=\"sector-2\">\n      <path class=\"sector-path sector-two\" d=\"M 318 493 C 335 518 317 540 290 522 C 267 506 246 505 232 523 C 216 544 228 574 253 612 C 280 653 305 682 340 674 C 365 668 377 626 410 642 C 450 662 474 712 518 748 C 555 778 615 748 635 700 C 660 639 613 594 558 562\"/>\n    </g>\n    <g id=\"sector-3\" class=\"sector-region\" data-region-id=\"sector-3\">\n      <path class=\"sector-path sector-three\" d=\"M 558 562 L 440 494 C 415 480 417 450 445 440 C 470 431 488 460 520 460 C 560 460 590 430 635 412 C 685 393 745 407 805 422 C 845 432 868 435 872 415 C 875 398 850 392 808 383 C 748 370 710 355 690 330 C 672 308 674 279 656 268 C 645 262 605 265 565 265 L 420 262 C 370 260 350 237 358 208 C 366 181 395 176 440 178 L 810 180 C 866 180 903 165 914 133 C 927 95 895 82 850 120\"/>\n    </g>\n  </g>\n\n  <g id=\"track-base\">\n    <path id=\"track-hit-area\" class=\"track-hit\" d=\"M 850 120 C 790 125 720 124 650 124 C 616 124 596 117 586 105 C 574 90 548 91 535 108 C 520 128 498 131 470 118 C 440 105 402 105 360 112 C 300 120 205 100 135 115 C 75 128 48 178 70 220 C 88 255 140 275 185 315 C 235 360 275 430 318 493 C 335 518 317 540 290 522 C 267 506 246 505 232 523 C 216 544 228 574 253 612 C 280 653 305 682 340 674 C 365 668 377 626 410 642 C 450 662 474 712 518 748 C 555 778 615 748 635 700 C 660 639 613 594 558 562 L 440 494 C 415 480 417 450 445 440 C 470 431 488 460 520 460 C 560 460 590 430 635 412 C 685 393 745 407 805 422 C 845 432 868 435 872 415 C 875 398 850 392 808 383 C 748 370 710 355 690 330 C 672 308 674 279 656 268 C 645 262 605 265 565 265 L 420 262 C 370 260 350 237 358 208 C 366 181 395 176 440 178 L 810 180 C 866 180 903 165 914 133 C 927 95 895 82 850 120 Z\"/>\n    <path class=\"track-shadow\" d=\"M 850 120 C 790 125 720 124 650 124 C 616 124 596 117 586 105 C 574 90 548 91 535 108 C 520 128 498 131 470 118 C 440 105 402 105 360 112 C 300 120 205 100 135 115 C 75 128 48 178 70 220 C 88 255 140 275 185 315 C 235 360 275 430 318 493 C 335 518 317 540 290 522 C 267 506 246 505 232 523 C 216 544 228 574 253 612 C 280 653 305 682 340 674 C 365 668 377 626 410 642 C 450 662 474 712 518 748 C 555 778 615 748 635 700 C 660 639 613 594 558 562 L 440 494 C 415 480 417 450 445 440 C 470 431 488 460 520 460 C 560 460 590 430 635 412 C 685 393 745 407 805 422 C 845 432 868 435 872 415 C 875 398 850 392 808 383 C 748 370 710 355 690 330 C 672 308 674 279 656 268 C 645 262 605 265 565 265 L 420 262 C 370 260 350 237 358 208 C 366 181 395 176 440 178 L 810 180 C 866 180 903 165 914 133 C 927 95 895 82 850 120 Z\"/>\n    <path id=\"track-visible\" class=\"track-line\" d=\"M 850 120 C 790 125 720 124 650 124 C 616 124 596 117 586 105 C 574 90 548 91 535 108 C 520 128 498 131 470 118 C 440 105 402 105 360 112 C 300 120 205 100 135 115 C 75 128 48 178 70 220 C 88 255 140 275 185 315 C 235 360 275 430 318 493 C 335 518 317 540 290 522 C 267 506 246 505 232 523 C 216 544 228 574 253 612 C 280 653 305 682 340 674 C 365 668 377 626 410 642 C 450 662 474 712 518 748 C 555 778 615 748 635 700 C 660 639 613 594 558 562 L 440 494 C 415 480 417 450 445 440 C 470 431 488 460 520 460 C 560 460 590 430 635 412 C 685 393 745 407 805 422 C 845 432 868 435 872 415 C 875 398 850 392 808 383 C 748 370 710 355 690 330 C 672 308 674 279 656 268 C 645 262 605 265 565 265 L 420 262 C 370 260 350 237 358 208 C 366 181 395 176 440 178 L 810 180 C 866 180 903 165 914 133 C 927 95 895 82 850 120 Z\"/>\n    <path class=\"track-inner\" d=\"M 850 120 C 790 125 720 124 650 124 C 616 124 596 117 586 105 C 574 90 548 91 535 108 C 520 128 498 131 470 118 C 440 105 402 105 360 112 C 300 120 205 100 135 115 C 75 128 48 178 70 220 C 88 255 140 275 185 315 C 235 360 275 430 318 493 C 335 518 317 540 290 522 C 267 506 246 505 232 523 C 216 544 228 574 253 612 C 280 653 305 682 340 674 C 365 668 377 626 410 642 C 450 662 474 712 518 748 C 555 778 615 748 635 700 C 660 639 613 594 558 562 L 440 494 C 415 480 417 450 445 440 C 470 431 488 460 520 460 C 560 460 590 430 635 412 C 685 393 745 407 805 422 C 845 432 868 435 872 415 C 875 398 850 392 808 383 C 748 370 710 355 690 330 C 672 308 674 279 656 268 C 645 262 605 265 565 265 L 420 262 C 370 260 350 237 358 208 C 366 181 395 176 440 178 L 810 180 C 866 180 903 165 914 133 C 927 95 895 82 850 120 Z\"/>\n  </g>\n\n  <g id=\"braking-overlay\">\n    <g id=\"braking-zone-1\" class=\"zone-region braking-zone\" data-region-id=\"braking-zone-1\">\n      <path class=\"zone-line\" d=\"M 575 179 L 805 180\"/>\n    </g>\n    <g id=\"braking-zone-2\" class=\"zone-region braking-zone\" data-region-id=\"braking-zone-2\">\n      <path class=\"zone-line\" d=\"M 260 396 C 280 430 299 462 318 493\"/>\n    </g>\n    <g id=\"braking-zone-3\" class=\"zone-region braking-zone\" data-region-id=\"braking-zone-3\">\n      <path class=\"zone-line\" d=\"M 605 598 C 642 637 651 673 635 700\"/>\n    </g>\n    <g id=\"braking-zone-4\" class=\"zone-region braking-zone\" data-region-id=\"braking-zone-4\">\n      <path class=\"zone-line\" d=\"M 805 422 C 845 432 868 435 872 415\"/>\n    </g>\n    <g id=\"braking-zone-5\" class=\"zone-region braking-zone\" data-region-id=\"braking-zone-5\">\n      <path class=\"zone-line\" d=\"M 505 264 L 430 262\"/>\n    </g>\n  </g>\n\n  <g id=\"speed-overlay\">\n    <g id=\"speed-zone-1\" class=\"zone-region speed-zone\" data-region-id=\"speed-zone-1\">\n      <path class=\"zone-line\" d=\"M 420 178 L 570 179\"/>\n    </g>\n    <g id=\"speed-zone-2\" class=\"zone-region speed-zone\" data-region-id=\"speed-zone-2\">\n      <path class=\"zone-line\" d=\"M 410 642 C 457 671 485 724 528 750\"/>\n    </g>\n    <g id=\"speed-zone-3\" class=\"zone-region speed-zone\" data-region-id=\"speed-zone-3\">\n      <path class=\"zone-line\" d=\"M 420 262 C 520 265 608 266 656 268\"/>\n    </g>\n  </g>\n\n  <g id=\"start-finish\" class=\"start-finish-marker\" data-region-id=\"start-finish\">\n    <line class=\"sf-line\" x1=\"625\" y1=\"154\" x2=\"625\" y2=\"204\"/>\n    <line class=\"sf-line-dark\" x1=\"625\" y1=\"154\" x2=\"625\" y2=\"204\"/>\n    <circle class=\"marker-core\" cx=\"625\" cy=\"132\" r=\"24\"/>\n    <text class=\"marker-text\" x=\"625\" y=\"132\">S/F</text>\n  </g>\n\n  <g id=\"apex-markers\" aria-hidden=\"true\">\n    <circle class=\"apex\" cx=\"914\" cy=\"137\" r=\"6\"/>\n    <circle class=\"apex\" cx=\"535\" cy=\"108\" r=\"6\"/>\n    <circle class=\"apex\" cx=\"72\" cy=\"216\" r=\"6\"/>\n    <circle class=\"apex\" cx=\"315\" cy=\"503\" r=\"6\"/>\n    <circle class=\"apex\" cx=\"236\" cy=\"529\" r=\"6\"/>\n    <circle class=\"apex\" cx=\"339\" cy=\"675\" r=\"6\"/>\n    <circle class=\"apex\" cx=\"633\" cy=\"704\" r=\"6\"/>\n    <circle class=\"apex\" cx=\"451\" cy=\"440\" r=\"6\"/>\n    <circle class=\"apex\" cx=\"872\" cy=\"414\" r=\"6\"/>\n    <circle class=\"apex\" cx=\"359\" cy=\"210\" r=\"6\"/>\n  </g>\n\n  <g id=\"sector-labels\">\n    <g>\n      <rect class=\"sector-pill\" x=\"175\" y=\"72\" width=\"92\" height=\"34\" rx=\"17\"/>\n      <text class=\"sector-text\" x=\"221\" y=\"89\">Sector 1</text>\n    </g>\n    <g>\n      <rect class=\"sector-pill\" x=\"386\" y=\"683\" width=\"92\" height=\"34\" rx=\"17\"/>\n      <text class=\"sector-text\" x=\"432\" y=\"700\">Sector 2</text>\n    </g>\n    <g>\n      <rect class=\"sector-pill\" x=\"682\" y=\"226\" width=\"92\" height=\"34\" rx=\"17\"/>\n      <text class=\"sector-text\" x=\"728\" y=\"243\">Sector 3</text>\n    </g>\n  </g>\n\n  <g id=\"turn-labels\">\n    <g id=\"turn-1\" class=\"turn-label\" data-region-id=\"turn-1\" transform=\"translate(862 198)\">\n      <circle class=\"turn-dot\" r=\"20\"/>\n      <text class=\"turn-text\" y=\"1\">1</text>\n    </g>\n    <g id=\"turn-2\" class=\"turn-label\" data-region-id=\"turn-2\" transform=\"translate(925 128)\">\n      <circle class=\"turn-dot\" r=\"20\"/>\n      <text class=\"turn-text\" y=\"1\">2</text>\n    </g>\n    <g id=\"turn-3\" class=\"turn-label\" data-region-id=\"turn-3\" transform=\"translate(586 78)\">\n      <circle class=\"turn-dot\" r=\"20\"/>\n      <text class=\"turn-text\" y=\"1\">3</text>\n    </g>\n    <g id=\"turn-4\" class=\"turn-label\" data-region-id=\"turn-4\" transform=\"translate(518 145)\">\n      <circle class=\"turn-dot\" r=\"20\"/>\n      <text class=\"turn-text\" y=\"1\">4</text>\n    </g>\n    <g id=\"turn-5\" class=\"turn-label\" data-region-id=\"turn-5\" transform=\"translate(334 88)\">\n      <circle class=\"turn-dot\" r=\"20\"/>\n      <text class=\"turn-text\" y=\"1\">5</text>\n    </g>\n    <g id=\"turn-6\" class=\"turn-label\" data-region-id=\"turn-6\" transform=\"translate(78 162)\">\n      <circle class=\"turn-dot\" r=\"20\"/>\n      <text class=\"turn-text\" y=\"1\">6</text>\n    </g>\n    <g id=\"turn-7\" class=\"turn-label\" data-region-id=\"turn-7\" transform=\"translate(144 283)\">\n      <circle class=\"turn-dot\" r=\"20\"/>\n      <text class=\"turn-text\" y=\"1\">7</text>\n    </g>\n    <g id=\"turn-8\" class=\"turn-label\" data-region-id=\"turn-8\" transform=\"translate(276 424)\">\n      <circle class=\"turn-dot\" r=\"20\"/>\n      <text class=\"turn-text\" y=\"1\">8</text>\n    </g>\n    <g id=\"turn-9\" class=\"turn-label\" data-region-id=\"turn-9\" transform=\"translate(330 525)\">\n      <circle class=\"turn-dot\" r=\"20\"/>\n      <text class=\"turn-text\" y=\"1\">9</text>\n    </g>\n    <g id=\"turn-10\" class=\"turn-label\" data-region-id=\"turn-10\" transform=\"translate(226 506)\">\n      <circle class=\"turn-dot\" r=\"22\"/>\n      <text class=\"turn-text\" y=\"1\">10</text>\n    </g>\n    <g id=\"turn-11\" class=\"turn-label\" data-region-id=\"turn-11\" transform=\"translate(257 630)\">\n      <circle class=\"turn-dot\" r=\"22\"/>\n      <text class=\"turn-text\" y=\"1\">11</text>\n    </g>\n    <g id=\"turn-12\" class=\"turn-label\" data-region-id=\"turn-12\" transform=\"translate(390 614)\">\n      <circle class=\"turn-dot\" r=\"22\"/>\n      <text class=\"turn-text\" y=\"1\">12</text>\n    </g>\n    <g id=\"turn-13\" class=\"turn-label\" data-region-id=\"turn-13\" transform=\"translate(625 734)\">\n      <circle class=\"turn-dot\" r=\"22\"/>\n      <text class=\"turn-text\" y=\"1\">13</text>\n    </g>\n    <g id=\"turn-14\" class=\"turn-label\" data-region-id=\"turn-14\" transform=\"translate(577 590)\">\n      <circle class=\"turn-dot\" r=\"22\"/>\n      <text class=\"turn-text\" y=\"1\">14</text>\n    </g>\n    <g id=\"turn-15\" class=\"turn-label\" data-region-id=\"turn-15\" transform=\"translate(438 462)\">\n      <circle class=\"turn-dot\" r=\"22\"/>\n      <text class=\"turn-text\" y=\"1\">15</text>\n    </g>\n    <g id=\"turn-16\" class=\"turn-label\" data-region-id=\"turn-16\" transform=\"translate(637 388)\">\n      <circle class=\"turn-dot\" r=\"22\"/>\n      <text class=\"turn-text\" y=\"1\">16</text>\n    </g>\n    <g id=\"turn-17\" class=\"turn-label\" data-region-id=\"turn-17\" transform=\"translate(858 388)\">\n      <circle class=\"turn-dot\" r=\"22\"/>\n      <text class=\"turn-text\" y=\"1\">17</text>\n    </g>\n    <g id=\"turn-18\" class=\"turn-label\" data-region-id=\"turn-18\" transform=\"translate(681 294)\">\n      <circle class=\"turn-dot\" r=\"22\"/>\n      <text class=\"turn-text\" y=\"1\">18</text>\n    </g>\n    <g id=\"turn-19\" class=\"turn-label\" data-region-id=\"turn-19\" transform=\"translate(368 235)\">\n      <circle class=\"turn-dot\" r=\"22\"/>\n      <text class=\"turn-text\" y=\"1\">19</text>\n    </g>\n  </g>\n</svg>";
const EMBEDDED_TRACK_METADATA = JSON.parse("{\n  \"trackId\": \"kyoto-yamagiwa-miyabi\",\n  \"name\": \"Kyoto Driving Park \\u2013 Yamagiwa + Miyabi\",\n  \"lengthKm\": 6.846,\n  \"turns\": 19,\n  \"elevationDifferenceM\": 38.6,\n  \"layoutOrigin\": \"Hybrid of Yamagiwa main course and Miyabi short course\",\n  \"version\": \"0.1.0\",\n  \"mapFile\": \"kyoto-yamagiwa-miyabi.svg\",\n  \"regions\": [\n    {\n      \"id\": \"start-finish\",\n      \"type\": \"marker\",\n      \"title\": \"Start/Finish\",\n      \"sector\": 1,\n      \"cornerType\": \"timing line on inner upper straight\",\n      \"elevation\": \"Relative elevation inferred from POV; replace with telemetry if available.\",\n      \"drivingNote\": \"Cross the line on the inner upper straight, then prepare immediately for the braking phase into the right-hand bulb.\",\n      \"racecraftNote\": \"Start-line overlap matters because the first braking reference arrives on the same inner straight before Turn 1.\",\n      \"uiNote\": \"Show lap timing, start procedure notes, and pit-wall race control context.\"\n    },\n    {\n      \"id\": \"sector-1\",\n      \"type\": \"sector\",\n      \"title\": \"Sector 1\",\n      \"sector\": 1,\n      \"cornerType\": \"fast opening rhythm\",\n      \"elevation\": \"Opening section trends across the high Yamagiwa-style ridge before dropping toward the connector.\",\n      \"drivingNote\": \"Prioritize minimum steering and early throttle through the upper sequence.\",\n      \"racecraftNote\": \"Side-by-side racing is possible only if both cars commit before the downhill approach.\",\n      \"uiNote\": \"Use this selection to summarize opening pace, split loss, and early-lap risk.\"\n    },\n    {\n      \"id\": \"sector-2\",\n      \"type\": \"sector\",\n      \"title\": \"Sector 2\",\n      \"sector\": 2,\n      \"cornerType\": \"technical transition\",\n      \"elevation\": \"Relative elevation inferred from POV; the route compresses and rotates through the connector.\",\n      \"drivingNote\": \"Sacrifice entry speed where needed so the lower loop can be straightened on exit.\",\n      \"racecraftNote\": \"This sector is incident-prone because cars arrive from different slip angles and closing speeds.\",\n      \"uiNote\": \"Show connector warnings, rotation notes, and mid-lap consistency data.\"\n    },\n    {\n      \"id\": \"sector-3\",\n      \"type\": \"sector\",\n      \"title\": \"Sector 3\",\n      \"sector\": 3,\n      \"cornerType\": \"return loop and acceleration zone\",\n      \"elevation\": \"Lower Miyabi-style loop returns toward the inner straight and final upper complex.\",\n      \"drivingNote\": \"Build exit speed first, then place the car cleanly for the long inner run.\",\n      \"racecraftNote\": \"Defensive lines here can compromise the final straight and invite a late move.\",\n      \"uiNote\": \"Use this selection to compare lower-loop exits and final-sector attack opportunities.\"\n    },\n    {\n      \"id\": \"turn-1\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 1\",\n      \"turnNumber\": 1,\n      \"sector\": 1,\n      \"cornerType\": \"right-hand bulb entry\",\n      \"elevation\": \"Relative elevation inferred from POV; entry appears near the upper ridge.\",\n      \"drivingNote\": \"Brake on the inner straight and rotate into the right-hand bulb without running wide.\",\n      \"racecraftNote\": \"Opening-lap overlap is decided before turn-in because the braking zone is short and direct.\",\n      \"uiNote\": \"Highlight as the first braking and rotation point after the timing line.\"\n    },\n    {\n      \"id\": \"turn-2\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 2\",\n      \"turnNumber\": 2,\n      \"sector\": 1,\n      \"cornerType\": \"outer return from opening bulb\",\n      \"elevation\": \"Relative elevation inferred from POV; still on the upper section.\",\n      \"drivingNote\": \"Finish the opening bulb and release the car onto the outer top run.\",\n      \"racecraftNote\": \"A driver defending too tightly at Turn 1 loses the exit that carries through Turn 2.\",\n      \"uiNote\": \"Show paired T1/T2 rhythm guidance with Turn 2 as the exit/return marker.\"\n    },\n    {\n      \"id\": \"turn-3\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 3\",\n      \"turnNumber\": 3,\n      \"sector\": 1,\n      \"cornerType\": \"cresting kink\",\n      \"elevation\": \"High-point behavior inferred from the minimap and POV climb cue.\",\n      \"drivingNote\": \"Keep steering inputs small; the car should breathe across the crest rather than be forced.\",\n      \"racecraftNote\": \"Dirty air can make the car drift wide if the entry is rushed.\",\n      \"uiNote\": \"Mark as a stability and confidence corner.\"\n    },\n    {\n      \"id\": \"turn-4\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 4\",\n      \"turnNumber\": 4,\n      \"sector\": 1,\n      \"cornerType\": \"quick direction change\",\n      \"elevation\": \"Relative elevation inferred from POV; replace with telemetry if available.\",\n      \"drivingNote\": \"Aim for a clean lift and early unwind to preserve speed toward the left-side drop.\",\n      \"racecraftNote\": \"The following run rewards the driver who exits with the steering straight first.\",\n      \"uiNote\": \"Pair this with T3 as the upper S-section.\"\n    },\n    {\n      \"id\": \"turn-5\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 5\",\n      \"turnNumber\": 5,\n      \"sector\": 1,\n      \"cornerType\": \"long upper sweeper\",\n      \"elevation\": \"The line begins to fall away toward the outside of the Yamagiwa-style section.\",\n      \"drivingNote\": \"Carry speed but keep a margin for the downhill braking reference that follows.\",\n      \"racecraftNote\": \"A wide exit can open the door into the next braking zone.\",\n      \"uiNote\": \"Show as the final high-speed corner before the descent.\"\n    },\n    {\n      \"id\": \"turn-6\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 6\",\n      \"turnNumber\": 6,\n      \"sector\": 1,\n      \"cornerType\": \"downhill left\",\n      \"elevation\": \"Relative elevation inferred from POV; downhill transition begins here.\",\n      \"drivingNote\": \"Brake in a straight line and avoid carrying too much speed to the outside curb.\",\n      \"racecraftNote\": \"This is a pressure point for late lunges after a strong upper-sector run.\",\n      \"uiNote\": \"Use as a braking-confidence region.\"\n    },\n    {\n      \"id\": \"turn-7\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 7\",\n      \"turnNumber\": 7,\n      \"sector\": 1,\n      \"cornerType\": \"descending connector bend\",\n      \"elevation\": \"The car continues dropping toward the technical middle section.\",\n      \"drivingNote\": \"Let the car run without scrubbing speed; the next braking zone is more important.\",\n      \"racecraftNote\": \"Following cars can close quickly if the lead car over-slows the connector.\",\n      \"uiNote\": \"Show as a flow corner, not a primary overtaking point.\"\n    },\n    {\n      \"id\": \"turn-8\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 8\",\n      \"turnNumber\": 8,\n      \"sector\": 1,\n      \"cornerType\": \"heavy approach bend\",\n      \"elevation\": \"Relative elevation inferred from POV; transition load builds on approach.\",\n      \"drivingNote\": \"Prepare for the chicane by straightening the car before final brake pressure.\",\n      \"racecraftNote\": \"A driver who misses the brake marker here blocks the connector exit.\",\n      \"uiNote\": \"Mark as the Sector 1 braking handoff.\"\n    },\n    {\n      \"id\": \"turn-9\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 9\",\n      \"turnNumber\": 9,\n      \"sector\": 2,\n      \"cornerType\": \"connector entry\",\n      \"elevation\": \"Relative elevation inferred from POV; compression point before the lower loop.\",\n      \"drivingNote\": \"Trail brake gently and keep the first apex tidy so the quick change is available.\",\n      \"racecraftNote\": \"Over-rotation here creates a chain reaction into T10.\",\n      \"uiNote\": \"Show connector entry stability notes.\"\n    },\n    {\n      \"id\": \"turn-10\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 10\",\n      \"turnNumber\": 10,\n      \"sector\": 2,\n      \"cornerType\": \"short switchback\",\n      \"elevation\": \"Relative elevation inferred from POV; low-speed balance region.\",\n      \"drivingNote\": \"Prioritize rotation and avoid taking curb that unsettles the car.\",\n      \"racecraftNote\": \"Side-by-side overlap should usually be yielded before the lower loop entry.\",\n      \"uiNote\": \"Use as the first technical-detail drill-down.\"\n    },\n    {\n      \"id\": \"turn-11\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 11\",\n      \"turnNumber\": 11,\n      \"sector\": 2,\n      \"cornerType\": \"lower-loop left\",\n      \"elevation\": \"Relative elevation inferred from POV; lower Miyabi-style portion.\",\n      \"drivingNote\": \"Get the car rotated early and prepare for a patient throttle pickup.\",\n      \"racecraftNote\": \"The inside line is defensive but costly for the run through T12.\",\n      \"uiNote\": \"Show lower-loop entry and rotation notes.\"\n    },\n    {\n      \"id\": \"turn-12\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 12\",\n      \"turnNumber\": 12,\n      \"sector\": 2,\n      \"cornerType\": \"short balance kink\",\n      \"elevation\": \"Relative elevation inferred from POV; replace with telemetry if available.\",\n      \"drivingNote\": \"Use the road width without opening the steering too slowly.\",\n      \"racecraftNote\": \"A small exit mistake here carries into the lower hairpin setup.\",\n      \"uiNote\": \"Highlight as a setup corner.\"\n    },\n    {\n      \"id\": \"turn-13\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 13\",\n      \"turnNumber\": 13,\n      \"sector\": 2,\n      \"cornerType\": \"lower hairpin\",\n      \"elevation\": \"Low-point behavior inferred from the map and POV; exact profile pending telemetry.\",\n      \"drivingNote\": \"Brake square, rotate late, and prioritize the longest possible exit.\",\n      \"racecraftNote\": \"This is the strongest passing zone in the lower loop if overlap is established early.\",\n      \"uiNote\": \"Show as a major braking and overtaking marker.\"\n    },\n    {\n      \"id\": \"turn-14\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 14\",\n      \"turnNumber\": 14,\n      \"sector\": 3,\n      \"cornerType\": \"return bend\",\n      \"elevation\": \"Relative elevation inferred from POV; the car begins climbing back toward the inner connector.\",\n      \"drivingNote\": \"Avoid wheelspin and open the exit to start building speed.\",\n      \"racecraftNote\": \"A poor launch here exposes the driver through the next acceleration zone.\",\n      \"uiNote\": \"Pair with speed-zone-2 for exit analysis.\"\n    },\n    {\n      \"id\": \"turn-15\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 15\",\n      \"turnNumber\": 15,\n      \"sector\": 3,\n      \"cornerType\": \"medium right transition\",\n      \"elevation\": \"Relative elevation inferred from POV; return path transitions back toward the upper course.\",\n      \"drivingNote\": \"Let the car breathe at apex and keep a clean exit to the right-side sweep.\",\n      \"racecraftNote\": \"The best attack is usually a better exit rather than a late dive.\",\n      \"uiNote\": \"Show as the transition from lower loop to return complex.\"\n    },\n    {\n      \"id\": \"turn-16\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 16\",\n      \"turnNumber\": 16,\n      \"sector\": 3,\n      \"cornerType\": \"fast right sweep\",\n      \"elevation\": \"Relative elevation inferred from POV; line loads laterally as it climbs.\",\n      \"drivingNote\": \"Commit early and do not over-correct mid-corner.\",\n      \"racecraftNote\": \"Dirty air and tire wear show up here as mid-corner understeer.\",\n      \"uiNote\": \"Use as a high-speed stability marker.\"\n    },\n    {\n      \"id\": \"turn-17\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 17\",\n      \"turnNumber\": 17,\n      \"sector\": 3,\n      \"cornerType\": \"outer right hook\",\n      \"elevation\": \"Relative elevation inferred from POV; replace with telemetry if available.\",\n      \"drivingNote\": \"Clip the late apex and avoid drifting beyond the exit curb.\",\n      \"racecraftNote\": \"A driver can defend here but risks losing the final straight.\",\n      \"uiNote\": \"Show as the final outside hook before the upper return.\"\n    },\n    {\n      \"id\": \"turn-18\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 18\",\n      \"turnNumber\": 18,\n      \"sector\": 3,\n      \"cornerType\": \"inner connector kink\",\n      \"elevation\": \"Relative elevation inferred from POV; short load change on the inner return.\",\n      \"drivingNote\": \"Straighten the car quickly and focus on exit speed through the inner straight.\",\n      \"racecraftNote\": \"Mistakes here create a run for the timing line rather than an immediate pass.\",\n      \"uiNote\": \"Show final-sector flow and speed preservation.\"\n    },\n    {\n      \"id\": \"turn-19\",\n      \"type\": \"corner\",\n      \"title\": \"Turn 19\",\n      \"turnNumber\": 19,\n      \"sector\": 3,\n      \"cornerType\": \"final inner bend\",\n      \"elevation\": \"Relative elevation inferred from POV; final climb toward the main straight.\",\n      \"drivingNote\": \"Release the brake early and place the car for full throttle back to the line.\",\n      \"racecraftNote\": \"The exit decides whether an attack is available into the next lap.\",\n      \"uiNote\": \"Show as the final exit and lap-completion region.\"\n    },\n    {\n      \"id\": \"braking-zone-1\",\n      \"type\": \"braking zone\",\n      \"title\": \"Braking Zone 1\",\n      \"sector\": 1,\n      \"cornerType\": \"inner-straight brake into Turn 1\",\n      \"elevation\": \"Relative elevation inferred from POV; upper straight braking load.\",\n      \"drivingNote\": \"Brake on the inner upper straight after the timing line and before the right-hand bulb.\",\n      \"racecraftNote\": \"Opening-lap incidents are likely if the inside car cannot slow before the Turn 1 rotation point.\",\n      \"uiNote\": \"Display braking reference, brake pressure notes, and incident-risk warning.\"\n    },\n    {\n      \"id\": \"braking-zone-2\",\n      \"type\": \"braking zone\",\n      \"title\": \"Braking Zone 2\",\n      \"sector\": 1,\n      \"cornerType\": \"downhill connector braking\",\n      \"elevation\": \"Dropping approach inferred from the Yamagiwa-style descent.\",\n      \"drivingNote\": \"Brake earlier than the visual speed suggests; the car is loaded and pointed downhill.\",\n      \"racecraftNote\": \"Common overshoot location when following closely.\",\n      \"uiNote\": \"Show as a major braking risk and Sector 1 handoff.\"\n    },\n    {\n      \"id\": \"braking-zone-3\",\n      \"type\": \"braking zone\",\n      \"title\": \"Braking Zone 3\",\n      \"sector\": 2,\n      \"cornerType\": \"lower hairpin braking\",\n      \"elevation\": \"Low-loop braking reference inferred from the track map.\",\n      \"drivingNote\": \"Brake straight and hold enough rotation for a clean T13 exit.\",\n      \"racecraftNote\": \"Primary lower-loop passing point.\",\n      \"uiNote\": \"Display alongside Turn 13 as the main overtaking region.\"\n    },\n    {\n      \"id\": \"braking-zone-4\",\n      \"type\": \"braking zone\",\n      \"title\": \"Braking Zone 4\",\n      \"sector\": 3,\n      \"cornerType\": \"outer-hook trim brake\",\n      \"elevation\": \"Relative elevation inferred from POV; replace with telemetry if available.\",\n      \"drivingNote\": \"Trim speed just enough to keep the car inside at T17.\",\n      \"racecraftNote\": \"Defensive braking can trigger exit-speed loss.\",\n      \"uiNote\": \"Show as a secondary braking zone.\"\n    },\n    {\n      \"id\": \"braking-zone-5\",\n      \"type\": \"braking zone\",\n      \"title\": \"Braking Zone 5\",\n      \"sector\": 3,\n      \"cornerType\": \"technical lift before the inner return\",\n      \"elevation\": \"Final climb/transition inferred from POV and minimap position.\",\n      \"drivingNote\": \"Use this only as a light trim before the inner return; the main braking reference is Braking Zone 1.\",\n      \"racecraftNote\": \"Small mistakes here affect the setup onto the line rather than creating a primary passing zone.\",\n      \"uiNote\": \"Show as a secondary trim reference, not a heavy braking marker.\"\n    },\n    {\n      \"id\": \"elevation-zone-1\",\n      \"type\": \"elevation zone\",\n      \"title\": \"Upper Ridge\",\n      \"sector\": 1,\n      \"cornerType\": \"cresting straight and kink\",\n      \"elevation\": \"Highest visual portion inferred from the POV minimap and uphill cue.\",\n      \"drivingNote\": \"Keep the car settled as load lightens near the crest.\",\n      \"racecraftNote\": \"A following car may wash wide in dirty air.\",\n      \"uiNote\": \"Show high-point note and future telemetry placeholder.\"\n    },\n    {\n      \"id\": \"elevation-zone-2\",\n      \"type\": \"elevation zone\",\n      \"title\": \"Downhill Connector\",\n      \"sector\": 1,\n      \"cornerType\": \"descending transition\",\n      \"elevation\": \"Relative descent inferred from Yamagiwa-style upper-to-middle flow.\",\n      \"drivingNote\": \"Expect speed to build while braking stability decreases.\",\n      \"racecraftNote\": \"The closing-rate difference can produce rear-end contact.\",\n      \"uiNote\": \"Display descent warning and braking-zone pairing.\"\n    },\n    {\n      \"id\": \"elevation-zone-3\",\n      \"type\": \"elevation zone\",\n      \"title\": \"Lower Compression\",\n      \"sector\": 2,\n      \"cornerType\": \"low-speed technical load\",\n      \"elevation\": \"Low point inferred; replace with exact elevation map if available.\",\n      \"drivingNote\": \"Use the compression to rotate without overloading the rear.\",\n      \"racecraftNote\": \"Cars with different tire states diverge strongly here.\",\n      \"uiNote\": \"Show grip and traction note.\"\n    },\n    {\n      \"id\": \"elevation-zone-4\",\n      \"type\": \"elevation zone\",\n      \"title\": \"Hairpin Exit Rise\",\n      \"sector\": 2,\n      \"cornerType\": \"exit climb\",\n      \"elevation\": \"Return climb inferred from lower-loop exit behavior.\",\n      \"drivingNote\": \"Throttle application matters more than minimum speed.\",\n      \"racecraftNote\": \"A better launch can set up the next-sector attack.\",\n      \"uiNote\": \"Pair with speed-zone-2.\"\n    },\n    {\n      \"id\": \"elevation-zone-5\",\n      \"type\": \"elevation zone\",\n      \"title\": \"Outer Return Load\",\n      \"sector\": 3,\n      \"cornerType\": \"loaded return sweep\",\n      \"elevation\": \"Relative elevation inferred from POV; replace with telemetry if available.\",\n      \"drivingNote\": \"Avoid sharp steering corrections as lateral load builds.\",\n      \"racecraftNote\": \"Understeer here creates a defensive vulnerability at corner exit.\",\n      \"uiNote\": \"Show stability and tire-load context.\"\n    },\n    {\n      \"id\": \"speed-zone-1\",\n      \"type\": \"acceleration zone\",\n      \"title\": \"Upper Acceleration Zone\",\n      \"sector\": 1,\n      \"cornerType\": \"fast upper run\",\n      \"elevation\": \"Upper ridge acceleration inferred from the minimap reference.\",\n      \"drivingNote\": \"Keep steering shallow and let the car accelerate across the top.\",\n      \"racecraftNote\": \"Draft and exit speed can set up the first braking zone.\",\n      \"uiNote\": \"Display speed-building and slipstream notes.\"\n    },\n    {\n      \"id\": \"speed-zone-2\",\n      \"type\": \"acceleration zone\",\n      \"title\": \"Lower Loop Launch\",\n      \"sector\": 2,\n      \"cornerType\": \"hairpin exit run\",\n      \"elevation\": \"Climb away from the lower loop inferred from reference.\",\n      \"drivingNote\": \"Be patient on throttle until the steering opens.\",\n      \"racecraftNote\": \"Exit traction decides whether an overtake is possible in Sector 3.\",\n      \"uiNote\": \"Display launch quality and traction notes.\"\n    },\n    {\n      \"id\": \"speed-zone-3\",\n      \"type\": \"acceleration zone\",\n      \"title\": \"Inner Straight Run\",\n      \"sector\": 3,\n      \"cornerType\": \"straight acceleration\",\n      \"elevation\": \"Relative elevation inferred from POV; replace with telemetry if available.\",\n      \"drivingNote\": \"Straighten the car and commit to full throttle toward the final complex.\",\n      \"racecraftNote\": \"This run exposes any compromise from T18/T19 setup.\",\n      \"uiNote\": \"Show final-sector acceleration and closing-rate context.\"\n    }\n  ]\n}");
