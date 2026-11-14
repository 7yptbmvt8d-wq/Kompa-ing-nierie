# App Kompa Affaires — ce que le skill doit respecter

## Sommaire
1. Données de l'app
2. Statuts et passages
3. Champs de la fiche affaire (libellés exacts)
4. Barème du pré-score (et du score final)
5. Seuils et capacité
6. Arborescence Drive et recherches
7. Dossier-type

## 1. Données de l'app

- Classeur Google Sheets **« Kompa Affaires — données »**, un onglet par table, ligne 1 = noms de colonnes.
- Onglets utiles : **Affaires** (une ligne par affaire, clé `id` = `KA-AAAA-NNN`), **Paramètres** (colonnes `cle`, `valeur`), **Critères** (notes par critère), **Avis** (veille).
- Le skill **lit** le classeur ; il n'y écrit jamais : l'utilisateur saisit lui-même dans l'app (les passages de statut déclenchent des contrôles, l'historique, les relances et les dossiers Drive).

## 2. Statuts et passages

```
En étude → Go → Déposée → Gagnée → Soldée
    ↘ No-go   ↘ Abandonnée   ↘ Perdue
                             ↘ Sans suite
```
- No-go peut revenir en En étude.
- Champs demandés au passage : Go (score final, facultatif) ; No-go (motif) ; Déposée (montant HT, montant pondéré s'il existe, jours passés à répondre, date de dépôt) ; Gagnée (date de notification, montant notifié HT) ; Perdue (date de la décision, attributaire, prix de l'attributaire, rang) ; Sans suite (date de la décision).
- Motifs de No-go (liste de l'app) : hors zone ; hors compétence ; références insuffisantes ; délai trop court ; charge ; autre.

## 3. Champs de la fiche affaire (libellés exacts, par onglet)

| Onglet | Champs |
|---|---|
| Identification | N° interne, Acheteur, Type d'acheteur (Commune, EPCI, Département, Région, État, Établissement public, Bailleur social, Autre acheteur public), Département, Objet, Référence acheteur, Procédure (MAPA, AO, Consultation directe), Plateforme, Lien vers l'avis, Dossier Drive de l'affaire |
| Pièces | fichiers des sous-dossiers Drive, dépôt de fichiers |
| Échéances | Date limite de remise, Date limite des questions, Visite de site, Validité de l'offre (jours) |
| Décision | Pré-score, Score final, Décision, Motif, Date de décision |
| Offre | Candidature (Seul / Groupement), Cotraitant, Tranches (une ligne par tranche), Jours par tranche (même ordre), Prix par jour HT, Montant HT, Montant pondéré (seulement si DQE ou bordereau pondéré), Jours passés à répondre, Date de dépôt |
| Résultat | Statut final, Date de la décision, Attributaire, Prix de l'attributaire HT, Rang, Motifs du rejet ; tableau Notes par critère (Critère, Pondération, Note Kompa, Note attributaire) |
| Enseignements | Points faibles constatés, Action corrective, Pièce-type à améliorer (note méthodologique, CV, références, prix) |
| Exécution | Date de notification, Montant notifié HT ; factures |

Quand tu donnes des valeurs « à reporter dans l'app », utilise ces libellés et cet onglet, dans cet ordre.

## 4. Barème du pré-score (identique pour le score final)

Valeurs par défaut (onglet Paramètres, clés `score.*` ; lis-les si le classeur est accessible, elles ont pu être modifiées) :

| Critère | Points |
|---|---|
| Zone PACA-Corse | 25 (France hors zone : 10) |
| Mission : mot-clé cœur (faisabilité, programmation, conduite d'opération) | 30 (autre AMO technique : 15) |
| Délai avant remise ≥ 15 jours | 15 (10 à 14 j : 8 ; < 10 j : 0) |
| Acheteur commune ou EPCI | 15 (autre acheteur public : 10) |
| Montant compatible avec la capacité | 15 (inconnu : 8 ; hors capacité : 0) |
| **Total** | **100** |

Seuils : `score.seuil_etudier` = 60 (≥ 60 : Go conseillé) ; `score.seuil_possible` = 40 (40 à 59 : à arbitrer ; < 40 : No-go).
Le délai se compte de la date d'analyse à la date limite de remise ; signale un délai < 10 jours même si le score reste bon.

## 5. Seuils et capacité (onglet Paramètres)

- `capacite.montant_max_mission` : montant HT maximal d'une mission (vide = seul le plafond compte).
- `seuil.plafond_vise` (80 000 € par défaut) : CA annuel que l'utilisateur se fixe ; `seuil.micro_plafond` (83 600 €) ; `seuil.tva_franchise` (37 500 €) et `seuil.tva_majore` (41 250 €).
- Le CA encaissé de l'année s'affiche sur l'accueil de l'app (compteur de CA) : si une mission ferait dépasser un seuil, signale-le et demande à l'utilisateur le reste disponible affiché par l'app plutôt que de le deviner.

## 6. Arborescence Drive et recherches

```
Kompa Affaires — Dossiers/
└── 2026/
    └── KA-2026-012 — Commune de Digne-les-Bains — Programmation d'une cantine/
        ├── 01 DCE                  ← créé à la création (En étude)
        ├── 02 Questions et visite  ← créé à la création
        ├── 03 Candidature          ← créé au passage en Go
        ├── 04 Offre                ← créé au passage en Go
        ├── 05 Dépôt                ← créé au passage en Go
        ├── 06 Résultat             ← créé au résultat (Gagnée, Perdue, Sans suite)
        ├── 07 Exécution            ← créé au passage en Gagnée
        └── 08 Facturation          ← créé au passage en Gagnée
```
Les noms des sous-dossiers sont des paramètres (`drive.sous_dossiers_*`) : lis-les si le classeur est accessible.

Recherches avec le connecteur Google Drive (`search_files`) :
- Dossier de l'affaire : `title contains 'KA-2026-012' and mimeType = 'application/vnd.google-apps.folder'`. Le lien est aussi dans la colonne `lien_dce` de l'onglet Affaires (`…/folders/<id>`), qui est la source la plus sûre.
- Sous-dossier : `parentId = '<id du dossier>' and mimeType = 'application/vnd.google-apps.folder' and title = '04 Offre'`.
- Fichiers déjà présents : `parentId = '<id du sous-dossier>' and title contains 'KA-2026-012 — Note méthodologique'`.
- Dépôt (`create_file`) : `title`, `parentId`, `contentMimeType` (`application/vnd.openxmlformats-officedocument.wordprocessingml.document` ou `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`), `disableConversionToGoogleType: true`.

Interdits : créer un dossier, renommer ou déplacer un dossier de l'app, supprimer ou remplacer un fichier. L'app retrouve ses dossiers par leur nom et leur lien : toute modification de l'arborescence casse ce lien ou crée un doublon.

## 7. Dossier-type

Les pièces réutilisables validées par l'utilisateur (CV, références, note méthodologique type, attestations) sont rangées **hors de l'arborescence de l'app**, dans un dossier Drive à la racine nommé **« Kompa — Dossier-type »**. Le skill y lit ; il n'y dépose que si l'utilisateur le demande. Si ce dossier n'existe pas encore, demande à l'utilisateur de le créer ou de fournir les pièces : ne crée rien de toi-même.

Contenu initial (14/11/2026) : « CV — Sébastien De Raedt — à compléter.docx » et « Références Kompa — à compléter.docx ». Tant qu'un fichier porte « à compléter » dans son nom ou contient encore des crochets, ses informations ne sont pas validées : demande à l'utilisateur de le compléter (ou de te donner les éléments) avant de l'utiliser dans une offre. Lis le .docx en le téléchargeant (contenu du fichier), sans le convertir.
