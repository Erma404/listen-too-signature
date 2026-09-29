// Génération du HTML de signature : tableaux imbriqués + styles en ligne uniquement.
// Outlook Windows rend le HTML avec le moteur de Word : pas de flexbox, pas de grid,
// pas de police personnalisée, pas de coins arrondis garantis, pas d'images data: fiables.

export const ACCENT = "#D3EF9D";
export const TEXT_COLOR = "#1a1a1a";

export const FONTS = ["Arial", "Helvetica", "Georgia", "Times New Roman", "Verdana", "Tahoma", "Trebuchet MS", "Courier New"];

// Champs réordonnables. Le mobile est hors liste : toujours juste sous la fonction.
export const BLOCK_META = {
  email: { label: "Email" },
  website: { label: "Site web" },
  address: { label: "Adresse" },
};
export const DEFAULT_BLOCK_ORDER = ["email", "website", "address"];

const ICON_FILES = {
  mobile: "sig/phone.png",
  email: "sig/email.png",
  website: "sig/website.png",
  address: "sig/address.png",
};
export const FALLBACK_PHOTO = "sig/logo-listen-too.png";

// Les images d'une signature doivent être hébergées sur une URL publique absolue
// (Gmail supprime les images data:, Outlook les bloque souvent).
export function assetUrl(path) {
  const configured = import.meta.env.VITE_ASSET_BASE_URL;
  const base = configured || window.location.origin + import.meta.env.BASE_URL;
  return new URL(path, base.endsWith("/") ? base : base + "/").href;
}

export function assetsAreLocal() {
  if (import.meta.env.VITE_ASSET_BASE_URL) return false;
  return ["localhost", "127.0.0.1", "0.0.0.0", ""].includes(window.location.hostname) || window.location.protocol === "file:";
}

export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalizeUrl(raw) {
  const v = (raw || "").trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function fontStack(font) {
  const quoted = font.includes(" ") ? `'${font}'` : font;
  if (font === "Georgia" || font === "Times New Roman") return `${quoted}, serif`;
  if (font === "Courier New") return `${quoted}, monospace`;
  if (font === "Arial") return "Arial, Helvetica, sans-serif";
  return `${quoted}, Arial, sans-serif`;
}

export function qrTarget(design, details) {
  if (!design.qr.enabled) return "";
  return normalizeUrl(design.qr.url) || normalizeUrl(details.website);
}

export function qrImageUrl(target, size = 140) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(target)}`;
}

export function fieldHref(k, raw) {
  const v = raw.trim();
  if (k === "mobile") return `tel:${v.replace(/[^+\d]/g, "")}`;
  if (k === "email") return `mailto:${v}`;
  if (k === "website") return normalizeUrl(v);
  return null;
}

export function displayValue(k, raw) {
  const v = raw.trim();
  return k === "website" ? v.replace(/^https?:\/\//i, "").replace(/\/$/, "") : v;
}

export function activeBlocks(details, design) {
  return design.blockOrder.filter((k) => BLOCK_META[k] && details[k] && details[k].trim());
}

export function phoneKeys(details) {
  return ["mobile"].filter((k) => details[k] && details[k].trim());
}

/**
 * @param photoSrc URL de l'image à afficher en modèle horizontal (ignorée en compact)
 */
export function buildSignatureHtml({ details, template, design, photoSrc }) {
  const ff = fontStack(design.font);
  const accent = design.color || ACCENT;
  const base = `font-family:${ff};color:${TEXT_COLOR};`;
  const table = (inner, extra = "") =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${extra}>${inner}</table>`;

  // Icône et texte sur une même ligne de 16 px, interligne imposé (y compris Outlook) :
  // l'icône de 12 px est centrée sur la hauteur des chiffres/capitales, quel que soit le contexte de collage.
  const LINE = "font-size:12px;line-height:16px;mso-line-height-rule:exactly;";
  const contactCell = (k) => {
    const href = fieldHref(k, details[k]);
    const text = `<span style="${base}${LINE}">${escapeHtml(displayValue(k, details[k]))}</span>`;
    const linked = href ? `<a href="${escapeHtml(href)}" style="text-decoration:none;color:${TEXT_COLOR};${LINE}">${text}</a>` : text;
    return (
      `<td width="12" height="16" valign="middle" style="width:12px;height:16px;padding:0;font-size:0;line-height:16px;mso-line-height-rule:exactly;"><img src="${escapeHtml(
        assetUrl(ICON_FILES[k])
      )}" width="12" height="12" alt="" border="0" style="display:block;width:12px;height:12px;border:0;" /></td>` +
      `<td width="8" style="width:8px;font-size:0;line-height:0;padding:0;">&nbsp;</td>` +
      `<td height="16" valign="middle" style="${base}${LINE}height:16px;padding:0;">${linked}</td>`
    );
  };
  const row = (inner) => `<tr><td style="padding:4px 0 0 0;">${inner}</td></tr>`;

  const nameRow = `<tr><td style="${base}font-size:15px;font-weight:bold;">${escapeHtml(details.name) || "Prénom Nom"}</td></tr>`;
  // Pastille de fonction : cellule bgcolor (respectée par Outlook). Le border-radius est un bonus ignoré par Outlook Windows.
  const titleRow = details.title.trim()
    ? row(
        table(
          `<tr><td bgcolor="${accent}" style="${base}background-color:${accent};font-size:11px;font-weight:bold;padding:4px 12px;border-radius:12px;">${escapeHtml(details.title)}</td></tr>`
        )
      )
    : "";

  const phones = phoneKeys(details);
  const phoneRow = phones.length
    ? row(table(`<tr>${phones.map(contactCell).join(`<td width="16" style="width:16px;font-size:0;line-height:0;">&nbsp;</td>`)}</tr>`))
    : "";
  const blockRows = activeBlocks(details, design)
    .map((k) => row(table(`<tr>${contactCell(k)}</tr>`)))
    .join("");

  const customRows = design.customFields
    .filter((f) => f.label.trim() || f.value.trim())
    .map((f) => {
      const text = f.label.trim() && f.value.trim() ? `${f.label.trim()} : ${f.value.trim()}` : f.label.trim() || f.value.trim();
      return `<tr><td style="${base}font-size:12px;padding:4px 0 0 0;">${escapeHtml(text)}</td></tr>`;
    })
    .join("");

  const qr = qrTarget(design, details);
  const qrRow = qr
    ? `<tr><td style="padding:8px 0 0 0;"><a href="${escapeHtml(qr)}"><img src="${escapeHtml(qrImageUrl(qr))}" width="70" height="70" alt="QR code" border="0" style="display:block;width:70px;height:70px;border:0;" /></a></td></tr>`
    : "";

  const textStack = table(`${nameRow}${titleRow}${phoneRow}${blockRows}${customRows}${qrRow}`);
  const white = ` bgcolor="#ffffff" style="border-collapse:collapse;background-color:#ffffff;"`;
  const cellWhite = `bgcolor="#ffffff" valign="top" style="vertical-align:top;background-color:#ffffff;`;

  if (template === "compact") {
    return table(`<tr><td ${cellWhite}padding:0;">${textStack}</td></tr>`, white);
  }

  // Espacement dans une cellule dédiée : un padding sur la cellule photo réduirait la place de l'image (logo écrasé).
  const photoCell =
    `<td width="72" ${cellWhite}width:72px;min-width:72px;padding:0;"><img src="${escapeHtml(photoSrc)}" width="72" height="72" alt="${escapeHtml(
      details.name
    )}" border="0" style="display:block;width:72px;min-width:72px;max-width:72px;height:72px;border:0;" /></td>` +
    `<td width="16" style="width:16px;min-width:16px;font-size:0;line-height:0;padding:0;">&nbsp;</td>`;
  return table(`<tr>${photoCell}<td ${cellWhite}padding:0;">${textStack}</td></tr>`, white);
}

export function buildSignaturePlainText({ details, design }) {
  const lines = [details.name || "Prénom Nom"];
  if (details.title.trim()) lines.push(details.title.trim());
  const phones = phoneKeys(details).map((k) => details[k].trim());
  if (phones.length) lines.push(phones.join("  |  "));
  activeBlocks(details, design).forEach((k) => lines.push(displayValue(k, details[k])));
  design.customFields.filter((f) => f.label.trim() || f.value.trim()).forEach((f) => lines.push(`${f.label} : ${f.value}`.trim()));
  return lines.join("\n");
}
