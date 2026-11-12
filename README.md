# Kompa Affaires

Veille et suivi des marchés publics d'AMO de Kompa Ingénierie.
Google Apps Script + Google Sheets + web app, dans le compte Google Kompa.

Spécification : [docs/cahier-des-charges-v1.md](docs/cahier-des-charges-v1.md) ·
Recette du lot en cours : [docs/recette-lot-1.md](docs/recette-lot-1.md)

## Avancement

| Lot | Contenu | État |
|---|---|---|
| 1. Socle | Classeur et onglets, web app aux couleurs Kompa, connexion Google, Paramètres | Livré — en recette |
| 2. Affaires | Fiche affaire, statuts, historique, vues colonnes et liste | — |
| 3. Veille | Collecte BOAMP + boîte de veille, filtres, dédoublonnage, pré-score | — |
| 4. Échéances et e-mail | Échéancier, relances, modèles de courriers, e-mail de 7 h | — |
| 5. Tableau de bord | Indicateurs, seuils, Enseignements | — |

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
  Setup.js              installer(), déclencheurs, sauvegarde hebdomadaire
  WebApp.js             doGet() et API appelée par l'interface
  Index.html            gabarit de la page (symbole Kompa du kit)
  Tokens.html           copie de charte/kompa-kit/tokens.css + couleurs de statut de l'app
  Styles.html           styles (n'utilisent que les variables de Tokens.html)
  App.html              script de l'interface
dist/                   version assemblée à coller dans Apps Script (npm run build)
charte/kompa-kit/       kit de charte Kompa (DESIGN.md, tokens.css, logos)
tools/                  outils locaux, non déployés
  gas-mock.js           simulation des services Google pour Node
  test-socle.js         tests
  apercu.js             aperçu dans Chromium, contrôles PC + téléphone
  build.js              assemblage de dist/
```

## Tests locaux

```bash
npm test
```

```bash
npm run apercu
```

`apercu` génère `apercu/index.html` et des captures PC et téléphone (Playwright requis).

## Règles de développement

- Charte : `charte/kompa-kit/DESIGN.md`. Couleurs : uniquement les variables de `Tokens.html`. Rouille sur fond clair, rouille clair sur ardoise, un seul accent par écran.
- Après toute modification de `src/` : `npm run build` puis committer `dist/` (le test échoue sinon).
- Le classeur est la seule source de vérité. La ligne 1 de chaque onglet contient les identifiants de colonnes : ne pas les renommer à la main (l'ordre des colonnes peut changer, le code lit par nom).
- Listes de valeurs et barèmes : dans l'onglet Paramètres, jamais dans le code.
- Paramètres : une nouvelle clé s'ajoute dans `PARAMETRES_DEFAUT` (Params.js) puis `installer()` ; l'app ne modifie que des clés existantes.
