/**
 * Sheet music on paper: lay the bars out on pages, then print them or save a PDF.
 * Pages are drawn at print resolution on canvases with the same engraving as the screen.
 */
import type { Sheet } from "@/lib/editor/notation";
import { type SheetLine, drawLines, layoutSheet, lineHeight, loadVex } from "@/lib/editor/sheet-render";

export type PaperSize = "a4" | "letter";

/** Page sizes in millimetres. */
const PAPER: Record<PaperSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 }
};
/** The page is laid out 820 units wide, whatever the paper: that sets the size of the notes. */
const PAGE_UNITS = 820;
const MARGIN = 44;
const TITLE_SPACE = 84;
/** Dots per inch of the drawn pages: sharp on paper without huge files. */
const PRINT_DPI = 200;

export interface SheetTitle {
  title: string;
  /** A line under the title, such as tempo and key. */
  subtitle: string;
}

/** US Letter where it is the custom, A4 everywhere else. */
export function defaultPaper(): PaperSize {
  const region = (navigator.language.split("-")[1] ?? "").toUpperCase();
  return ["US", "CA", "MX", "PH", "CL", "CO"].includes(region) ? "letter" : "a4";
}


/** Share the lines out over pages: fewer on the first, which carries the title. */
function paginate(lines: SheetLine[], pageHeight: number): SheetLine[][] {
  const pages: SheetLine[][] = [[]];
  let room = pageHeight - 2 * MARGIN - TITLE_SPACE - 24;
  for (const line of lines) {
    const current = pages[pages.length - 1];
    // A line that does not fit starts a new page; a page always takes at least one line.
    if (current.length > 0 && lineHeight(line) > room) {
      pages.push([line]);
      room = pageHeight - 2 * MARGIN - 24 - lineHeight(line);
    } else {
      current.push(line);
      room -= lineHeight(line);
    }
  }
  return pages;
}

/** Draw every page: white paper, title on the first, page numbers at the foot. */
export async function renderPages(sheet: Sheet, heading: SheetTitle, paper: PaperSize): Promise<HTMLCanvasElement[]> {
  const vex = await loadVex();
  const size = PAPER[paper];
  const pageHeight = (PAGE_UNITS * size.height) / size.width;
  const scale = ((size.width / 25.4) * PRINT_DPI) / PAGE_UNITS;
  const layout = paginate(layoutSheet(vex, sheet, PAGE_UNITS - 2 * MARGIN), pageHeight);
  const total = layout.length;
  const pages: HTMLCanvasElement[] = [];
  for (let page = 0; page < total; page++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(PAGE_UNITS * scale);
    canvas.height = Math.round(pageHeight * scale);
    const raw = canvas.getContext("2d");
    if (!raw) throw new Error("This browser could not prepare a page to draw on.");
    raw.fillStyle = "#ffffff";
    raw.fillRect(0, 0, canvas.width, canvas.height);
    raw.scale(scale, scale);
    raw.fillStyle = "#000000";
    raw.textBaseline = "alphabetic";
    let top = MARGIN + 10;
    if (page === 0) {
      raw.textAlign = "center";
      raw.font = "600 26px Georgia, 'Times New Roman', serif";
      raw.fillText(heading.title, PAGE_UNITS / 2, MARGIN + 26, PAGE_UNITS - 2 * MARGIN);
      raw.font = "13px Georgia, 'Times New Roman', serif";
      raw.fillText(heading.subtitle, PAGE_UNITS / 2, MARGIN + 50, PAGE_UNITS - 2 * MARGIN);
      top += TITLE_SPACE;
    }
    raw.textAlign = "center";
    raw.font = "11px Georgia, 'Times New Roman', serif";
    raw.fillText(total > 1 ? `${heading.title}  ·  ${page + 1} / ${total}` : "", PAGE_UNITS / 2, pageHeight - MARGIN + 18);
    raw.textAlign = "start";

    const context = new vex.Renderer(canvas, vex.Renderer.Backends.CANVAS).getContext();
    drawLines(vex, context, sheet, layout[page], MARGIN, top);
    pages.push(canvas);
  }
  return pages;
}

function fileName(title: string): string {
  const clean = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").trim().slice(0, 80);
  return `${clean || "Sheet music"}.pdf`;
}

/** Save the sheet as a PDF file, one page per sheet of paper. */
export async function exportPdf(sheet: Sheet, heading: SheetTitle, paper: PaperSize): Promise<void> {
  const [{ jsPDF }, pages] = await Promise.all([import("jspdf"), renderPages(sheet, heading, paper)]);
  const size = PAPER[paper];
  const pdf = new jsPDF({ unit: "mm", format: [size.width, size.height], orientation: "portrait", compress: true });
  pdf.setProperties({ title: heading.title, creator: "Music Suite" });
  pages.forEach((page, index) => {
    if (index > 0) pdf.addPage([size.width, size.height], "portrait");
    // Black on white compresses very well as PNG and stays crisp.
    pdf.addImage(page, "PNG", 0, 0, size.width, size.height, undefined, "FAST");
  });
  pdf.save(fileName(heading.title));
}

/** Send the sheet to the printer: the browser's print dialog opens on the pages. */
export async function printSheet(sheet: Sheet, heading: SheetTitle, paper: PaperSize): Promise<void> {
  const pages = await renderPages(sheet, heading, paper);
  const size = PAPER[paper];
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const view = frame.contentWindow;
  if (!doc || !view) {
    frame.remove();
    throw new Error("This browser could not open the print view.");
  }
  doc.title = heading.title;
  const style = doc.createElement("style");
  style.textContent =
    `@page { size: ${size.width}mm ${size.height}mm; margin: 0; }` +
    "html, body { margin: 0; padding: 0; background: #fff; }" +
    "img { display: block; width: 100%; height: auto; page-break-after: always; break-after: page; }" +
    "img:last-child { page-break-after: auto; break-after: auto; }";
  doc.head.appendChild(style);
  await Promise.all(
    pages.map((page) => {
      const image = doc.createElement("img");
      image.alt = "";
      doc.body.appendChild(image);
      return new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("A page could not be prepared for printing."));
        image.src = page.toDataURL("image/png");
      });
    })
  );
  // The frame is removed once the dialog closes (or after a while, where that is not reported).
  const done = () => frame.remove();
  view.addEventListener("afterprint", done, { once: true });
  window.setTimeout(done, 10 * 60 * 1000);
  view.focus();
  view.print();
}
