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

## Structure

```
src/                    → poussé tel quel dans le projet Apps Script (clasp)
  appsscript.json       manifeste : fuseau Paris, accès web app limité au compte propriétaire
  Config.js             constantes et schéma des onglets (§ 9)
  Db.js                 lecture / écriture des onglets (une ligne = un objet)
  Params.js             paramètres par défaut et accès typé (texte, nombre, liste)
  Setup.js              installer(), déclencheurs, sauvegarde hebdomadaire
  WebApp.js             doGet() et API appelée par l'interface
  Index.html            gabarit de la page
  Tokens.html           variables de la charte (PROVISOIRE, à remplacer par tokens.css du kit)
  Styles.html           styles (n'utilise que les variables de Tokens.html)
  App.html              script de l'interface
tools/                  → outils locaux, non déployés
  gas-mock.js           simulation des services Google pour Node
  test-socle.js         tests du lot 1
  apercu.js             aperçu de l'app dans Chromium, contrôles PC + téléphone
```

## Installation (une fois, avec le compte Google Kompa)

Prérequis : Node.js et [clasp](https://github.com/google/clasp).

```bash
npm install -g @google/clasp
```

```bash
clasp login
```

Activer l'API Apps Script pour le compte : <https://script.google.com/home/usersettings>.

Créer le projet (dans le dossier du dépôt) :

```bash
clasp create --type standalone --title "Kompa Affaires" --rootDir src
```

`clasp create` écrit `.clasp.json` (identifiant du script, propre au compte : ne pas le committer) et peut écraser `src/appsscript.json` : le restaurer avant d'envoyer le code.

```bash
git checkout src/appsscript.json
```

```bash
clasp push
```

Puis, dans l'éditeur Apps Script (`clasp open`) :

1. Sélectionner la fonction `installer` et cliquer **Exécuter**. Accepter les autorisations (Sheets, Drive, déclencheurs, envoi d'e-mails).
   Le journal affiche l'URL du classeur « Kompa Affaires — données ».
2. **Déployer → Nouveau déploiement → Application Web**.
   Exécuter en tant que : *Moi*. Accès : *Uniquement moi*. Copier l'URL `/exec`.
3. Ouvrir l'URL sur PC, puis sur le téléphone (connecté au compte Kompa).
   Écran d'accueil : Safari → Partager → *Sur l'écran d'accueil* ; Chrome Android → ⋮ → *Ajouter à l'écran d'accueil*.

## Mises à jour du code

```bash
clasp push
```

Relancer `installer()` si le schéma ou les paramètres par défaut ont changé (sans risque : il ajoute les onglets, colonnes et paramètres manquants, n'écrase rien).
Pour que l'URL `/exec` serve la nouvelle version : **Déployer → Gérer les déploiements → Modifier → Nouvelle version**. L'URL ne change pas.

## Tests locaux

```bash
npm test
```

```bash
npm run apercu
```

`apercu` génère `apercu/index.html` et des captures PC et téléphone (Playwright requis).

## Règles de développement

- Couleurs : uniquement les variables de `Tokens.html`. Un seul accent rouille par écran.
- Le classeur est la seule source de vérité. La ligne 1 de chaque onglet contient les identifiants de colonnes : ne pas les renommer à la main (l'ordre des colonnes peut changer, le code lit par nom).
- Listes de valeurs et barèmes : dans l'onglet Paramètres, jamais dans le code.
- Paramètres : une nouvelle clé s'ajoute dans `PARAMETRES_DEFAUT` (Params.js) puis `installer()` ; l'app ne modifie que des clés existantes.
