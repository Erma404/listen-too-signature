import React, { useState, useMemo, useRef, useEffect } from "react";
import { Copy, Plus, Trash2, GripVertical, ArrowUp, ArrowDown, Save, X, ImagePlus, Download, User, LayoutTemplate, Palette, ChevronRight, ChevronLeft, FolderOpen } from "lucide-react";
import {
  ACCENT,
  FONTS,
  BLOCK_META,
  DEFAULT_BLOCK_ORDER,
  FALLBACK_PHOTO,
  assetUrl,
  assetsAreLocal,
  buildSignatureHtml,
  buildSignaturePlainText,
  normalizeUrl,
} from "./signature.js";
import { renderSignaturePng } from "./png.js";

const STORAGE_KEY = "lt-signatures-v1";
const DRAFT_KEY = "lt-signature-draft-v1";

const STEPS = [
  { id: 1, label: "Détails", icon: User },
  { id: 2, label: "Photo", icon: ImagePlus },
  { id: 3, label: "Modèle", icon: LayoutTemplate },
  { id: 4, label: "Design", icon: Palette },
];
const SAVED_VIEW = { id: 5, label: "Enregistrées", icon: FolderOpen };

// Palette de l'interface : tokens définis dans index.css (blanc / beige, encre, accent de la charte)
const C = {
  ink: "var(--ink)",
  muted: "var(--muted)",
  paper: "var(--paper)",
  beige: "var(--sand)",
  beigeDark: "var(--sand-2)",
  line: "var(--line)",
  lineStrong: "var(--line-strong)",
};

const emptyDetails = {
  name: "",
  title: "",
  dept: "Listen too",
  phone: "",
  mobile: "",
  email: "",
  website: "https://listen-too.com",
  address: "",
};
const emptyImages = { photoPreview: null, photoUrl: "" };
const defaultDesign = () => ({
  font: "Arial",
  color: ACCENT,
  customFields: [],
  qr: { enabled: false, url: "" },
  blockOrder: [...DEFAULT_BLOCK_ORDER],
  useHouseFont: true,
});

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function readStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// Remet d'aplomb un instantané (brouillon ou signature sauvegardée) quelle que soit sa version.
function normalizeSnapshot(s = {}) {
  const design = { ...defaultDesign(), ...(s.design || {}) };
  const known = design.blockOrder.filter((k) => BLOCK_META[k]);
  design.blockOrder = [...known, ...DEFAULT_BLOCK_ORDER.filter((k) => !known.includes(k))];
  design.qr = { enabled: false, url: "", ...(design.qr || {}) };
  return {
    details: { ...emptyDetails, ...(s.details || {}) },
    images: { ...emptyImages, ...(s.images || {}) },
    template: s.template === "compact" ? "compact" : "horizontal",
    design,
  };
}

// Recadrage carré 240 px : photo carrée par défaut, et assez légère pour tenir dans localStorage.
function squareCrop(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 240;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 240, 240);
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 240, 240);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible"));
    };
    img.src = url;
  });
}

function slug(name) {
  return (
    (name || "listen-too")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "listen-too"
  );
}

function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="ui-label">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "ui-input";
const inputStyle = undefined;

export default function SignatureGenerator() {
  const initial = useMemo(() => normalizeSnapshot(readStorage(DRAFT_KEY) || {}), []);
  const [step, setStep] = useState(1);
  const [details, setDetails] = useState(initial.details);
  const [images, setImages] = useState(initial.images);
  const [template, setTemplate] = useState(initial.template);
  const [design, setDesign] = useState(initial.design);
  const previewRef = useRef(null);
  const codeRef = useRef(null);
  const [pngStatus, setPngStatus] = useState("");
  const [pngUrl, setPngUrl] = useState("");
  const [tab, setTab] = useState("preview");
  const [copyMsg, setCopyMsg] = useState("");
  const [saveName, setSaveName] = useState("");
  const [saved, setSaved] = useState(() => readStorage(STORAGE_KEY) || []);
  const [editingId, setEditingId] = useState(null);
  const [storageError, setStorageError] = useState("");
  const [dragIdx, setDragIdx] = useState(null);
  const [photoError, setPhotoError] = useState("");

  // Brouillon en cours : conservé au rechargement de la page
  useEffect(() => {
    writeStorage(DRAFT_KEY, { details, images, template, design });
  }, [details, images, template, design]);

  const fallbackPhoto = assetUrl(FALLBACK_PHOTO);
  const exportHtml = useMemo(
    () => buildSignatureHtml({ details, template, design, photoSrc: images.photoUrl.trim() || fallbackPhoto }),
    [details, images.photoUrl, template, design, fallbackPhoto]
  );
  // L'aperçu montre la photo importée ; la copie (Ctrl+C ou bouton) envoie toujours exportHtml.
  const previewHtml = useMemo(
    () => buildSignatureHtml({ details, template, design, photoSrc: images.photoPreview || images.photoUrl.trim() || fallbackPhoto }),
    [details, images, template, design, fallbackPhoto]
  );
  const plainText = useMemo(() => buildSignaturePlainText({ details, design }), [details, design]);
  const localAssets = assetsAreLocal();
  const uploadedButNotHosted = template === "horizontal" && images.photoPreview && !images.photoUrl.trim();

  function flash(msg, ms = 3500) {
    setCopyMsg(msg);
    setTimeout(() => setCopyMsg(""), ms);
  }

  function updateDetail(k, v) {
    setDetails((d) => ({ ...d, [k]: v }));
  }

  async function onPhotoUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("La photo dépasse 5 Mo. Choisissez un fichier plus léger.");
      return;
    }
    try {
      const dataUrl = await squareCrop(file);
      setImages((im) => ({ ...im, photoPreview: dataUrl }));
      setPhotoError("");
    } catch {
      setPhotoError("Impossible de lire cette image.");
    }
  }

  function moveBlock(idx, dir) {
    setDesign((d) => {
      const arr = [...d.blockOrder];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return d;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return { ...d, blockOrder: arr };
    });
  }

  function handleDrop(idx) {
    if (dragIdx === null || dragIdx === idx) return;
    setDesign((d) => {
      const arr = [...d.blockOrder];
      const [moved] = arr.splice(dragIdx, 1);
      arr.splice(idx, 0, moved);
      return { ...d, blockOrder: arr };
    });
    setDragIdx(null);
  }

  function addCustomField() {
    setDesign((d) => ({ ...d, customFields: [...d.customFields, { id: uid(), label: "", value: "" }] }));
  }
  function updateCustomField(id, key, value) {
    setDesign((d) => ({ ...d, customFields: d.customFields.map((f) => (f.id === id ? { ...f, [key]: value } : f)) }));
  }
  function removeCustomField(id) {
    setDesign((d) => ({ ...d, customFields: d.customFields.filter((f) => f.id !== id) }));
  }

  // --- Copie ---------------------------------------------------------------

  function selectPreview() {
    const el = previewRef.current;
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Ctrl/Cmd+A dans le cadre d'aperçu : ne sélectionne que la signature, pas toute la page
  function onPreviewKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      selectPreview();
    }
  }

  // Ctrl/Cmd+C depuis l'aperçu : on remplace le contenu copié par le HTML d'export
  // (police web-safe, URL publique de la photo), même si l'écran affiche WT Gothic.
  function onPreviewCopy(e) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    e.preventDefault();
    e.clipboardData.setData("text/html", exportHtml);
    e.clipboardData.setData("text/plain", plainText);
    flash("Signature copiée. Collez-la dans l'éditeur de signature Outlook / Gmail.");
  }

  async function copySignature() {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([exportHtml], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      flash("Signature copiée. Collez-la dans l'éditeur de signature Outlook / Gmail.");
    } catch {
      // Repli : sélection + execCommand, qui déclenche onPreviewCopy
      selectPreview();
      try {
        if (!document.execCommand("copy")) throw new Error();
      } catch {
        flash("Signature sélectionnée : copiez avec Ctrl/Cmd+C.", 5000);
      }
    }
  }

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(exportHtml);
      flash("Code HTML copié dans le presse-papiers.");
      return;
    } catch {
      // repli ci-dessous
    }
    const el = codeRef.current;
    if (el) {
      el.focus();
      el.select();
      try {
        flash(document.execCommand("copy") ? "Code HTML copié dans le presse-papiers." : "Code sélectionné : copiez avec Ctrl/Cmd+C.");
      } catch {
        flash("Code sélectionné : copiez avec Ctrl/Cmd+C.");
      }
    }
  }

  async function downloadPng() {
    setPngStatus("Génération en cours...");
    try {
      const { blob, photoMissing } = await renderSignaturePng({ details, images, template, design });
      if (!blob) throw new Error();
      if (pngUrl) URL.revokeObjectURL(pngUrl);
      const url = URL.createObjectURL(blob);
      setPngUrl(url);
      const a = document.createElement("a");
      a.href = url;
      a.download = `signature-${slug(details.name)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setPngStatus(
        photoMissing
          ? "Image prête, avec le logo à la place de la photo : l'URL de la photo n'autorise pas le chargement depuis cet outil. Importez la photo en local (étape 2) pour l'inclure."
          : "Image prête. Si le téléchargement ne démarre pas, utilisez le lien ci-contre."
      );
    } catch {
      setPngStatus("Échec de la génération. Réessayez.");
    }
  }

  // --- Sauvegardes ---------------------------------------------------------

  function persistSaved(next) {
    setSaved(next);
    setStorageError(
      writeStorage(STORAGE_KEY, next)
        ? ""
        : "Impossible d'enregistrer de façon permanente (stockage du navigateur plein ou bloqué) : la liste reste disponible pour cette session uniquement."
    );
  }

  function saveCurrent() {
    const snapshot = { details, images, template, design };
    if (editingId) {
      const name = saveName.trim() || details.name || saved.find((s) => s.id === editingId)?.name || "Signature";
      persistSaved(saved.map((s) => (s.id === editingId ? { ...s, name, snapshot } : s)));
    } else {
      const name = saveName.trim() || details.name || `Signature ${saved.length + 1}`;
      const id = uid();
      persistSaved([...saved, { id, name, snapshot }]);
      setEditingId(id);
    }
    setSaveName("");
  }
  function applySnapshot(snap) {
    const s = normalizeSnapshot(snap);
    setDetails(s.details);
    setImages(s.images);
    setTemplate(s.template);
    setDesign(s.design);
    setStep(1);
  }
  function loadSaved(item) {
    applySnapshot(item.snapshot);
    setEditingId(item.id);
  }
  function newSignature() {
    applySnapshot({});
    setEditingId(null);
  }
  function deleteSaved(id) {
    persistSaved(saved.filter((i) => i.id !== id));
    if (editingId === id) setEditingId(null);
  }
  function duplicateSaved(item) {
    persistSaved([...saved, { id: uid(), name: item.name + " (copie)", snapshot: item.snapshot }]);
  }


  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const isSavedView = step === SAVED_VIEW.id;
  const goPrev = () => setStep(STEPS[Math.max(0, stepIndex - 1)].id);
  const goNext = () => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)].id);
  const qrFallsBackToWebsite = design.qr.enabled && !design.qr.url.trim();


  const railButton = (s) => {
    const Icon = s.icon;
    const active = step === s.id;
    return (
      <button
        key={s.id}
        onClick={() => setStep(s.id)}
        aria-current={active ? "step" : undefined}
        className="ui-focus shrink-0 flex lg:flex-col items-center justify-center gap-2 lg:gap-1.5 h-12 lg:h-20 px-4 lg:px-0 lg:w-full text-[12px] lg:text-[11px] font-semibold whitespace-nowrap transition-colors"
        style={{ background: active ? "var(--accent)" : "transparent", color: active ? "var(--accent-ink)" : C.muted }}
      >
        <Icon size={18} strokeWidth={1.75} />
        {s.label}
      </button>
    );
  };

  return (
    <div className="ui min-h-screen lg:h-screen lg:overflow-hidden flex flex-col">
      {/* en-tête : la cellule du logo a exactement la largeur de la barre d'étapes */}
      <header className="shrink-0 flex items-stretch h-14" style={{ background: C.paper, borderBottom: `1px solid ${C.line}` }}>
        <div className="w-14 lg:w-[var(--rail)] shrink-0 flex items-center justify-center" style={{ borderRight: `1px solid ${C.line}` }}>
          <img src={fallbackPhoto} alt="Listen too" className="w-8 h-8" />
        </div>
        <div className="flex-1 flex items-center justify-between px-4 lg:px-8">
          <p className="text-[15px] font-semibold">
            Listen too <span style={{ color: C.muted, fontWeight: 400 }}>/ Signatures email</span>
          </p>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] px-2 h-6 inline-flex items-center" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
            Outil interne
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* barre des étapes */}
        <nav className="shrink-0 flex lg:flex-col overflow-x-auto lg:overflow-visible lg:w-[var(--rail)]" style={{ background: C.paper, borderRight: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
          {STEPS.map(railButton)}
          <div className="hidden lg:block flex-1" />
          <div className="hidden lg:block" style={{ borderTop: `1px solid ${C.line}` }} />
          {railButton(SAVED_VIEW)}
        </nav>

        {/* panneau formulaire */}
        <section className="shrink-0 flex flex-col lg:w-[var(--form)] lg:min-h-0" style={{ background: C.paper, borderRight: `1px solid ${C.line}` }}>
          <div className="ui-scroll flex-1 lg:min-h-0 lg:overflow-y-auto px-6 lg:px-8 pt-8 pb-6">
            <p className="ui-eyebrow mb-2">{isSavedView ? "Mes signatures" : `Étape ${stepIndex + 1} / ${STEPS.length}`}</p>

            {step === 1 && (
              <div>
                <h1 className="ui-title mb-6">Vos informations</h1>
                <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                  <Field label="Nom complet" className="col-span-2">
                    <input className={inputCls} value={details.name} onChange={(e) => updateDetail("name", e.target.value)} placeholder="Prénom Nom" />
                  </Field>
                  <Field label="Fonction">
                    <input className={inputCls} value={details.title} onChange={(e) => updateDetail("title", e.target.value)} placeholder="Lead Product Owner" />
                  </Field>
                  <Field label="Entité">
                    <input className={inputCls} value={details.dept} onChange={(e) => updateDetail("dept", e.target.value)} />
                  </Field>
                  <Field label="Téléphone fixe">
                    <input className={inputCls} type="tel" value={details.phone} onChange={(e) => updateDetail("phone", e.target.value)} placeholder="01 23 45 67 89" />
                  </Field>
                  <Field label="Mobile">
                    <input className={inputCls} type="tel" value={details.mobile} onChange={(e) => updateDetail("mobile", e.target.value)} placeholder="06 12 34 56 78" />
                  </Field>
                  <Field label="Email" className="col-span-2">
                    <input className={inputCls} type="email" value={details.email} onChange={(e) => updateDetail("email", e.target.value)} placeholder="prenom.nom@listen-too.com" />
                  </Field>
                  <Field label="Site web">
                    <input className={inputCls} value={details.website} onChange={(e) => updateDetail("website", e.target.value)} />
                  </Field>
                  <Field label="Adresse">
                    <input className={inputCls} value={details.address} onChange={(e) => updateDetail("address", e.target.value)} placeholder="Paris, France" />
                  </Field>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h1 className="ui-title mb-6">Votre photo</h1>
                <div className="flex gap-4 mb-6">
                  <img src={images.photoPreview || images.photoUrl.trim() || fallbackPhoto} alt="" className="w-20 h-20 shrink-0 object-cover" style={{ border: `1px solid ${C.line}` }} />
                  <div className="flex flex-col justify-between">
                    <label className="ui-btn ui-btn--ghost cursor-pointer self-start">
                      <ImagePlus size={16} strokeWidth={1.75} /> Importer une photo
                      <input type="file" accept="image/*" className="sr-only" onChange={onPhotoUpload} />
                    </label>
                    {images.photoPreview ? (
                      <button onClick={() => setImages((im) => ({ ...im, photoPreview: null }))} className="ui-hint underline self-start">
                        Retirer la photo importée
                      </button>
                    ) : (
                      <p className="ui-hint">5 Mo max, recadrée en carré. Aperçu et PNG uniquement.</p>
                    )}
                  </div>
                </div>
                {photoError && <p className="text-xs text-red-700 -mt-3 mb-4">{photoError}</p>}
                <Field label="URL publique de la photo (utilisée pour l'export)" className="mb-3">
                  <input className={inputCls} value={images.photoUrl} onChange={(e) => setImages((im) => ({ ...im, photoUrl: e.target.value }))} placeholder="https://listen-too.com/team/prenom-nom.jpg" />
                </Field>
                <p className="ui-hint">
                  Pour que la photo s'affiche dans les emails reçus, elle doit être hébergée sur une URL publique (image carrée, environ 240 × 240 px). Sans photo,
                  le logo Listen too s'affiche automatiquement.
                </p>
              </div>
            )}

            {step === 3 && (
              <div>
                <h1 className="ui-title mb-6">Modèle</h1>
                <div className="grid gap-3">
                  {[
                    ["horizontal", "Horizontal avec photo", "Photo carrée (ou logo Listen too) à gauche, informations à droite."],
                    ["compact", "Compact sans photo", "Texte seul. Le plus sûr sur toutes les messageries."],
                  ].map(([id, title, desc]) => (
                    <button key={id} onClick={() => setTemplate(id)} data-active={template === id} className="ui-row ui-focus text-left p-4 flex gap-4 items-start">
                      <span className="w-10 h-10 shrink-0 flex items-center justify-center gap-1" style={{ background: C.beigeDark }}>
                        {id === "horizontal" && <span className="w-3 h-3" style={{ background: C.ink }} />}
                        <span className="flex flex-col gap-1">
                          <span className="w-3.5 h-1" style={{ background: C.ink }} />
                          <span className="w-3.5 h-1" style={{ background: "var(--line-strong)" }} />
                          <span className="w-3.5 h-1" style={{ background: "var(--line-strong)" }} />
                        </span>
                      </span>
                      <span>
                        <span className="block text-sm font-semibold mb-1">{title}</span>
                        <span className="ui-hint block">{desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <h1 className="ui-title mb-6">Design</h1>
                <Field label="Police du HTML exporté (Outlook, Gmail)" className="mb-3">
                  <select className={inputCls} value={design.font} onChange={(e) => setDesign((d) => ({ ...d, font: e.target.value }))}>
                    {FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="flex items-start gap-3 mb-6">
                  <input type="checkbox" checked={design.useHouseFont} onChange={(e) => setDesign((d) => ({ ...d, useHouseFont: e.target.checked }))} className="mt-0.5 shrink-0" />
                  <span className="text-sm">
                    Aperçu en WT Gothic (police de la maquette)
                    <span className="ui-hint block mt-0.5">La signature copiée garde toujours la police web-safe ci-dessus.</span>
                  </span>
                </label>

                <p className="ui-label">Ordre des champs de contact</p>
                <p className="ui-hint mb-2">Le téléphone reste toujours sous la fonction.</p>
                <ul className="grid gap-2 mb-6">
                  {design.blockOrder.map((k, i) => (
                    <li
                      key={k}
                      draggable
                      onDragStart={() => setDragIdx(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(i)}
                      className="ui-row flex items-center justify-between h-10 pl-3 pr-1 text-sm cursor-grab"
                    >
                      <span className="flex items-center gap-2">
                        <GripVertical size={14} style={{ color: C.muted }} />
                        {BLOCK_META[k].label}
                      </span>
                      <span className="flex">
                        <button onClick={() => moveBlock(i, -1)} disabled={i === 0} aria-label="Monter" className="ui-focus w-8 h-8 flex items-center justify-center hover:bg-[var(--sand)] disabled:opacity-30">
                          <ArrowUp size={14} />
                        </button>
                        <button onClick={() => moveBlock(i, 1)} disabled={i === design.blockOrder.length - 1} aria-label="Descendre" className="ui-focus w-8 h-8 flex items-center justify-center hover:bg-[var(--sand)] disabled:opacity-30">
                          <ArrowDown size={14} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between mb-2">
                  <p className="ui-label !mb-0">Champs personnalisés</p>
                  <button onClick={addCustomField} className="ui-focus text-xs font-semibold flex items-center gap-1 hover:underline">
                    <Plus size={14} /> Ajouter
                  </button>
                </div>
                <div className="grid gap-2 mb-6">
                  {design.customFields.map((f) => (
                    <div key={f.id} className="grid grid-cols-[112px_1fr_40px] gap-2">
                      <input className={inputCls} value={f.label} onChange={(e) => updateCustomField(f.id, "label", e.target.value)} placeholder="Label" />
                      <input className={inputCls} value={f.value} onChange={(e) => updateCustomField(f.id, "value", e.target.value)} placeholder="Valeur" />
                      <button onClick={() => removeCustomField(f.id)} aria-label="Supprimer" className="ui-focus h-10 flex items-center justify-center hover:text-red-700" style={{ color: C.muted }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {design.customFields.length === 0 && <p className="ui-hint">Ex. « Disponibilité : lundi–jeudi ».</p>}
                </div>

                <label className="flex items-center gap-3 text-sm mb-2">
                  <input type="checkbox" checked={design.qr.enabled} onChange={(e) => setDesign((d) => ({ ...d, qr: { ...d.qr, enabled: e.target.checked } }))} />
                  QR code
                </label>
                {design.qr.enabled && (
                  <>
                    <input
                      className={inputCls}
                      value={design.qr.url}
                      onChange={(e) => setDesign((d) => ({ ...d, qr: { ...d.qr, url: e.target.value } }))}
                      placeholder={normalizeUrl(details.website) || "https://listen-too.com/prendre-rdv"}
                    />
                    <p className="ui-hint mt-1.5">
                      {qrFallsBackToWebsite
                        ? details.website.trim()
                          ? "Vide : le QR code pointe vers le site web."
                          : "Renseignez un lien ou un site web à l'étape 1."
                        : "QR code généré automatiquement depuis ce lien."}
                    </p>
                  </>
                )}
              </div>
            )}

            {isSavedView && (
              <div>
                <h1 className="ui-title mb-6">Signatures enregistrées</h1>
                {editingId && (
                  <p className="ui-hint mb-3">
                    En cours : « {saved.find((s) => s.id === editingId)?.name} ». Enregistrer met à jour cette signature.
                  </p>
                )}
                <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
                  <input className={inputCls} value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder={details.name || "Nom de cette signature"} />
                  <button onClick={saveCurrent} className="ui-btn ui-btn--primary">
                    <Save size={16} strokeWidth={1.75} /> {editingId ? "Mettre à jour" : "Enregistrer"}
                  </button>
                </div>
                {editingId && (
                  <button onClick={newSignature} className="ui-hint underline mb-4">
                    Commencer une nouvelle signature
                  </button>
                )}
                <ul className="grid gap-2 mt-4 mb-4">
                  {saved.map((item) => (
                    <li key={item.id} data-active={editingId === item.id} className="ui-row flex items-center justify-between gap-2 h-11 pl-3 pr-1 text-sm">
                      <span className="truncate font-semibold">{item.name}</span>
                      <span className="flex items-center shrink-0 text-xs" style={{ color: C.muted }}>
                        <button onClick={() => loadSaved(item)} className="ui-focus h-8 px-2 hover:text-[var(--ink)]">
                          Modifier
                        </button>
                        <button onClick={() => duplicateSaved(item)} className="ui-focus h-8 px-2 hover:text-[var(--ink)]">
                          Dupliquer
                        </button>
                        <button onClick={() => deleteSaved(item.id)} aria-label="Supprimer" className="ui-focus w-8 h-8 flex items-center justify-center hover:text-red-700">
                          <X size={14} />
                        </button>
                      </span>
                    </li>
                  ))}
                  {saved.length === 0 && <p className="ui-hint">Aucune signature enregistrée. Remplissez les étapes, puis enregistrez-la ici pour la retrouver plus tard.</p>}
                </ul>
                <p className={`ui-hint ${storageError ? "!text-amber-800" : ""}`}>
                  {storageError || "Enregistrées dans ce navigateur, sur cet appareil uniquement : ni partagées avec vos collègues, ni synchronisées."}
                </p>
              </div>
            )}
          </div>

          {!isSavedView && (
            <div className="shrink-0 flex items-center justify-between h-[72px] px-6 lg:px-8" style={{ borderTop: `1px solid ${C.line}` }}>
              <button onClick={goPrev} disabled={stepIndex === 0} className="ui-focus flex items-center gap-1 text-sm h-10 disabled:invisible" style={{ color: C.muted }}>
                <ChevronLeft size={16} /> Précédent
              </button>
              {stepIndex < STEPS.length - 1 ? (
                <button onClick={goNext} className="ui-btn ui-btn--primary">
                  Suivant <ChevronRight size={16} />
                </button>
              ) : (
                <button onClick={() => setStep(SAVED_VIEW.id)} className="ui-btn ui-btn--primary">
                  <Save size={16} strokeWidth={1.75} /> Enregistrer
                </button>
              )}
            </div>
          )}
        </section>

        {/* aperçu : occupe toute la hauteur restante, sans scroll de page */}
        <main className="flex-1 min-w-0 lg:min-h-0 flex flex-col gap-4 p-6 lg:p-8">
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
            <div className="ui-seg" role="group" aria-label="Sortie">
              <button aria-pressed={tab === "preview"} onClick={() => setTab("preview")} className="ui-focus">
                Aperçu
              </button>
              <button aria-pressed={tab === "code"} onClick={() => setTab("code")} className="ui-focus">
                Code HTML
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={downloadPng} className="ui-btn ui-btn--ghost">
                <Download size={16} strokeWidth={1.75} /> Télécharger en PNG
              </button>
              {tab === "preview" ? (
                <button onClick={copySignature} className="ui-btn ui-btn--primary">
                  <Copy size={16} strokeWidth={1.75} /> Copier la signature
                </button>
              ) : (
                <button onClick={copyHtml} className="ui-btn ui-btn--primary">
                  <Copy size={16} strokeWidth={1.75} /> Copier le HTML
                </button>
              )}
            </div>
          </div>

          {/* fenêtre de messagerie */}
          <div className="flex-1 min-h-[420px] lg:min-h-0 flex flex-col" style={{ background: "#ffffff", border: `1px solid ${C.line}` }}>
            <div className="shrink-0 flex items-center gap-2 h-9 px-4" style={{ background: C.beigeDark }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#ff5f57", borderRadius: 9999 }} />
              <span className="w-2.5 h-2.5" style={{ background: "#febc2e", borderRadius: 9999 }} />
              <span className="w-2.5 h-2.5" style={{ background: "#28c840", borderRadius: 9999 }} />
            </div>
            <div className="shrink-0 grid grid-cols-[64px_1fr] items-center text-sm" style={{ borderBottom: `1px solid ${C.line}` }}>
              <span className="h-10 flex items-center px-4" style={{ color: C.muted }}>
                À
              </span>
              <span className="h-10 flex items-center">
                <span className="px-2 h-6 inline-flex items-center text-xs font-semibold" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
                  Votre destinataire
                </span>
              </span>
              <span className="h-10 flex items-center px-4" style={{ color: C.muted, borderTop: `1px solid ${C.line}` }}>
                Objet
              </span>
              <span className="h-10 flex items-center font-semibold" style={{ borderTop: `1px solid ${C.line}` }}>
                Découvrez ma nouvelle signature email
              </span>
            </div>

            {tab === "preview" ? (
              <div className="ui-scroll flex-1 min-h-0 overflow-auto p-6 lg:p-8" style={{ background: "#ffffff" }}>
                <div
                  ref={previewRef}
                  tabIndex={0}
                  onKeyDown={onPreviewKeyDown}
                  onCopy={onPreviewCopy}
                  aria-label="Aperçu de la signature : cliquez puis Ctrl/Cmd+A et Ctrl/Cmd+C"
                  className={`sig-preview ui-focus inline-block max-w-full ${design.useHouseFont ? "house-font" : ""}`}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col p-4 gap-3">
                <p className="ui-hint shrink-0">
                  Usage technique : fichier .htm de signature, intégration CMS. Pour Outlook ou Gmail, passez par l'onglet Aperçu.
                  {localAssets && (
                    <span className="block text-amber-800">
                      Outil lancé en local : les icônes pointent vers {window.location.origin}, injoignable par vos destinataires. Utilisez la version en ligne.
                    </span>
                  )}
                </p>
                <textarea
                  ref={codeRef}
                  readOnly
                  value={exportHtml}
                  onClick={(e) => e.target.select()}
                  className="ui-scroll flex-1 min-h-[200px] w-full text-xs font-mono p-3 resize-none focus:outline-none"
                  style={{ border: `1px solid ${C.line}`, background: C.beige }}
                />
              </div>
            )}
          </div>

          {/* ligne d'état, hauteur fixe pour éviter les sauts */}
          <div className="shrink-0 min-h-5 text-xs flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: C.muted }}>
            {copyMsg || pngStatus ? (
              <>
                <span style={{ color: C.ink }}>{copyMsg || pngStatus}</span>
                {pngUrl && !copyMsg && (
                  <a href={pngUrl} download={`signature-${slug(details.name)}.png`} target="_blank" rel="noreferrer" className="underline">
                    Ouvrir l'image
                  </a>
                )}
              </>
            ) : uploadedButNotHosted && tab === "preview" ? (
              <span className="text-amber-800">Photo importée visible ici et dans le PNG seulement : renseignez son URL publique (étape 2) pour l'export.</span>
            ) : tab === "preview" ? (
              <span>
                Cliquez sur la signature, <strong>Ctrl/Cmd+A</strong>, <strong>Ctrl/Cmd+C</strong>, puis collez dans Outlook ou Gmail. PNG : fidèle, sans liens.
              </span>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
