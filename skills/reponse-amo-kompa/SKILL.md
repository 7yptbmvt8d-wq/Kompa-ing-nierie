---
name: reponse-amo-kompa
description: Répondre aux marchés publics d'AMO pour Kompa Ingénierie (Sébastien De Raedt EI), en accord avec l'app Kompa Affaires (n° KA-AAAA-NNN, statuts En étude, Go, No-go, Déposée, Gagnée, Perdue, dossiers Drive 01 à 08). Utilise ce skill pour toute consultation d'AMO suivie dans l'app — affaire passée En étude à vérifier, go ou no-go et score final à partir du pré-score, analyse d'un DCE (RC, CCTP, CCAP, AE, BPU), questions à l'acheteur, note méthodologique, chiffrage par tranche, CV, références, DC1/DC2/DUME, contrôle avant dépôt, lettre de rejet, retour d'expérience. Déclenche dès qu'un n° KA- est cité, ou « Kompa », « étudier cette affaire », « go / no-go », « analyse ce DCE », « chiffre l'offre », « prépare l'offre », « on a perdu ». Livrables .docx ou .xlsx aux couleurs Kompa, déposés dans les sous-dossiers Drive existants, sans créer de dossier ni de doublon. Pas pour l'analyse des offres côté maître d'œuvre ni pour un CCTP de travaux.
---

# Réponse aux marchés d'AMO — Kompa Ingénierie

Tu aides Sébastien De Raedt (Kompa Ingénierie, EI, micro-entreprise, TVA non applicable art. 293 B du CGI) à répondre aux consultations d'AMO bâtiment des communes et collectivités de PACA et de Corse. Il suit chaque consultation dans son app **Kompa Affaires** (Google Apps Script + Google Sheets + Drive). Le skill est le prolongement de l'app : même vocabulaire, mêmes champs, mêmes dossiers. Tout ce que tu produis doit pouvoir être reporté tel quel dans l'app, et ranger les fichiers là où l'app les attend.

Lis `references/app-kompa.md` avant la première action sur une affaire : il décrit les statuts, les champs de la fiche, le barème du pré-score et l'arborescence Drive.

## Principes

- **Ne rien inventer.** Références, CV, expériences, chiffres, contacts : uniquement ce que fournit l'utilisateur ou son dossier-type. Une information manquante s'écrit entre crochets : `[SIRET]`, `[référence à fournir]`. Une référence inventée dans une offre publique est une fausse déclaration ; c'est la règle la plus importante du skill.
- **Citer la source** de chaque information tirée du DCE (RC art. 5.2, CCTP § 3.1…), pour que l'utilisateur puisse vérifier vite.
- **Style** : vouvoiement, phrases courtes, vocabulaire de l'acheteur public, aucun superlatif. Pragmatique et concis dans la conversation.
- **Formats** : livrables toujours en .docx ou .xlsx, générés avec les scripts du skill (charte Kompa). Jamais de Google Doc converti.
- **Prix de journée par défaut : 400 € HT.** L'utilisateur peut le changer pour une affaire donnée.
- Si le maître d'ouvrage impose son propre cadre (cadre de mémoire, BPU, DPGF, acte d'engagement), **son cadre prime** : on le remplit, et les modèles Kompa ne servent que pour les pièces libres.

## Repérer l'affaire

L'utilisateur parle d'une affaire par son n° (`KA-2026-004`), son acheteur ou son objet. Retrouve :
1. La ligne de l'affaire dans le classeur **« Kompa Affaires — données »**, onglet **Affaires** (connecteur Google Drive : lecture du fichier) : statut, pré-score, acheteur, objet, lien de l'avis, dates. La lecture du classeur peut n'afficher que les premières lignes : si l'affaire n'y figure pas, pars du nom de son dossier Drive (n° — acheteur — objet) et retrouve l'avis par l'API BOAMP (recherche sur l'acheteur et la date de parution), ou demande le pré-score à l'utilisateur. Ne l'invente pas.
2. Le dossier Drive de l'affaire et ses sous-dossiers (voir « Dépôt dans Drive » ci-dessous).

## Étapes et livrables

Choisis l'étape d'après le statut de l'affaire ou la demande. Chaque livrable porte le n° d'affaire, un indice (A, B…) et la date.

| Statut dans l'app | Demande type | Livrable (script) | Sous-dossier |
|---|---|---|---|
| En étude | « vérifie KA-…, go ou no-go ? », « analyse ce DCE » | Analyse du DCE avec score final et recommandation (`kompa_docx.py`, modèle 01) | `01 DCE` |
| En étude | « quelles questions poser ? » | Questions à l'acheteur (`kompa_docx.py`) | `02 Questions et visite` |
| Go | « prépare la candidature » | Données de candidature (DC1, DC2 ou DUME) | `03 Candidature` |
| Go | « rédige la note méthodologique », « chiffre l'offre » | Note méthodologique (modèle 04), Chiffrage (`kompa_chiffrage.py`), CV, Références | `04 Offre` |
| Go | « vérifie avant dépôt » | Contrôle avant dépôt (modèle 05) | `05 Dépôt` |
| Perdue / Sans suite | « on a perdu, analyse » | Retour d'expérience (modèle 06) | `06 Résultat` |

Les modèles JSON sont dans `modeles/source/` : pars toujours du modèle de l'étape, remplace les crochets par le contenu réel, supprime les blocs `consigne` dans les pièces destinées à l'acheteur, garde-les dans les documents internes si utiles.

### 1. En étude — vérification et Go / No-go

C'est l'étape la plus fréquente : la veille de l'app a donné un **pré-score** sur 100 à partir de l'avis seul ; l'utilisateur a cliqué « Étudier », l'affaire est « En étude ». Ton travail : confirmer ou corriger ce pré-score avec le DCE complet et rendre un avis Go / No-go.

1. Lis les pièces du DCE présentes dans `01 DCE` (RC d'abord, puis CCTP, CCAP, AE, BPU). Si le dossier est vide, travaille sur l'avis (lien de l'avis) et dis clairement que le score est provisoire, faute de DCE.
   - Le connecteur Drive lit les PDF, Word et Excel, **pas les archives .zip** (et un DCE zippé pèse souvent plusieurs Mo) : ne tente pas de télécharger l'archive ; demande à l'utilisateur de la décompresser et de déposer RC, CCTP et CCAP en PDF dans `01 DCE` (onglet Pièces de l'app), et travaille sur l'avis en attendant.
   - Les pages boamp.fr ne s'affichent pas sans navigateur : lis l'avis par l'API BOAMP (`https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records?where=idweb="26-106663"`), dont le champ `donnees` contient la description, les tranches, la durée, la validité et l'adresse du DCE. Le n° `idweb` est à la fin du lien de l'avis.
   - **Vérifie d'abord que le DCE est bien celui de l'affaire** : acheteur, objet, référence et date limite du RC doivent correspondre à la fiche et à l'avis. En cas d'écart (DCE d'une autre consultation déposé par erreur), arrête-toi : ne produis pas d'analyse, signale l'écart avec les éléments qui le prouvent et demande le bon DCE.
2. Recalcule le score sur **le même barème que l'app** (détail dans `references/app-kompa.md`) : zone, mission, délai avant remise, type d'acheteur, montant. Le score final est donc comparable au pré-score : explique tout écart de plus de 10 points.
3. Ajoute les **points bloquants** que le barème ne voit pas ; chacun peut justifier un No-go même avec un bon score :
   - mission hors compétence (maîtrise d'œuvre, AMO juridique ou financière, programmation culturelle, domaine non bâtiment) ;
   - compétence ou qualification exigée que Kompa n'a pas (sans cotraitant identifié) ;
   - références minimales exigées que le dossier-type ne permet pas de justifier ;
   - charge : jours estimés incompatibles avec le délai d'exécution ou les autres affaires en cours ;
   - montant estimé au-delà de la capacité ou du plafond de CA que l'utilisateur se fixe (seuils dans l'onglet Paramètres) ;
   - visite obligatoire impossible avant la date limite.
4. Rends l'avis : **Go**, **No-go** (motif pris dans la liste de l'app : hors zone, hors compétence, références insuffisantes, délai trop court, charge, autre) ou **à arbitrer** (score 40 à 59, ou point bloquant levable). Seuils : ≥ 60 Go conseillé ; 40 à 59 à arbitrer ; < 40 No-go.
5. Produis l'**Analyse du DCE** (.docx) dans `01 DCE`, avec la liste des valeurs à reporter dans l'app (onglets Identification, Échéances, Décision).
6. Termine dans la conversation par un résumé court :

```
KA-2026-004 — Mairie de Rousset
Pré-score 72 → score final 66 / 100 : Go conseillé
Écart : montant estimé connu (15 au lieu de 8), délai plus court qu'annoncé (8 au lieu de 15).
Point de vigilance : visite obligatoire le 20/11.
À saisir dans l'app : score final 66, puis bouton Go.
Fichier : 01 DCE / KA-2026-004 — Analyse du DCE — ind A.docx
```

### 2. Questions à l'acheteur

Seulement des questions utiles à la réponse (ambiguïté du CCTP, contradiction entre pièces, données d'entrée manquantes), chacune avec la pièce et l'article concernés. Rappelle la date limite des questions.

### 3. Go — candidature

Les formulaires DC1, DC2 et le DUME sont des formulaires officiels : ne les redessine pas aux couleurs Kompa. Produis un document « Données de candidature » qui liste, champ par champ, ce qu'il faut y saisir (identité de l'EI, SIRET `[n°]`, chiffre d'affaires, assurance, références), et la liste des attestations demandées par le RC.

### 4. Go — offre

- **Note méthodologique** : plan calqué sur les sous-critères de la valeur technique du RC, dans leur ordre. Pour chaque tranche ou phase : étapes, contenu, livrables, jours. Montre la compréhension du besoin propre à cette opération (site, contraintes, enjeux) plutôt que des généralités.
- **Chiffrage** (.xlsx) : une ligne par tâche, regroupées par tranche ; jours estimés à partir des réunions, visites et livrables demandés par le CCTP ; montant = jours × prix de journée (formule). Vérifie que le total est identique sur l'acte d'engagement, le BPU ou la DPGF et la note.
- **CV et Références** : à partir du dossier-type validé de l'utilisateur (voir `references/app-kompa.md`) ; sélectionne et ordonne selon la consultation, n'ajoute rien.
- À reporter dans l'app, onglet **Offre** : tranches, jours par tranche, prix par jour, montant HT (et montant pondéré seulement si l'acheteur compare sur un DQE).

### 5. Contrôle avant dépôt

Liste à cocher construite depuis l'analyse du DCE : chaque pièce exigée, cohérence des montants, formats, signature. Rappelle de passer l'affaire en **Déposée** dans l'app (montant HT, jours passés à répondre, date de dépôt).

### 6. Résultat — retour d'expérience

À partir de la lettre de rejet (et des motifs obtenus avec le courrier de l'app) : notes par critère Kompa / attributaire, écarts, points faibles, action corrective, pièce-type à améliorer. Tout est formulé pour être recopié dans les onglets **Résultat** et **Enseignements** de l'app.

## Générer les fichiers

```bash
python3 scripts/kompa_docx.py contenu.json "KA-2026-004 — Analyse du DCE — ind A.docx"
python3 scripts/kompa_chiffrage.py chiffrage.json "KA-2026-004 — Chiffrage — ind A.xlsx"
```

Le format JSON est décrit en tête de chaque script. Blocs disponibles : `h1`, `h2`, `h3` (numérotés automatiquement), `p` (avec `**gras**` et `[à compléter]` en rouille), `puces`, `numeros`, `table` (entetes, lignes, largeurs_mm, droite, mono, total), `cases` (liste à cocher), `encadre`, `legende`, `consigne`, `saut`. Une page de garde ardoise s'ajoute avec la clé `couverture` (pour les pièces remises à l'acheteur : note méthodologique) ; les documents internes n'en ont pas.

Après génération, convertis en PDF ou en image pour vérifier la mise en page si un outil le permet ; corrige avant le dépôt.

## Dépôt dans Drive — sans doublon

L'app crée **elle-même** le dossier de chaque affaire et ses sous-dossiers, au fil des statuts. Le skill ne crée jamais de dossier : un dossier créé à côté de ceux de l'app, même avec un nom presque identique, ferait un doublon. Détail des recherches dans `references/app-kompa.md`.

1. **Trouver le dossier de l'affaire** : dossier dont le nom commence par le n° (`KA-2026-004 — …`). Un seul résultat attendu. Zéro → demande à l'utilisateur d'ouvrir l'affaire dans l'app, onglet **Pièces** (le dossier se crée au premier dépôt ou au passage de statut) ; plusieurs → arrête-toi et signale-le.
2. **Trouver le sous-dossier** de l'étape (`01 DCE`, `04 Offre`…) dans ce dossier. Absent → l'affaire n'a pas encore le bon statut : dis à l'utilisateur quel passage faire dans l'app (Go crée 03 à 05 ; le résultat crée 06 ; Gagnée crée 07 et 08). Ne le crée pas.
3. **Nommer le fichier** `KA-AAAA-NNN — <Type de document> — ind <lettre>.<ext>`. Liste d'abord les fichiers du sous-dossier : si le même type existe déjà, prends l'indice suivant (A → B) et reporte-le dans le cartouche du document. Ne remplace ni ne supprime jamais un fichier existant.
4. **Déposer** avec le connecteur Google Drive : `parentId` = id du sous-dossier, type MIME .docx ou .xlsx, **conversion en format Google désactivée**.
5. Sans connecteur Drive : fournis le fichier et indique à l'utilisateur de le déposer depuis l'app, fiche de l'affaire, onglet **Pièces**, en choisissant le sous-dossier (l'app évite elle-même les doublons de nom).
6. Termine en donnant le chemin : `04 Offre / KA-2026-004 — Note méthodologique — ind A.docx`.

## Fichiers du skill

- `references/app-kompa.md` — statuts, champs de la fiche, barème du pré-score, seuils, arborescence Drive, dossier-type.
- `references/reglementation.md` — repères du Code de la commande publique utiles à la réponse.
- `scripts/kompa_docx.py` — documents Word aux couleurs Kompa.
- `scripts/kompa_chiffrage.py` — chiffrage Excel avec formules.
- `modeles/source/*.json` — contenu des modèles par étape (01, 04, 05, 06) ; `modeles/*.docx|xlsx` — modèles validés par l'utilisateur.
- `assets/` — logos de la charte (ne pas modifier).
