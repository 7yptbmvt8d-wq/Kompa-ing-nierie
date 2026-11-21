# Déploiement automatique (fin du copier-coller)

Une fois configuré, chaque nouvelle version poussée sur GitHub est envoyée seule dans Apps Script :
tests vérifiés, code envoyé, nouvelle version créée, **même adresse /exec**. Le classeur se complète
tout seul au premier lancement (ajouts seulement). Tant que la configuration n'est pas faite,
rien ne change : le copier-coller depuis `dist/` reste possible.

Mise en place unique : environ 10 minutes, tout depuis le navigateur (Chromebook compris).

## 1. Autoriser l'API Apps Script

1. Ouvrir https://script.google.com/home/usersettings (compte Kompa).
2. « API Google Apps Script » : **Activé**.

## 2. Obtenir le jeton de connexion (une fois)

Dans **Google Cloud Shell** (terminal dans le navigateur, rien à installer) :

1. Ouvrir https://shell.cloud.google.com avec le compte Kompa.
2. Vérifier la version de Node (22 ou plus) ; sinon l'installer :
   ```bash
   node -v
   ```
   ```bash
   nvm install 22
   ```
3. Lancer la connexion (elle attend sur le port 8888) :
   ```bash
   npx @google/clasp@3.4.1 login --redirect-port 8888
   ```
4. Ouvrir le lien affiché, choisir le compte Kompa, **Autoriser**.
5. Le navigateur arrive sur une page d'erreur « localhost » : c'est normal. Copier **l'adresse complète** de cette page
   (barre d'adresse, elle commence par `http://localhost:8888/`).
6. Dans Cloud Shell, ouvrir un **deuxième onglet** de terminal (bouton **+**), puis taper `curl "` , coller l'adresse, fermer par `"` et Entrée.
   Le premier onglet affiche alors la connexion réussie.
7. Afficher le jeton :
   ```bash
   cat ~/.clasprc.json
   ```
   Copier tout le texte affiché (de `{` à `}`). **Ne le transmettre à personne** (ni par e-mail, ni dans une conversation).

## 3. Relever deux identifiants

- **SCRIPT_ID** : éditeur Apps Script › ⚙ Paramètres du projet › « ID du script ».
- **DEPLOYMENT_ID** : la partie de l'adresse de l'app entre `/macros/s/` et `/exec`
  (aussi dans Déployer › Gérer les déploiements › ID de déploiement).

## 4. Enregistrer les 3 secrets dans GitHub

Dépôt `Kompa-ing-nierie` › **Settings** › **Secrets and variables** › **Actions** › **New repository secret** :

| Nom | Valeur |
|---|---|
| `CLASPRC_JSON` | le texte copié à l'étape 2 |
| `SCRIPT_ID` | l'ID du script |
| `DEPLOYMENT_ID` | l'ID de déploiement |

Les secrets sont chiffrés par GitHub et ne sont jamais affichés, même dans les journaux.

## 5. Vérifier

Onglet **Actions** du dépôt › « Déployer dans Apps Script » : le prochain envoi de code lance le déploiement
(coche verte = en ligne). Si le bouton « Run workflow » est proposé, il relance un déploiement à la demande.

## Bon à savoir

- Le projet Apps Script est **entièrement remplacé** par `dist/` à chaque déploiement : ne plus modifier le code dans l'éditeur.
- Si un test échoue, rien n'est envoyé : l'app en ligne reste sur la version précédente.
- Le jeton donne accès aux projets Apps Script du compte. Pour le révoquer : https://myaccount.google.com/permissions
  (application « clasp ») ; supprimer alors le secret `CLASPRC_JSON`, le déploiement automatique s'arrête sans erreur.
- Jeton expiré (déploiement en échec « 401 » ou « invalid_grant ») : refaire l'étape 2 et remplacer le secret `CLASPRC_JSON`.
