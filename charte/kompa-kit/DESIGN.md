# Kompa Ingénierie — charte graphique (pour Claude)

Micro-entreprise d'assistance à maîtrise d'ouvrage (AMO) technique BTP, à destination des communes, intercommunalités et établissements publics.
Dirigeant : Sébastien De Raedt (EI).
**Famille de marques** : Kompa (le conseil) et Kontrol (l'outil de suivi de chantier) partagent l'ardoise, les neutres, la police IBM Plex et la construction de l'icône. Chacun garde son signe et son accent : **rouille pour Kompa**, violet pour Kontrol.

Fichiers fournis :
- `tokens.css` : toutes les variables (couleurs, typo, rayons, espacements). **Source de vérité : ne jamais coder une couleur en dur.**
- `logos/svg/` : logos vectoriels (texte vectorisé, aucune police requise).
- `logos/png/` : mêmes logos en PNG transparent, pour Word, PowerPoint et la messagerie.

---

## 1. Règles non négociables

1. Une seule branche du compas est en couleur (la droite). Jamais les deux.
2. Rouille `#B4460E` sur fond clair ; **rouille clair `#E2733A` sur fond sombre**. Jamais de violet (réservé à Kontrol).
3. Police unique : IBM Plex Sans (texte) + IBM Plex Mono (références et données). Repli : Arial / Consolas.
4. Contraste texte ≥ 4.5:1. Les couples de la section 3 le respectent ; n'en inventer aucun autre.
5. Pas de dégradé, d'ombre portée sur le logo, d'emoji, de photo d'illustration générique ni de pictogramme décoratif.
6. Ne jamais déformer, incliner, recolorer ou redessiner le logo : utiliser les fichiers fournis.
7. Les informations manquantes s'écrivent entre crochets : `[téléphone]`, `[SIRET]`. Ne rien inventer (chiffres, références, clients).

## 2. Logo

| Fichier | Usage |
|---|---|
| `kompa-logo.svg` / `-1600.png` | Logo principal, fonds clairs (papier, blanc, brume) |
| `kompa-logo-negatif.svg` / `-1600.png` | Fonds ardoise ou encre |
| `kompa-logo-noir.svg` / `-1600.png` | Impression noir et blanc, tampon, fax |
| `kompa-logo-blanc.svg` | Gravure, marquage blanc sur fond foncé uni |
| `kompa-symbole.svg` / `-negatif` | Symbole seul, quand le nom figure déjà à côté |
| `kompa-icone.svg` / `-512`, `-192`, `-180.png` | Avatar, application, réseaux (carré ardoise, rayon 22 %) |
| `kompa-icone-maskable-512.png` | Icône PWA « maskable » (marge de sécurité 10 %) |
| `kompa-favicon-32.png` / `kompa-icone-petit.svg` | Favicon et formats < 32 px (anneau et traverse retirés) |
| `kompa-signature-mail-80.png` | Icône de la signature mail (affichée en 40 px) |

- **Zone de protection** : un espace libre égal au diamètre de l'anneau tout autour.
- **Taille minimale** : 30 mm (impression) ou 160 px (écran) de large pour le logo complet ; en dessous, symbole ou icône seuls.
- **Placement** : en haut à gauche des documents ; jamais centré dans un en-tête de courrier.

## 3. Couleurs

| Nom | Hex | RVB | Rôle |
|---|---|---|---|
| Encre [commun] | `#0B1220` | 11 18 32 | Texte courant |
| Ardoise [commun] | `#1B263B` | 27 38 59 | Logo, titres, fonds sombres (couvertures, verso de carte) |
| Rouille | `#B4460E` | 180 70 14 | Accent sur fond clair : surtitres, mots d'accent, filets d'étape |
| Rouille clair | `#E2733A` | 226 115 58 | Accent sur fond sombre uniquement |
| Papier | `#F6F5F1` | 246 245 241 | Fond des plaquettes et pages de présentation |
| Brume [commun] | `#EEF1F6` | 238 241 246 | Bandeaux, aplats, en-têtes de tableau |
| Gris [commun] | `#4A5568` | 74 85 104 | Texte secondaire, légendes, pieds de page |
| Filet [commun] | `#D5DBE5` | 213 219 229 | Traits fins, bordures de tableau |
| Texte inverse | `#EEF2F8` | 238 242 248 | Texte sur ardoise |
| Texte inverse 2 | `#A3B0C4` | 163 176 196 | Texte secondaire sur ardoise |

Couples texte/fond autorisés : encre, ardoise, gris ou rouille sur papier, blanc ou brume ; texte inverse, texte inverse 2 ou rouille clair sur ardoise ou encre.
Proportions indicatives : 70 % fond clair, 20 % ardoise/encre, 10 % maximum de rouille.
Courrier et documents Word : fond blanc ; le papier `#F6F5F1` est réservé aux supports de présentation.

## 4. Typographie

- **IBM Plex Sans** — titres 700, intertitres 600, texte 400, logo 700.
- **IBM Plex Mono 500** — références et données : n° de pièce (KOMPA-2027-001), article (CCTP · LOT 02 · §3.4.2), indices, dates, numéros d'étape (01 à 06), SIRET.

| Niveau | Écran / plaquette | Word | Réglages |
|---|---|---|---|
| Accroche | 68 px | 32 pt | Sans 700, interlettrage −1,5 %, ardoise ; dernier mot ou membre de phrase en rouille |
| Titre 1 | 40 px | 16 pt | Sans 700, ardoise |
| Titre 2 | 28 px | 13 pt | Sans 700, ardoise |
| Titre 3 | 20 px | 11 pt | Sans 600, encre |
| Surtitre | 13 px | 9 pt | Sans 600, CAPITALES, interlettrage 14 %, rouille |
| Texte | 16 px | 10 pt | Sans 400, interligne 1,55 (Word : 1,3), encre |
| Légende | 14 px | 8,5 pt | Sans 400, gris |
| Référence | 14 px | 9 pt | Mono 500, ardoise ou gris |

Mot-symbole : « KOMPA » en Sans 700, capitales, interlettrage 9 % ; « INGÉNIERIE » en Sans 500, capitales, interlettrage 34 %, gris.

## 5. Éléments graphiques

- **Surtitre** au-dessus des titres : `COLLECTIVITÉS · ÉTABLISSEMENTS PUBLICS` (rouille, capitales, séparateur « · »).
- **Filet de section** : 2 px ardoise au-dessus d'un bloc (colonnes d'arguments).
- **Filet d'étape** : 4 px rouille au-dessus d'un numéro mono + libellé ; sert aux processus (Faisabilité → Estimation → CCTP et DPGF → Analyse des offres → Suivi de chantier → Réception).
- **Bandeau** : aplat brume pleine largeur en pied de page de plaquette, qui porte contacts et processus.
- **Repère d'en-tête** : trait rouille 36 × 3 px sous le logo d'un courrier.
- **Tableaux** : en-tête fond brume, texte ardoise 600 ; filets `#D5DBE5` 1 px (0,5 pt) horizontaux seulement ; pas de trame alternée ; colonnes de références et montants en mono, montants alignés à droite.
- **Rayons** : 4 px (tableaux, champs), 12 px (cartes), 16 px (blocs) ; icône 22 %.

## 6. Gabarits

**Courrier A4** (fond blanc, marges 20 mm)
- En-tête : logo principal 30 mm de large à gauche ; à droite, en mono 7,5 pt gris : nom, adresse, téléphone · e-mail ; trait rouille 36 × 3 px dessous.
- Destinataire calé à droite (à partir de 110 mm), référence `Réf. KOMPA-AAAA-NNN` et lieu/date en mono, objet en Sans 600.
- Pied de page, filet fin + mono 7 pt gris, centré :
  `Kompa Ingénierie — Sébastien De Raedt EI · SIRET [n°] · TVA non applicable, art. 293 B du CGI`

**Page de garde d'un livrable** (AVP, estimation, CCTP, rapport d'analyse, CR)
- 60 % haut : aplat ardoise ; logo négatif en haut à gauche ; surtitre mono rouille clair (`AVANT-PROJET · NOTICE TECHNIQUE`) ; titre de l'opération Sans 700 texte inverse ; maître d'ouvrage et commune en texte inverse 2.
- Bande rouille 5 px.
- Bas blanc : cartouche en mono (Référence, Indice, Date, Rédacteur) avec filets fins.
- Pièces de DCE : si le maître d'ouvrage impose son gabarit, il prime ; Kompa n'apparaît alors qu'en page de garde et en pied de page.

**Documents Word / PowerPoint**
- Styles Word : Titre 1/2/3, Normal, Légende selon la section 4 ; numérotation des titres 1 / 1.1 / 1.1.1.
- En-tête : symbole 8 mm + « KOMPA INGÉNIERIE » ; pied de page : référence et indice en mono à gauche, « page X / Y » à droite.
- PowerPoint : fond blanc ou papier, titre ardoise, un seul accent rouille par diapositive, couverture et conclusion sur ardoise.

**Carte de visite 85 × 55 mm**
- Recto, fond papier : logo, nom Sans 600, « Assistance à maîtrise d'ouvrage · Ingénierie BTP », contacts en mono, bande rouille 4 px en pied.
- Verso, fond ardoise : symbole négatif centré, accroche « Vos travaux, *bien cadrés.* » (seconde partie en rouille clair).

**Signature mail** (HTML, texte réel, seule l'icône est une image)
```html
<table cellpadding="0" cellspacing="0" style="font-family:'IBM Plex Sans',Arial,sans-serif;color:#0B1220">
  <tr>
    <td style="padding-right:12px;vertical-align:top">
      <img src="[URL kompa-signature-mail-80.png]" width="40" height="40" alt="Kompa Ingénierie">
    </td>
    <td style="border-left:2px solid #B4460E;padding-left:12px">
      <div style="font-size:14px;font-weight:600">Sébastien De Raedt</div>
      <div style="font-size:12px;color:#4A5568">Assistance à maîtrise d'ouvrage</div>
      <div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#1B263B">KOMPA INGÉNIERIE</div>
      <div style="font-size:11px;color:#4A5568;font-family:'IBM Plex Mono',Consolas,monospace;padding-top:4px">[téléphone] · [site web]</div>
    </td>
  </tr>
</table>
```

## 7. Ton rédactionnel

- Vouvoiement, phrases courtes, vocabulaire de l'acheteur public (maître d'ouvrage, consultation, pièces du DCE, réception).
- Concret : livrables, étapes, délais. Aucun superlatif, aucun chiffre ou référence client non fourni.
- Accroche de référence : « Vos travaux, bien cadrés. »
- Positionnement : « Assistance technique aux maîtres d'ouvrage publics », de l'avant-projet à la réception, sans intervention pour les candidats sur les consultations suivies.
- Mentions obligatoires sur devis, factures et courriers : « EI » après le nom, SIRET, « TVA non applicable, art. 293 B du CGI ».
