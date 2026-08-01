// Edição de imagens dentro do iframe da newsletter (modo designMode):
// permite selecionar uma imagem, redimensioná-la pelos cantos e movê-la
// livremente (deslocamento relativo) com o rato.
//
// attachImageEditing(doc) devolve uma função de limpeza que remove todos os
// elementos auxiliares — chamar sempre antes de serializar o HTML.

const OVERLAY_ID = "__sepri_img_editor__";
const HANDLE_SIZE = 12;

export function attachImageEditing(doc: Document): () => void {
  const body = doc.body;
  if (!body) return () => {};

  const overlay = doc.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.setAttribute("data-sepri-editor", "1");
  overlay.style.cssText =
    "position:absolute;display:none;pointer-events:none;z-index:2147483000;box-sizing:border-box;border:2px solid #7ec8d8;";

  const handles: HTMLDivElement[] = [];
  const corners = [
    ["nw", "0", "0"],
    ["ne", "0", "100%"],
    ["sw", "100%", "0"],
    ["se", "100%", "100%"],
  ] as const;

  for (const [name, top, left] of corners) {
    const h = doc.createElement("div");
    h.dataset["corner"] = name;
    h.style.cssText = `position:absolute;top:${top};left:${left};width:${HANDLE_SIZE}px;height:${HANDLE_SIZE}px;margin:-${HANDLE_SIZE / 2}px 0 0 -${HANDLE_SIZE / 2}px;background:#1a3a63;border:2px solid #ffffff;border-radius:50%;pointer-events:auto;cursor:${name === "ne" || name === "sw" ? "nesw-resize" : "nwse-resize"};`;
    overlay.appendChild(h);
    handles.push(h);
  }
  body.appendChild(overlay);

  let selected: HTMLImageElement | null = null;
  let mode: "none" | "move" | "resize" = "none";
  let startX = 0;
  let startY = 0;
  let startW = 0;
  let startH = 0;
  let startLeft = 0;
  let startTop = 0;
  let corner = "se";

  function px(value: string): number {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }

  function updateOverlay() {
    if (!selected) {
      overlay.style.display = "none";
      return;
    }
    const rect = selected.getBoundingClientRect();
    const scrollX = doc.defaultView?.scrollX ?? 0;
    const scrollY = doc.defaultView?.scrollY ?? 0;
    overlay.style.display = "block";
    overlay.style.left = `${rect.left + scrollX}px`;
    overlay.style.top = `${rect.top + scrollY}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  }

  function select(img: HTMLImageElement | null) {
    selected = img;
    if (img) {
      img.setAttribute("draggable", "false");
      updateOverlay();
    } else {
      overlay.style.display = "none";
    }
  }

  function onMouseDown(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    if (target.dataset && target.dataset["corner"] && selected) {
      mode = "resize";
      corner = target.dataset["corner"]!;
      const rect = selected.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startW = rect.width;
      startH = rect.height;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (target.tagName === "IMG") {
      const img = target as HTMLImageElement;
      select(img);
      mode = "move";
      startX = e.clientX;
      startY = e.clientY;
      const cs = doc.defaultView?.getComputedStyle(img);
      if (!img.style.position || img.style.position === "static") {
        img.style.position = "relative";
      }
      startLeft = px(img.style.left || cs?.left || "0");
      startTop = px(img.style.top || cs?.top || "0");
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    select(null);
    mode = "none";
  }

  function onMouseMove(e: MouseEvent) {
    if (mode === "none" || !selected) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (mode === "move") {
      selected.style.position = "relative";
      selected.style.left = `${Math.round(startLeft + dx)}px`;
      selected.style.top = `${Math.round(startTop + dy)}px`;
    } else {
      const signX = corner === "ne" || corner === "se" ? 1 : -1;
      const ratio = startH / (startW || 1);
      const width = Math.max(24, Math.round(startW + signX * dx));
      selected.style.width = `${width}px`;
      selected.style.height = `${Math.round(width * ratio)}px`;
      selected.style.maxWidth = "100%";
      selected.removeAttribute("width");
      selected.removeAttribute("height");
    }
    updateOverlay();
    e.preventDefault();
  }

  function onMouseUp() {
    mode = "none";
    updateOverlay();
  }

  function onScrollOrResize() {
    updateOverlay();
  }

  function onDragStart(e: Event) {
    if ((e.target as HTMLElement)?.tagName === "IMG") e.preventDefault();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!selected) return;
    const step = e.shiftKey ? 10 : 2;
    const map: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = map[e.key];
    if (delta) {
      selected.style.position = "relative";
      selected.style.left = `${px(selected.style.left || "0") + delta[0]}px`;
      selected.style.top = `${px(selected.style.top || "0") + delta[1]}px`;
      updateOverlay();
      e.preventDefault();
    } else if (e.key === "Escape") {
      select(null);
    }
  }

  doc.addEventListener("mousedown", onMouseDown, true);
  doc.addEventListener("mousemove", onMouseMove, true);
  doc.addEventListener("mouseup", onMouseUp, true);
  doc.addEventListener("dragstart", onDragStart, true);
  doc.addEventListener("keydown", onKeyDown, true);
  doc.defaultView?.addEventListener("scroll", onScrollOrResize, true);
  doc.defaultView?.addEventListener("resize", onScrollOrResize);

  return () => {
    doc.removeEventListener("mousedown", onMouseDown, true);
    doc.removeEventListener("mousemove", onMouseMove, true);
    doc.removeEventListener("mouseup", onMouseUp, true);
    doc.removeEventListener("dragstart", onDragStart, true);
    doc.removeEventListener("keydown", onKeyDown, true);
    doc.defaultView?.removeEventListener("scroll", onScrollOrResize, true);
    doc.defaultView?.removeEventListener("resize", onScrollOrResize);
    overlay.remove();
    doc.querySelectorAll("img[draggable='false']").forEach((el) => el.removeAttribute("draggable"));
  };
}
