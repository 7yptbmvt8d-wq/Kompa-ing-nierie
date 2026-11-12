# Recette — Lot 1 · Socle

**Critère (§ 12)** : l'app s'ouvre sur PC et téléphone, lit et écrit un paramètre dans le classeur.

## Contrôles

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| 0 | Suivre [installation.md](installation.md), étapes A à D | URL `/exec` obtenue | [ ] |
| 1 | Éditeur Apps Script : exécuter `installer()` | Journal : URL du classeur, 9 onglets, ~50 paramètres ajoutés, déclencheur `sauvegardeHebdo` | [ ] |
| 2 | Ouvrir le classeur « Kompa Affaires — données » | Onglets Avis, Affaires, Historique, Critères, Factures, Relances, Acheteurs, Paramètres, Journal moteur ; en-têtes brume, ligne 1 figée | [ ] |
| 3 | Onglet Paramètres | `zone.departements_paca` = `04;05;06;13;83;84` (zéros conservés) | [ ] |
| 4 | Ouvrir l'URL `/exec` sur PC | En-tête ardoise avec le symbole Kompa ; carte « État du socle » — Connecté, 9 / 9 onglets, compte Kompa | [ ] |
| 4 bis | Classeur → onglet Factures : saisir une ligne (date, montant, date_encaissement, montant_encaisse de l'année), recharger l'app | Compteur de CA : encaissé mis à jour, reste avant chaque seuil recalculé ; alerte rouille au-delà de 80 % d'un seuil | [ ] |
| 5 | PC → Paramètres → `capacite.montant_max_mission` : saisir le montant, Enregistrer | Message « Paramètre … enregistré », date « Modifié le » mise à jour | [ ] |
| 6 | Classeur → onglet Paramètres | La valeur saisie et `modifie_le` apparaissent sur la ligne | [ ] |
| 7 | Modifier une valeur directement dans le classeur, recharger l'app | L'app affiche la nouvelle valeur | [ ] |
| 8 | Ouvrir l'URL sur le téléphone | Accueil en cartes empilées, menu défilant, aucun défilement horizontal de la page | [ ] |
| 9 | Téléphone → Paramètres | Lecture seule ; la valeur saisie au point 5 est affichée | [ ] |
| 10 | Téléphone → ajouter à l'écran d'accueil | Le raccourci « Kompa Affaires » ouvre l'app (icône Google, non modifiable) | [ ] |
| 11 | Ouvrir l'URL `/exec` depuis un autre compte Google | Accès refusé par Google | [ ] |
| 12 | Éditeur : exécuter `sauvegardeHebdo()` | Copie datée dans Drive › « Kompa Affaires — sauvegardes » | [ ] |
| 13 | Relancer `installer()` | 0 paramètre ajouté, 0 colonne ajoutée, données intactes | [ ] |

## Quotas Apps Script (compte Gmail gratuit) — à vérifier

Valeurs publiées par Google pour un compte grand public, à confirmer sur
<https://developers.google.com/apps-script/guides/services/quotas> au moment de la recette.

| Quota | Limite (compte gratuit) | Besoin estimé Kompa Affaires | Marge |
|---|---|---|---|
| Durée d'une exécution | 6 min | Collecte quotidienne : < 1 min | Large |
| Durée cumulée des déclencheurs | 90 min / jour | ~3 min / jour | Large |
| Destinataires d'e-mails | 100 / jour | 1 / jour | Large |
| Appels UrlFetch (API BOAMP) | 20 000 / jour | < 50 / jour | Large |
| Lecture Gmail | 20 000 / jour | < 100 / jour | Large |
| Déclencheurs par script | 20 | 3 (collecte, e-mail, sauvegarde) | Large |

Le quota d'e-mails restant du jour est affiché sur l'accueil de l'app (carte « État du socle »).

## Points ouverts pour les lots suivants

- **Cycle des statuts** (§ 4), validé le 12/11/2026 : En étude → Go / No-go → Déposée (ou Abandonnée après un Go) → Gagnée / Perdue / Sans suite → Soldée. « Gagnée » couvre la notification et l'exécution.
- **Capacité par mission** : `capacite.montant_max_mission` facultatif ; sinon le critère Montant du pré-score (lot 3) compare le montant estimé au reste disponible sous le plafond visé.
- **Seuils légaux** : 37 500 € / 41 250 € (TVA) et 83 600 € (micro) sont des paramètres, à vérifier chaque 1er janvier.
