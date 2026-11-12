# Kompa Affaires

Veille et suivi des marchés publics d'AMO de Kompa Ingénierie.
Google Apps Script + Google Sheets + web app, dans le compte Google Kompa.

Spécification : [docs/cahier-des-charges-v1.md](docs/cahier-des-charges-v1.md) ·
Déclarations URSSAF : [docs/declarations-urssaf.md](docs/declarations-urssaf.md) · Dossiers Drive et fluidité : [docs/dossiers-drive.md](docs/dossiers-drive.md) · Recette : [lot 1](docs/recette-lot-1.md) · [lot 2](docs/recette-lot-2.md) · [lot 3](docs/recette-lot-3.md) · [lot 4](docs/recette-lot-4.md) · [lot 5](docs/recette-lot-5.md)

## Avancement

| Lot | Contenu | État |
|---|---|---|
| 1. Socle | Classeur et onglets, web app aux couleurs Kompa, connexion Google, Paramètres, compteur de CA | Installé |
| 2. Affaires | Fiche affaire, statuts et règles de passage, historique, vues colonnes et liste, affaire d'exercice Mouthe | Livré |
| 3. Veille | Collecte BOAMP + boîte de veille, filtres, dédoublonnage, pré-score, écran Veille | Installé — en recette ([recette-lot-3.md](docs/recette-lot-3.md)) |
| 4. Échéances et e-mail | Échéancier (calendrier), relances automatiques, modèles de courriers, e-mail de 7 h du lundi au vendredi vers kompa.ingenierie@gmail.com | Installé |
| 5. Tableau de bord | Indicateurs du § 7, alertes de seuils, écran Enseignements | Installé — recette validée le 12/11/2026 |

## Installation

Sans outil : [docs/installation.md](docs/installation.md) — trois fichiers de `dist/` à coller dans l'éditeur Apps Script.

`dist/` est généré depuis `src/` :

```bash
npm run build
```

Avec [clasp](https://github.com/google/clasp) (optionnel, pour un développeur) : `clasp create --type standalone --title "Kompa Affaires" --rootDir src`, restaurer `src/appsscript.json` s'il a été écrasé, puis `clasp push`.

## Structure

```
src/                    code source (Apps Script)
  appsscript.json       manifeste : fuseau Paris, web app limitée au compte propriétaire
  Config.js             constantes et schéma des onglets (§ 9)
  Db.js                 lecture / écriture des onglets (une ligne = un objet)
  Params.js             paramètres par défaut et accès typé (texte, nombre, liste)
  Compteur.js           compteur de CA de l'année face aux seuils (TVA, plafond visé, micro)
  Affaires.js           statuts, règles de passage (§ 4.1), historique, critères, factures
  ApiAffaires.js        API de l'écran Affaires et de la fiche
  Exercice.js           affaire d'exercice Mouthe ; affaires [TEST] de la recette du lot 5
  Veille.js             collecte BOAMP + alertes Gmail, filtres, doublons, pré-score (§ 3)
  ApiVeille.js          API de l'écran Veille
  Echeances.js          échéances calculées et relances automatiques (§ 5)
  Courriers.js          modèles de courriers des relances
  Email.js              e-mail du matin (§ 6)
  Indicateurs.js        indicateurs du tableau de bord et enseignements (§ 7)
  Drive.js              dossiers Drive des affaires (année / affaire / sous-dossiers par étape)
  Fiscal.js             déclarations URSSAF : CA encaissé par trimestre, échéances, estimation
  ApiFiscal.js          API des déclarations URSSAF
  ApiTableau.js         API du tableau de bord et des enseignements
  ApiEcheances.js       API de l'échéancier et de l'e-mail
  Setup.js              installer(), déclencheurs, sauvegarde hebdomadaire
  WebApp.js             doGet() et API appelée par l'interface
  Index.html            gabarit de la page (symbole Kompa du kit)
  Tokens.html           copie de charte/kompa-kit/tokens.css + couleurs de statut de l'app
  Styles.html           styles (n'utilisent que les variables de Tokens.html)
  App.html              script de l'interface (navigation, accueil, paramètres)
  AppAffaires.html      écrans Affaires (colonnes, liste) et fiche affaire
  AppVeille.html        écran Veille (avis, Étudier / Ignorer, journal du moteur)
  AppEcheancier.html    écran Échéancier (relances, courriers, calendrier, e-mail)
  AppTableau.html       tableau de bord (accueil) et écran Enseignements
dist/                   version assemblée à coller dans Apps Script (npm run build)
charte/kompa-kit/       kit de charte Kompa (DESIGN.md, tokens.css, logos)
tools/                  outils locaux, non déployés
  gas-mock.js           simulation des services Google pour Node
  test-socle.js         tests
  apercu.js             aperçu dans Chromium, parcours complets sur ordinateur
  build.js              assemblage de dist/
  fixtures/             échantillon réel de l'API BOAMP (tests du lot 3)
```

## Tests locaux

```bash
npm test
```

```bash
npm run apercu
```

`apercu` génère `apercu/index.html` et des captures d'écran (Playwright requis).

## Règles de développement

- Charte : `charte/kompa-kit/DESIGN.md`. Couleurs : uniquement les variables de `Tokens.html`. Rouille sur fond clair, rouille clair sur ardoise, un seul accent par écran.
- Après toute modification de `src/` : `npm run build` puis committer `dist/` (le test échoue sinon).
- Le classeur est la seule source de vérité. La ligne 1 de chaque onglet contient les identifiants de colonnes : ne pas les renommer à la main (l'ordre des colonnes peut changer, le code lit par nom).
- Listes de valeurs et barèmes : dans l'onglet Paramètres, jamais dans le code.
- Paramètres : une nouvelle clé s'ajoute dans `PARAMETRES_DEFAUT` (Params.js) puis `installer()` ; l'app ne modifie que des clés existantes.
