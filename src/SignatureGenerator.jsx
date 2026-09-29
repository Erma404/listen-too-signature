import React, { useState, useMemo, useRef, useEffect } from "react";
import { Copy, Plus, Trash2, GripVertical, ArrowUp, ArrowDown, Save, X, ImagePlus, Download, User, Share2, LayoutTemplate, Palette, ChevronRight, ChevronLeft, FolderOpen } from "lucide-react";
import {
  ACCENT,
  FONTS,
  SOCIALS_META,
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
  { id: 3, label: "Réseaux", icon: Share2 },
  { id: 4, label: "Modèle", icon: LayoutTemplate },
  { id: 5, label: "Design", icon: Palette },
];
const SAVED_VIEW = { id: 6, label: "Enregistrées", icon: FolderOpen };

// Palette de l'interface : blanc / beige, encre noire, accent de la charte
const C = {
  ink: "#1a1a1a",
  muted: "#6f685c",
  beige: "#f6f2ea",
  beigeDark: "#ece5d8",
  line: "#e7e0d3",
  lineStrong: "#cfc6b5",
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
const emptySocials = Object.fromEntries(SOCIALS_META.map((s) => [s.key, { enabled: false, url: "" }]));
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
    socials: Object.fromEntries(SOCIALS_META.map((m) => [m.key, { enabled: false, url: "", ...(s.socials?.[m.key] || {}) }])),
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

function SectionTitle({ children }) {
  return <h3 className="text-xl font-semibold tracking-tight mb-5">{children}</h3>;
}

function Field({ label, children }) {
  return (
    <label className="block mb-3.5">
      <span className="block text-xs font-medium mb-1.5" style={{ color: C.muted }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls = "w-full min-w-0 rounded-md px-3 py-2.5 text-sm bg-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#D3EF9D] focus:border-neutral-800";
const inputStyle = { border: `1px solid ${C.lineStrong}`, color: C.ink };

export default function SignatureGenerator() {
  const initial = useMemo(() => normalizeSnapshot(readStorage(DRAFT_KEY) || {}), []);
  const [step, setStep] = useState(1);
  const [details, setDetails] = useState(initial.details);
  const [images, setImages] = useState(initial.images);
  const [socials, setSocials] = useState(initial.socials);
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
    writeStorage(DRAFT_KEY, { details, images, socials, template, design });
  }, [details, images, socials, template, design]);

  const fallbackPhoto = assetUrl(FALLBACK_PHOTO);
  const exportHtml = useMemo(
    () => buildSignatureHtml({ details, socials, template, design, photoSrc: images.photoUrl.trim() || fallbackPhoto }),
    [details, images.photoUrl, socials, template, design, fallbackPhoto]
  );
  // L'aperçu montre la photo importée ; la copie (Ctrl+C ou bouton) envoie toujours exportHtml.
  const previewHtml = useMemo(
    () => buildSignatureHtml({ details, socials, template, design, photoSrc: images.photoPreview || images.photoUrl.trim() || fallbackPhoto }),
    [details, images, socials, template, design, fallbackPhoto]
  );
  const plainText = useMemo(() => buildSignaturePlainText({ details, socials, design }), [details, socials, design]);
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

  function toggleSocial(key) {
    setSocials((s) => ({ ...s, [key]: { ...s[key], enabled: !s[key].enabled } }));
  }
  function setSocialUrl(key, url) {
    setSocials((s) => ({ ...s, [key]: { ...s[key], url } }));
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
      const { blob, photoMissing } = await renderSignaturePng({ details, images, socials, template, design });
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
    const snapshot = { details, images, socials, template, design };
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
    setSocials(s.socials);
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
        className="shrink-0 flex lg:flex-col items-center justify-center gap-1.5 lg:gap-1 px-3 py-2 lg:px-0 lg:py-0 lg:w-full lg:h-[76px] rounded-lg lg:rounded-none text-xs lg:text-[11px] font-medium whitespace-nowrap transition-colors"
        style={{
          background: active ? C.beige : "transparent",
          color: active ? C.ink : C.muted,
          boxShadow: active ? `inset 3px 0 0 ${ACCENT}` : "none",
        }}
      >
        <Icon size={18} />
        {s.label}
      </button>
    );
  };

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex flex-col" style={{ background: C.beige, color: C.ink, fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      <style>{`input[type="checkbox"] { accent-color: ${C.ink}; }`}</style>

      {/* barre du haut */}
      <header className="shrink-0 bg-white" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={fallbackPhoto} alt="" className="w-7 h-7" />
            <span className="font-semibold tracking-tight">Listen too</span>
            <span className="ml-1 text-[10px] uppercase tracking-wide font-semibold rounded px-1.5 py-0.5" style={{ background: ACCENT }}>
              Outils
            </span>
          </div>
          <p className="text-xs hidden sm:block" style={{ color: C.muted }}>
            Générateur de signatures email
          </p>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* barre des étapes */}
        <nav className="shrink-0 bg-white flex lg:flex-col gap-1 lg:gap-0 overflow-x-auto p-2 lg:p-0 lg:w-[88px]" style={{ borderRight: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
          {STEPS.map(railButton)}
          <div className="hidden lg:block mx-4 my-2" style={{ borderTop: `1px solid ${C.line}` }} />
          {railButton(SAVED_VIEW)}
        </nav>

        {/* panneau formulaire : défile seul */}
        <section className="shrink-0 bg-white flex flex-col lg:w-[380px] lg:min-h-0" style={{ borderRight: `1px solid ${C.line}` }}>
          <div className="flex-1 lg:min-h-0 lg:overflow-y-auto px-6 pt-6 pb-4">
            <p className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: C.muted }}>
              {isSavedView ? "Mes signatures" : `Étape ${step} : ${STEPS[stepIndex].label}`}
            </p>

            {step === 1 && (
              <div>
                <SectionTitle>Ajoutez vos informations</SectionTitle>
                <Field label="Nom complet">
                  <input className={inputCls} style={inputStyle} value={details.name} onChange={(e) => updateDetail("name", e.target.value)} placeholder="Prénom Nom" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fonction">
                    <input className={inputCls} style={inputStyle} value={details.title} onChange={(e) => updateDetail("title", e.target.value)} placeholder="Lead Product Owner" />
                  </Field>
                  <Field label="Entité">
                    <input className={inputCls} style={inputStyle} value={details.dept} onChange={(e) => updateDetail("dept", e.target.value)} />
                  </Field>
                  <Field label="Téléphone fixe">
                    <input className={inputCls} style={inputStyle} type="tel" value={details.phone} onChange={(e) => updateDetail("phone", e.target.value)} placeholder="01 23 45 67 89" />
                  </Field>
                  <Field label="Mobile">
                    <input className={inputCls} style={inputStyle} type="tel" value={details.mobile} onChange={(e) => updateDetail("mobile", e.target.value)} placeholder="06 12 34 56 78" />
                  </Field>
                </div>
                <Field label="Email">
                  <input className={inputCls} style={inputStyle} type="email" value={details.email} onChange={(e) => updateDetail("email", e.target.value)} placeholder="prenom.nom@listen-too.com" />
                </Field>
                <Field label="Site web">
                  <input className={inputCls} style={inputStyle} value={details.website} onChange={(e) => updateDetail("website", e.target.value)} />
                </Field>
                <Field label="Adresse">
                  <input className={inputCls} style={inputStyle} value={details.address} onChange={(e) => updateDetail("address", e.target.value)} placeholder="Paris, France" />
                </Field>
              </div>
            )}

            {step === 2 && (
              <div>
                <SectionTitle>Votre photo</SectionTitle>
                <Field label="Importer une photo (aperçu et PNG uniquement)">
                  <span className="flex items-center gap-2 rounded-md px-3 py-3 text-sm cursor-pointer hover:bg-neutral-50" style={{ border: `1px dashed ${C.lineStrong}`, color: C.muted }}>
                    <ImagePlus size={16} />
                    Choisir un fichier (max 5 Mo, recadré en carré)
                    <input type="file" accept="image/*" className="hidden" onChange={onPhotoUpload} />
                  </span>
                </Field>
                {photoError && <p className="text-xs text-red-600 -mt-2 mb-3">{photoError}</p>}
                {images.photoPreview && (
                  <div className="flex items-center gap-3 mb-4">
                    <img src={images.photoPreview} alt="" className="w-12 h-12" />
                    <button onClick={() => setImages((im) => ({ ...im, photoPreview: null }))} className="text-xs underline" style={{ color: C.muted }}>
                      Retirer la photo importée
                    </button>
                  </div>
                )}
                <Field label="URL publique de la photo (utilisée pour l'export)">
                  <input
                    className={inputCls}
                    style={inputStyle}
                    value={images.photoUrl}
                    onChange={(e) => setImages((im) => ({ ...im, photoUrl: e.target.value }))}
                    placeholder="https://listen-too.com/team/prenom-nom.jpg"
                  />
                </Field>
                <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
                  Pour que la photo s'affiche vraiment dans les emails (Outlook, Gmail...), elle doit être hébergée sur une URL publique : l'image importée
                  ci-dessus ne sert qu'à l'aperçu et au PNG. Utilisez une image carrée d'environ 240 × 240 px. Sans photo, le logo Listen too s'affiche
                  automatiquement.
                </p>
              </div>
            )}

            {step === 3 && (
              <div>
                <SectionTitle>Vos réseaux sociaux</SectionTitle>
                {SOCIALS_META.map((s) => (
                  <div key={s.key} className="mb-2 rounded-md px-3 py-2.5" style={{ border: `1px solid ${C.line}` }}>
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={socials[s.key].enabled} onChange={() => toggleSocial(s.key)} />
                      {s.label}
                    </label>
                    {socials[s.key].enabled && (
                      <input
                        className={inputCls + " mt-2"}
                        style={inputStyle}
                        value={socials[s.key].url}
                        onChange={(e) => setSocialUrl(s.key, e.target.value)}
                        placeholder={`https://${s.key === "twitter" ? "x" : s.key}.com/...`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {step === 4 && (
              <div>
                <SectionTitle>Choisissez un modèle</SectionTitle>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    ["horizontal", "Horizontal avec photo", "Photo carrée (ou logo Listen too) à gauche, infos à droite."],
                    ["compact", "Compact sans photo", "Texte seul, sans image de profil. Le plus sûr toutes messageries."],
                  ].map(([id, title, desc]) => (
                    <button
                      key={id}
                      onClick={() => setTemplate(id)}
                      className="text-left rounded-lg p-3"
                      style={{ border: template === id ? `2px solid ${C.ink}` : `1px solid ${C.line}`, background: template === id ? C.beige : "#ffffff" }}
                    >
                      <p className="text-sm font-medium mb-1">{title}</p>
                      <p className="text-xs" style={{ color: C.muted }}>
                        {desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 5 && (
              <div>
                <SectionTitle>Personnalisez le design</SectionTitle>
                <Field label="Police (utilisée dans le HTML copié pour Outlook / Gmail)">
                  <select className={inputCls} style={inputStyle} value={design.font} onChange={(e) => setDesign((d) => ({ ...d, font: e.target.value }))}>
                    {FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="flex items-start gap-2 text-sm mb-4">
                  <input type="checkbox" checked={design.useHouseFont} onChange={(e) => setDesign((d) => ({ ...d, useHouseFont: e.target.checked }))} className="mt-0.5" />
                  <span>
                    Aperçu fidèle à la maquette (police WT Gothic)
                    <span className="block text-xs mt-0.5" style={{ color: C.muted }}>
                      Affiche WT Gothic ici et dans le PNG. Ce qui est copié pour Outlook / Gmail utilise toujours la police web-safe choisie ci-dessus, car
                      WT Gothic ne peut pas s'afficher dans les emails.
                    </span>
                  </span>
                </label>

                <div className="mb-4">
                  <span className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
                    Ordre des champs de contact
                  </span>
                  <p className="text-xs mb-2" style={{ color: C.muted }}>
                    Le téléphone (fixe et mobile) reste toujours juste sous la fonction.
                  </p>
                  <ul>
                    {design.blockOrder.map((k, i) => (
                      <li
                        key={k}
                        draggable
                        onDragStart={() => setDragIdx(i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(i)}
                        className="flex items-center justify-between rounded-md px-2.5 py-2 mb-1.5 text-sm cursor-grab"
                        style={{ border: `1px solid ${C.line}`, background: C.beige }}
                      >
                        <span className="flex items-center gap-2">
                          <GripVertical size={14} style={{ color: C.muted }} />
                          {BLOCK_META[k].label}
                        </span>
                        <span className="flex gap-1">
                          <button onClick={() => moveBlock(i, -1)} disabled={i === 0} aria-label="Monter" className="p-1 hover:bg-white rounded disabled:opacity-30">
                            <ArrowUp size={12} />
                          </button>
                          <button onClick={() => moveBlock(i, 1)} disabled={i === design.blockOrder.length - 1} aria-label="Descendre" className="p-1 hover:bg-white rounded disabled:opacity-30">
                            <ArrowDown size={12} />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="block text-xs font-medium" style={{ color: C.muted }}>
                      Champs personnalisés
                    </span>
                    <button onClick={addCustomField} className="text-xs flex items-center gap-1 font-medium hover:underline">
                      <Plus size={12} /> Ajouter
                    </button>
                  </div>
                  {design.customFields.map((f) => (
                    <div key={f.id} className="flex gap-1.5 mb-1.5">
                      <input className={inputCls + " w-28"} style={inputStyle} value={f.label} onChange={(e) => updateCustomField(f.id, "label", e.target.value)} placeholder="Label" />
                      <input className={inputCls} style={inputStyle} value={f.value} onChange={(e) => updateCustomField(f.id, "value", e.target.value)} placeholder="Valeur" />
                      <button onClick={() => removeCustomField(f.id)} aria-label="Supprimer" className="px-1 hover:text-red-600" style={{ color: C.muted }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm mb-2">
                    <input type="checkbox" checked={design.qr.enabled} onChange={(e) => setDesign((d) => ({ ...d, qr: { ...d.qr, enabled: e.target.checked } }))} />
                    QR code
                  </label>
                  {design.qr.enabled && (
                    <>
                      <input
                        className={inputCls}
                        style={inputStyle}
                        value={design.qr.url}
                        onChange={(e) => setDesign((d) => ({ ...d, qr: { ...d.qr, url: e.target.value } }))}
                        placeholder={normalizeUrl(details.website) || "https://listen-too.com/prendre-rdv"}
                      />
                      <p className="text-xs mt-1.5" style={{ color: C.muted }}>
                        {qrFallsBackToWebsite
                          ? details.website.trim()
                            ? "Laissé vide : le QR code pointe vers le site web renseigné à l'étape 1."
                            : "Renseignez un lien ici ou un site web à l'étape 1."
                          : "Le QR code est généré automatiquement à partir de ce lien."}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {isSavedView && (
              <div>
                <SectionTitle>Signatures enregistrées</SectionTitle>
                {editingId && (
                  <p className="text-xs mb-2" style={{ color: C.muted }}>
                    Modification de « {saved.find((s) => s.id === editingId)?.name} » : Enregistrer met à jour cette signature au lieu d'en créer une
                    nouvelle.
                  </p>
                )}
                <div className="flex flex-col gap-2 mb-4">
                  <input className={inputCls} style={inputStyle} value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Nom de cette signature" />
                  <div className="flex gap-2">
                    <button onClick={saveCurrent} className="flex-1 flex items-center justify-center gap-1.5 text-sm px-3 py-2 rounded-md text-white font-medium" style={{ background: C.ink }}>
                      <Save size={14} /> {editingId ? "Enregistrer les modifications" : "Enregistrer"}
                    </button>
                    {editingId && (
                      <button onClick={newSignature} className="text-sm px-3 py-2 rounded-md" style={{ border: `1px solid ${C.lineStrong}` }}>
                        Nouvelle
                      </button>
                    )}
                  </div>
                </div>
                {saved.length === 0 ? (
                  <p className="text-xs" style={{ color: C.muted }}>
                    Aucune signature enregistrée pour l'instant.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {saved.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm"
                        style={{ border: `1px solid ${editingId === item.id ? C.ink : C.line}`, background: editingId === item.id ? C.beige : "#ffffff" }}
                      >
                        <span className="truncate">{item.name}</span>
                        <span className="flex gap-2 text-xs shrink-0" style={{ color: C.muted }}>
                          <button onClick={() => loadSaved(item)} className="hover:text-black">
                            Modifier
                          </button>
                          <button onClick={() => duplicateSaved(item)} className="hover:text-black">
                            Dupliquer
                          </button>
                          <button onClick={() => deleteSaved(item.id)} aria-label="Supprimer" className="hover:text-red-600">
                            <X size={14} />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className={`text-xs mt-3 ${storageError ? "text-amber-700" : ""}`} style={storageError ? {} : { color: C.muted }}>
                  {storageError ||
                    "Ces signatures sont enregistrées dans ce navigateur, sur cet appareil uniquement : elles ne sont pas partagées avec vos collègues ni synchronisées entre ordinateurs."}
                </p>
              </div>
            )}
          </div>

          {!isSavedView && (
            <div className="shrink-0 flex items-center justify-between px-6 py-4" style={{ borderTop: `1px solid ${C.line}` }}>
              <button onClick={goPrev} disabled={stepIndex === 0} className="flex items-center gap-1 text-sm disabled:opacity-0" style={{ color: C.muted }}>
                <ChevronLeft size={14} /> Précédent
              </button>
              {stepIndex < STEPS.length - 1 ? (
                <button onClick={goNext} className="flex items-center gap-1 text-sm font-medium px-4 py-2 rounded-md text-white" style={{ background: C.ink }}>
                  Suivant <ChevronRight size={14} />
                </button>
              ) : (
                <button onClick={() => setStep(SAVED_VIEW.id)} className="flex items-center gap-1 text-sm font-medium px-4 py-2 rounded-md text-white" style={{ background: C.ink }}>
                  <Save size={14} /> Enregistrer
                </button>
              )}
            </div>
          )}
        </section>

        {/* aperçu : défile seul, toujours visible à côté des étapes */}
        <main className="flex-1 min-w-0 lg:min-h-0 lg:overflow-y-auto px-4 sm:px-8 pt-4 sm:pt-8">
          <div className="max-w-3xl mx-auto">
            <div className="bg-white rounded-xl overflow-hidden mb-5" style={{ border: `1px solid ${C.line}`, boxShadow: "0 1px 3px rgba(60,50,30,0.06)" }}>
              <div className="flex items-center gap-1.5 px-4 py-3" style={{ background: C.beigeDark }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#ff5f57" }} />
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#febc2e" }} />
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#28c840" }} />
              </div>
              <div className="px-4 sm:px-6 pt-4 pb-4" style={{ borderBottom: `1px solid ${C.line}` }}>
                <div className="flex items-center gap-2 text-sm mb-2">
                  <span style={{ color: C.muted }}>À :</span>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: ACCENT }}>
                    Votre destinataire
                  </span>
                </div>
                <p className="text-sm font-semibold">Objet : Découvrez ma nouvelle signature email</p>
              </div>
              <div className="p-4 sm:p-6">
                <div className="h-2 rounded w-full mb-2" style={{ background: C.beigeDark }} />
                <div className="h-2 rounded w-2/3 mb-6" style={{ background: C.beigeDark }} />

                <div className="flex items-center gap-4 mb-4" style={{ borderBottom: `1px solid ${C.line}` }}>
                  {[
                    ["preview", "Aperçu"],
                    ["code", "Code HTML"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setTab(id)}
                      className={`text-sm pb-2 -mb-px ${tab === id ? "border-b-2 font-medium" : ""}`}
                      style={tab === id ? { borderColor: C.ink } : { color: C.muted }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {tab === "preview" ? (
                  <div>
                    <div
                      ref={previewRef}
                      tabIndex={0}
                      onKeyDown={onPreviewKeyDown}
                      onCopy={onPreviewCopy}
                      className={`rounded p-4 bg-white overflow-x-auto focus:outline-none focus:ring-2 ${design.useHouseFont ? "house-font" : ""}`}
                      style={{ border: `1px dashed ${C.line}`, "--tw-ring-color": ACCENT }}
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                    <p className="text-xs mt-2" style={{ color: C.muted }}>
                      Pour Outlook, Gmail, etc. : cliquez dans le cadre, <strong>Ctrl/Cmd+A</strong> puis <strong>Ctrl/Cmd+C</strong>, et collez directement dans
                      l'éditeur de signature. Ou utilisez le bouton « Copier la signature ».
                    </p>
                    {uploadedButNotHosted && (
                      <p className="text-xs text-amber-700 mt-2">
                        La photo importée n'apparaît qu'ici et dans le PNG. Dans la signature copiée, le logo Listen too la remplace tant que l'URL publique de
                        la photo (étape 2) n'est pas renseignée.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-xs mb-2" style={{ color: C.muted }}>
                      Usage technique (fichier .htm de signature, intégration CMS...). Ce code ne se colle pas dans l'éditeur visuel d'Outlook ou Gmail :
                      utilisez l'onglet Aperçu pour ça.
                    </p>
                    {localAssets && (
                      <p className="text-xs text-amber-700 mb-2">
                        Outil lancé en local : les icônes et le logo pointent vers {window.location.origin}, qui n'est pas joignable par vos destinataires.
                        Utilisez la version en ligne pour une signature réelle.
                      </p>
                    )}
                    <textarea
                      ref={codeRef}
                      readOnly
                      value={exportHtml}
                      onClick={(e) => e.target.select()}
                      rows={10}
                      className="w-full text-xs font-mono rounded p-3"
                      style={{ border: `1px solid ${C.line}`, background: C.beige }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 -mx-4 sm:-mx-8 px-4 sm:px-8 pt-4 pb-4" style={{ background: `linear-gradient(to bottom, transparent, ${C.beige} 30%)` }}>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {tab === "preview" ? (
                <button onClick={copySignature} className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-md text-white font-medium hover:opacity-90" style={{ background: C.ink }}>
                  <Copy size={14} /> Copier la signature
                </button>
              ) : (
                <button onClick={copyHtml} className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-md text-white font-medium hover:opacity-90" style={{ background: C.ink }}>
                  <Copy size={14} /> Copier le HTML
                </button>
              )}
              <button onClick={downloadPng} className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-md bg-white hover:bg-neutral-50" style={{ border: `1px solid ${C.lineStrong}` }}>
                <Download size={14} /> Télécharger en PNG
              </button>
              {pngUrl && (
                <a href={pngUrl} download={`signature-${slug(details.name)}.png`} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: C.muted }}>
                  Ouvrir / enregistrer l'image
                </a>
              )}
            </div>
            <div className="text-center mt-3 space-y-1">
              {copyMsg && <p className="text-xs font-medium">{copyMsg}</p>}
              {pngStatus && <p className="text-xs">{pngStatus}</p>}
              <p className="text-xs" style={{ color: C.muted }}>
                Le PNG reproduit la maquette au pixel près (police WT Gothic), mais c'est une image : ses liens ne sont pas cliquables.
              </p>
            </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
