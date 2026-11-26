# App Kartes Affaires — ce que le skill doit respecter

## Sommaire
1. Données de l'app
2. Statuts et passages
3. Champs de la fiche affaire (libellés exacts)
4. Barème du pré-score (et du score final)
5. Seuils et capacité
6. Arborescence Drive et recherches
7. Dossier-type

## 1. Données de l'app

- Classeur Google Sheets **« Kartes Affaires — données »** (« Kompa Affaires — données » avant son renommage automatique), un onglet par table, ligne 1 = noms de colonnes.
- Onglets utiles : **Affaires** (une ligne par affaire, clé `id` = `KI-AAAA-NNN`, ou `KA-AAAA-NNN` pour les affaires créées avant le 22/11/2026 ; la numérotation continue à la suite), **Paramètres** (colonnes `cle`, `valeur`), **Critères** (notes par critère), **Avis** (veille).
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

## 3. Champs de la fiche affaire (libellés exacts, par bloc)

La fiche a deux volets (version 1.5, réorganisée le 21/11/2026) :
- **Appel d'offres**, parcours en 3 étapes : **Consultation** (blocs Identification, Échéances, Décision) → **Offre** (blocs Chiffrage et Dépôt, Pièces à remettre) → **Résultat** (blocs Résultat, Enseignements, Notes par critère).
- **Mission** (après « Gagnée ») : **Marché** (bloc Notification, tableau des tranches : nature Ferme / Optionnelle, Affermir) › **Planning** (une carte par tranche : livrables → facture → paiement ; « Toutes les factures ») › **Estimations**.

Les blocs s'affichent en lecture ; le bouton **Modifier** ouvre leur formulaire. Les dossiers Drive (01 à 09) et la zone de dépôt sont dans le panneau **Documents** de l'en-tête. Le changement de statut : bouton d'étape suivante (Go →, Déposer l'offre →, Saisir le résultat →, Solder la mission →) ou menu **Autre statut**.

| Bloc | Champs |
|---|---|
| Identification | N° interne, Acheteur, Type d'acheteur (Commune, EPCI, Département, Région, État, Établissement public, Bailleur social, Autre acheteur public), Département, Objet, Référence acheteur, Procédure (MAPA, AO, Consultation directe), Plateforme, Lien vers l'avis, Dossier Drive de l'affaire |
| Pièces à remettre (Offre) | liste Catégorie (Candidature / Offre), Pièce, État (à faire, en cours, prête, déposée). Bouton **Coller la liste du DCE** : une pièce par ligne, titres « Candidature » / « Offre » seuls sur leur ligne ; les pièces déjà listées ne sont pas dupliquées |
| Échéances | Date limite de remise, Date limite des questions, Visite de site, Validité de l'offre (jours) |
| Décision | Pré-score, Score final, Décision, Motif, Date de décision |
| Chiffrage (Offre) | Tranches (une ligne par tranche), Jours par tranche (même ordre, « TF : 50 j » ; « TO1 : 60 j » ou mention « optionnelle » pour une tranche optionnelle), Prix par jour HT, Montant HT (calculé), Montant pondéré (seulement si DQE ou bordereau pondéré) |
| Dépôt (Offre) | Candidature (Seul / Groupement), Cotraitant, Date de dépôt, Jours passés à répondre |
| Résultat | Statut final, Date de la décision, Attributaire, Prix de l'attributaire HT, Rang, Motifs du rejet ; tableau Notes par critère (Critère, Pondération, Note Kartes, Note attributaire) |
| Enseignements | Points faibles constatés, Action corrective, Pièce-type à améliorer (note méthodologique, CV, références, prix) |
| Accord-cadre (Offre, si Type de marché = « Accord-cadre à bons de commande ») | Durée d'une période (mois), Nombre de reconductions, Minimum et Maximum HT par période, Début de la 1re période ; tableau BPU / DQE (N°, Désignation, Unité, Prix unitaire HT, Qté DQE, Montant) collable depuis Excel ; le DQE devient le Montant HT |
| Notification (Mission › Marché) | Date de notification, Montant notifié HT ; tranches et affermissement (marché ordinaire) ou périodes et reconductions (accord-cadre) |
| Bons de commande (Mission › Planning, accord-cadre) | N° du bon (BC-01…), Date, Délai d'exécution, Objet, quantités des prestations du BPU → montant ; chaque bon est une ligne du planning (livrables, facture, paiement) ; dans Qonto, « KI-AAAA-NNN BC-01 » dans « Bon de commande » |
| Livrables (Mission › Planning) | Tranche, Livrable, Échéance, État (à faire, en cours, remis, validé) ; factures dans « Toutes les factures » |

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
Kartes Affaires — Dossiers/
└── 2027/
    └── KI-2027-012 — Commune de Digne-les-Bains — Programmation d'une cantine/
        ├── 01 DCE                  ← créé à la création (En étude)
        ├── 02 Questions et visite  ← créé à la création
        ├── 03 Candidature          ← créé au passage en Go
        ├── 04 Offre                ← créé au passage en Go
        │   └── Archives            ← créé par le skill : indices remplacés (ind A, ind B…)
        ├── 05 Dépôt                ← créé au passage en Go
        ├── 06 Résultat             ← créé au résultat (Gagnée, Perdue, Sans suite)
        ├── 07 Exécution            ← créé au passage en Gagnée
        ├── 08 Facturation          ← créé au passage en Gagnée
        └── 09 Estimations          ← créé au passage en Gagnée
```
Chaque sous-dossier d'étape peut contenir un sous-dossier `Archives` (créé par le skill au premier changement d'indice) : le sous-dossier d'étape ne garde que la dernière version de chaque livrable. Le panneau Documents de l'app n'affiche pas le contenu d'`Archives` ; les fichiers restent dans Drive.
Les noms des sous-dossiers sont des paramètres (`drive.sous_dossiers_*`) : lis-les si le classeur est accessible.

Recherches avec le connecteur Google Drive (`search_files`) :
- Dossier de l'affaire : `title contains 'KI-2027-012' and mimeType = 'application/vnd.google-apps.folder'`. Le lien est aussi dans la colonne `lien_dce` de l'onglet Affaires (`…/folders/<id>`), qui est la source la plus sûre.
- Sous-dossier : `parentId = '<id du dossier>' and mimeType = 'application/vnd.google-apps.folder' and title = '04 Offre'`.
- Fichiers déjà présents : `parentId = '<id du sous-dossier>' and title contains 'KI-2027-012 — Note méthodologique'`.
- Dépôt (`create_file`) : `title`, `parentId`, `contentMimeType` (`application/vnd.openxmlformats-officedocument.wordprocessingml.document` ou `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`), `disableConversionToGoogleType: true`.
- Dossier `Archives` : `parentId = '<id du sous-dossier>' and mimeType = 'application/vnd.google-apps.folder' and title = 'Archives'` ; absent → `create_file` avec `title: 'Archives'`, `contentMimeType: 'application/vnd.google-apps.folder'`, `parentId` = id du sous-dossier d'étape.
- Anciens indices du même document : `parentId = '<id du sous-dossier>' and title contains 'KI-2027-012 — Note méthodologique — ind'` ; chacun, sauf le nouveau, est déplacé par `update_file` (`fileId`, `parentId` = id d'`Archives`), après le dépôt réussi du nouvel indice.

Interdits : créer un dossier (sauf `Archives` dans un sous-dossier d'étape), renommer ou déplacer un dossier de l'app, supprimer ou remplacer un fichier, archiver un fichier qui n'est pas un livrable Kartes à indice. L'app retrouve ses dossiers par leur nom et leur lien : toute modification de l'arborescence casse ce lien ou crée un doublon.

## 7. Dossier-type

Les pièces réutilisables validées par l'utilisateur (CV, références, note méthodologique type, attestations) sont rangées **hors de l'arborescence de l'app**, dans un dossier Drive à la racine nommé **« Kartes — Dossier-type »** (ou encore « Kompa — Dossier-type », son nom d'avant le renommage du 22/11/2026 : cherche les deux). Le skill y lit ; il n'y dépose que si l'utilisateur le demande. Si ce dossier n'existe pas encore, demande à l'utilisateur de le créer ou de fournir les pièces : ne crée rien de toi-même.

Contenu initial (14/11/2026) : « CV — Sébastien De Raedt — à compléter.docx » et « Références Kompa — à compléter.docx » (nom d'origine). Tant qu'un fichier porte « à compléter » dans son nom ou contient encore des crochets, ses informations ne sont pas validées : demande à l'utilisateur de le compléter (ou de te donner les éléments) avant de l'utiliser dans une offre. Lis le .docx en le téléchargeant (contenu du fichier), sans le convertir.
