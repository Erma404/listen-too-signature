import QRCode from "qrcode";
import { ACCENT, TEXT_COLOR, MUTED_COLOR, FALLBACK_PHOTO, assetUrl, activeBlocks, phoneKeys, displayValue, qrTarget } from "./signature.js";

const ICONS = { phone: "sig/phone.png", mobile: "sig/phone.png", email: "sig/email.png", website: "sig/website.png", address: "sig/address.png" };
const HOUSE = '"WT Gothic", Arial, sans-serif';
const SCALE = 3; // rendu net sur écrans haute densité

function loadImage(src, crossOrigin = false) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Génère un PNG fidèle à la maquette (police WT Gothic). Retourne { blob, photoMissing }. */
export async function renderSignaturePng({ details, images, template, design }) {
  try {
    await Promise.all([document.fonts.load(`400 16px ${HOUSE}`), document.fonts.load(`600 16px ${HOUSE}`)]);
  } catch {
    // police indisponible : le canvas retombe sur Arial
  }

  const accent = design.color || ACCENT;
  const withPhoto = template === "horizontal";
  let photoImg = null;
  let photoMissing = false;
  if (withPhoto) {
    // Ordre : photo importée (locale, toujours dessinable) > URL publique (si CORS autorisé) > logo Listen too
    photoImg = (await loadImage(images.photoPreview)) || (await loadImage(images.photoUrl.trim(), true));
    if (!photoImg) {
      photoMissing = Boolean(images.photoPreview || images.photoUrl.trim());
      photoImg = await loadImage(assetUrl(FALLBACK_PHOTO));
    }
  }

  const qr = qrTarget(design, details);
  const qrImg = qr ? await loadImage(await QRCode.toDataURL(qr, { margin: 0, width: 240, color: { dark: "#000000", light: "#ffffff" } })) : null;

  const iconKeys = [...new Set([...phoneKeys(details), ...activeBlocks(details, design)])];
  const icons = Object.fromEntries(await Promise.all(iconKeys.map(async (k) => [k, await loadImage(assetUrl(ICONS[k]))])));

  const F = {
    name: `600 20px ${HOUSE}`,
    entity: `400 13px ${HOUSE}`,
    pill: `600 12px ${HOUSE}`,
    body: `400 13px ${HOUSE}`,
  };

  // Mise en page : liste d'opérations de dessin avec leur hauteur, mesurée avant de dimensionner le canvas.
  const measure = document.createElement("canvas").getContext("2d");
  const textW = (font, t) => ((measure.font = font), measure.measureText(t).width);
  const ops = [];
  const add = (h, w, draw) => ops.push({ h, w, draw });

  const name = details.name || "Prénom Nom";
  add(26, textW(F.name, name), (ctx, x, y) => {
    ctx.font = F.name;
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(name, x, y);
  });
  if (details.dept.trim()) {
    add(20, textW(F.entity, details.dept), (ctx, x, y) => {
      ctx.font = F.entity;
      ctx.fillStyle = MUTED_COLOR;
      ctx.fillText(details.dept, x, y);
    });
  }
  if (details.title.trim()) {
    const pillW = textW(F.pill, details.title) + 24;
    add(30, pillW, (ctx, x, y) => {
      ctx.fillStyle = accent;
      roundRect(ctx, x, y + 3, pillW, 22, 11);
      ctx.fill();
      ctx.font = F.pill;
      ctx.fillStyle = TEXT_COLOR;
      ctx.fillText(details.title, x + 12, y + 8);
    });
  }
  const contactItem = (k) => ({ k, text: displayValue(k, details[k]), w: 18 + textW(F.body, displayValue(k, details[k])) });
  const drawContacts = (items) => (ctx, x, y) => {
    let tx = x;
    items.forEach((it) => {
      if (icons[it.k]) ctx.drawImage(icons[it.k], tx, y + 5, 12, 12);
      ctx.font = F.body;
      ctx.fillStyle = TEXT_COLOR;
      ctx.fillText(it.text, tx + 18, y + 3);
      tx += it.w + 20;
    });
  };
  const phones = phoneKeys(details).map(contactItem);
  if (phones.length) add(22, phones.reduce((s, it) => s + it.w, 0) + 20 * (phones.length - 1), drawContacts(phones));
  activeBlocks(details, design).forEach((k) => {
    const it = contactItem(k);
    add(22, it.w, drawContacts([it]));
  });
  design.customFields
    .filter((f) => f.label.trim() || f.value.trim())
    .forEach((f) => {
      const t = f.label.trim() && f.value.trim() ? `${f.label.trim()} : ${f.value.trim()}` : f.label.trim() || f.value.trim();
      add(22, textW(F.body, t), (ctx, x, y) => {
        ctx.font = F.body;
        ctx.fillStyle = TEXT_COLOR;
        ctx.fillText(t, x, y + 3);
      });
    });
  if (qrImg) add(88, 80, (ctx, x, y) => ctx.drawImage(qrImg, x, y + 8, 80, 80));

  const PAD = 20;
  const PHOTO = 90;
  const textX = PAD + (withPhoto && photoImg ? PHOTO + 16 : 0);
  const contentH = ops.reduce((s, o) => s + o.h, 0);
  const width = Math.ceil(textX + Math.max(...ops.map((o) => o.w)) + PAD);
  const height = Math.ceil(PAD * 2 + Math.max(contentH, withPhoto && photoImg ? PHOTO : 0));

  const canvas = document.createElement("canvas");
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff"; // fond blanc forcé (anti thème sombre)
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "top";

  if (withPhoto && photoImg) ctx.drawImage(photoImg, PAD, PAD, PHOTO, PHOTO);
  let y = PAD;
  ops.forEach((o) => {
    o.draw(ctx, textX, y);
    y += o.h;
  });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return { blob, photoMissing };
}
