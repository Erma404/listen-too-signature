# Générateur de signatures email — Listen too

Outil web self-service pour que chaque collaborateur du cabinet Listen too crée sa signature email conforme à la charte, sans rien installer.

## Pourquoi cet outil

Les maquettes Figma validées ne s'importent pas proprement dans Outlook : Outlook (Windows) affiche le HTML avec le moteur de Word, pas avec un navigateur, et ignore le CSS moderne (flexbox, grid, polices personnalisées). L'outil génère donc un HTML **en tableaux imbriqués avec styles en ligne uniquement**, seule méthode fiable sur Outlook, Gmail, Apple Mail et mobile.

- Couleur d'accent unique : `#D3EF9D`
- Police de la maquette : **WT Gothic**, utilisée uniquement pour l'aperçu à l'écran et l'export PNG. Le HTML exporté utilise toujours une police web-safe (Arial, Georgia...), car aucune police personnalisée ne s'affiche dans un client mail.

## Fonctionnement

Éditeur en 4 étapes, côte à côte avec l'aperçu live (aucun scroll de page) :

1. **Détails** : nom, fonction, mobile, email (format `cdupere@listen-too.com` : initiale du prénom + nom), site web, adresse
2. **Photo** : import local (aperçu et PNG uniquement, recadré en carré) + URL publique de la photo (utilisée pour l'export réel). Sans photo, le logo Listen too (icône blanche sur carré noir) s'affiche automatiquement.
3. **Modèle** : horizontal avec photo, ou compact sans photo (le plus sûr toutes messageries)
4. **Design** : police web-safe du HTML exporté, champs personnalisés, QR code (généré automatiquement depuis le lien saisi, ou le site web si vide), ordre des champs de contact (le mobile reste fixe sous la fonction)

Onglet **Enregistrées** : sauvegarder, modifier, dupliquer, supprimer des signatures.

### Sorties

| Sortie | Usage |
| --- | --- |
| **Aperçu** | Cliquer dans le cadre, `Ctrl/Cmd+A` puis `Ctrl/Cmd+C` (ou bouton « Copier la signature »), coller dans l'éditeur de signature Outlook / Gmail. La copie contient toujours le HTML d'export (police web-safe), même si l'écran affiche WT Gothic. |
| **Code HTML** | Code source + bouton « Copier le HTML », pour un usage technique (fichier `.htm` de signature Outlook, intégration CMS). |
| **Télécharger en PNG** | Image fidèle à la maquette avec la vraie police WT Gothic, à insérer comme image dans la signature. Rendu au pixel près, mais sans liens cliquables. |

### Choix techniques côté signature

- Tableaux `role="presentation"`, styles en ligne, attributs `bgcolor` / `width` doublés pour Outlook
- Fond blanc forcé sur toute la signature (limite l'inversion des couleurs en thème sombre)
- Photo carrée 72 × 72 px, sans coin arrondi (Outlook Windows ignore `border-radius`). Le logo Listen too de repli a des coins de 8 px intégrés à l'image (`public/sig/logo-listen-too.png`), donc visibles partout
- Icônes et logo servis en **URL absolue** depuis le site déployé (`/sig/*.png`) : Gmail supprime les images `data:` en base64 et Outlook les bloque souvent
- QR code dans le HTML : image générée par `api.qrserver.com` (aucune configuration). Dans le PNG : QR généré localement (bibliothèque `qrcode`)

## Lancer en local

Prérequis : Node.js 18 ou plus.

```bash
npm install
npm run dev        # http://localhost:5173
```

Build de production :

```bash
npm run build      # génère dist/
npm run preview    # sert dist/ en local
```

Variable optionnelle `VITE_ASSET_BASE_URL` : URL publique qui héberge `sig/` (icônes, logo) si elle diffère de l'URL de l'outil, par exemple `https://listen-too.com/signature-assets/`.

## Déploiement

GitHub Pages, via le workflow `.github/workflows/deploy.yml` : chaque push sur `main` rebuild et redéploie automatiquement. Le site est servi sous `/<nom-du-repo>/` (variable `BASE_PATH` fournie par le workflow).

Réglage unique dans le repo : Settings > Pages > Source = **GitHub Actions**.

## Donner accès au repo

```bash
# lecture/écriture (push)
gh api -X PUT repos/Erma404/listen-too-signature/collaborators/<login-github> -f permission=push
# lecture seule
gh api -X PUT repos/Erma404/listen-too-signature/collaborators/<login-github> -f permission=pull
```

La personne reçoit une invitation à accepter (email ou https://github.com/notifications).

## Tester

1. Remplir les 4 étapes et vérifier que l'aperçu se met à jour à chaque modification.
2. **Outlook / Gmail** : depuis la **version en ligne** (pas localhost, sinon les icônes pointent vers votre machine), onglet Aperçu, « Copier la signature », puis coller dans :
   - Outlook : Paramètres > Comptes > Signatures
   - Gmail : Paramètres > Voir tous les paramètres > Signature
   Envoyer un email de test vers un compte Outlook, un compte Gmail et un mobile.
3. **Thème sombre** : ouvrir l'email reçu en mode sombre et vérifier que la signature reste sur fond blanc.
4. **PNG** : « Télécharger en PNG » et vérifier la police WT Gothic.
5. **Sauvegarde** : enregistrer une signature, recharger la page, vérifier qu'elle est toujours listée.

## Limites connues

- **Stockage local non partagé** : les signatures sont enregistrées dans le `localStorage` du navigateur. Elles sont propres à l'appareil et au navigateur : pas de compte, pas de backend, pas de base partagée. Vider les données du navigateur les supprime.
- **PNG = image statique** : rendu fidèle à la maquette, mais aucun lien cliquable (email, mobile, site, QR). Certains clients bloquent aussi les images par défaut.
- **Photo** : l'import local ne sert qu'à l'aperçu et au PNG. Pour l'export réel, la photo doit être hébergée sur une URL publique (idéalement sur listen-too.com). Si cette URL n'autorise pas le CORS, le PNG utilise le logo à la place (importer la photo en local pour l'inclure).
- **Images hébergées par l'outil** : les icônes et le logo de la signature sont chargés depuis l'URL de déploiement. Si l'outil change d'adresse, les signatures déjà installées perdent leurs icônes. Pour un usage pérenne, héberger `public/sig/` sur listen-too.com et renseigner `VITE_ASSET_BASE_URL`.
- **QR code** : dépend du service tiers `api.qrserver.com` pour le HTML exporté.
- **Coins arrondis** de la pastille de fonction : visibles sur Gmail / Apple Mail, carrés sur Outlook Windows (comportement attendu).
- **Police WT Gothic** : police commerciale, fichiers dans `public/fonts/`. Vérifier que la licence autorise une diffusion web (webfont) avant toute mise en ligne publique.

## Structure

```
src/
  signature.js          génération du HTML de signature (tableaux + inline)
  png.js                rendu PNG sur canvas (WT Gothic)
  SignatureGenerator.jsx interface (étapes, aperçu, sauvegardes)
public/
  fonts/                WT Gothic (aperçu + PNG uniquement)
  sig/                  icônes et logo servis aux clients mail
```
