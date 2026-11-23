/**
 * Small synchronous QR encoder for receipt links.
 * The package's renderer API is async, but printing needs the code in the HTML immediately,
 * so we use the generated module grid and draw one compact SVG path ourselves.
 */
import QRCode from "qrcode";

/** Returns a standalone SVG. Size it with CSS; the viewBox keeps the modules square. */
export function receiptQrSvg(text: string, label = "Scan for digital receipt"): string {
  const safeLabel = label.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const pad = 4;
  const total = size + pad * 2;
  let path = "";
  for (let row = 0; row < size; row++) {
    let col = 0;
    while (col < size) {
      if (!qr.modules.get(row, col)) { col++; continue; }
      const start = col;
      while (col < size && qr.modules.get(row, col)) col++;
      const width = col - start;
      path += `M${start + pad} ${row + pad}h${width}v1h-${width}z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="${safeLabel}"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#101828"/></svg>`;
}

/** Data URL for on-screen QR codes such as phone scanner pairing. */
export function qrDataUrl(text: string, width = 240): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width, color: { dark: "#14142b", light: "#ffffff" } });
}

/** The public link encoded on a printed receipt. */
export function receiptLink(token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/receipt/${encodeURIComponent(token)}`;
}
