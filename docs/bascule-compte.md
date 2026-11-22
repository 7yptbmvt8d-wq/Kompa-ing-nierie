# Bascule vers le compte kartes.ingenierie@gmail.com

Les données (classeurs, dossiers Drive) ne sont ni copiées ni recréées : le nouveau compte en devient
propriétaire ou éditeur, l'app continue avec les mêmes fichiers. L'ancien compte reste ouvert quelques semaines.

## A. Ancien compte (kompa.ingenierie@gmail.com) — partager
Dans Google Drive, partager avec kartes.ingenierie@gmail.com, rôle **Éditeur** :
1. le projet Apps Script **Kompa Affaires** (ou Kartes Affaires) ;
2. le classeur **Kartes Affaires — données** ;
3. le classeur **Kartes Estimation — données** ;
4. le dossier **Kartes Affaires — Dossiers** (tous les dossiers d'affaires suivent) ;
5. le dossier **Kartes Affaires — sauvegardes** ;
6. le dossier **Kompa — Dossier-type** (CV, références) et le dossier **Kompa Estimation — Sources** s'il existe.

## B. Ancien compte — transférer la propriété (projet et classeurs)
Pour les éléments 1, 2 et 3 : Partager › à côté de kartes.ingenierie@gmail.com › **Transférer la propriété**.
Le nouveau compte reçoit un e-mail : **accepter** dans Drive (kartes) › Partagés avec moi.

## C. Ancien compte — arrêter les tâches automatiques
Éditeur Apps Script › fonction **arreterDeclencheursDeCeCompte** › Exécuter.
(La veille et l'e-mail du matin ne tournent plus sous l'ancien compte.)
Puis Déployer › Gérer les déploiements › **Archiver** l'ancien déploiement.

## D. Nouveau compte (kartes.ingenierie@gmail.com) — remettre l'app en service
1. Ouvrir le projet Apps Script (Drive › Partagés avec moi, ou Mon Drive après le transfert).
2. Fonction **installer** › Exécuter › autoriser l'accès (compte kartes). Les déclencheurs sont recréés.
3. Déployer › **Nouveau déploiement** › Application Web › Exécuter en tant que **Moi** › Accès **Moi uniquement**.
4. Copier la nouvelle adresse /exec : c'est la nouvelle adresse de l'app (mettre à jour les favoris, le téléphone).

## E. Déploiement automatique (GitHub)
1. https://script.google.com/home/usersettings (compte kartes) › API Google Apps Script : **Activé**.
2. Cloud Shell **ouvert avec le compte kartes** : `npx @google/clasp@3.4.1 login --redirect-port 8888`, autoriser,
   `curl "adresse localhost"` dans un 2e onglet, puis `cat ~/.clasprc.json`.
3. GitHub › Settings › Secrets › Actions : remplacer **CLASPRC_JSON** et **DEPLOYMENT_ID** (nouvelle adresse /exec).
   SCRIPT_ID ne change pas.
4. Révoquer l'accès clasp **de l'ancien compte uniquement** (myaccount.google.com/permissions, connecté en kompa),
   puis `rm ~/.clasprc.json` dans Cloud Shell. Ne pas lancer `clasp logout` et ne rien révoquer côté kartes :
   cela invalide le jeton du secret CLASPRC_JSON (erreur `invalid_grant` dans GitHub Actions).

## F. Après la bascule
- Alertes e-mail des plateformes (BOAMP, achatpublic, PLACE, marchés sécurisés…) : nouvelle adresse.
- Thème Néon : à choisir à nouveau (il est mémorisé par compte).
- Claude : reconnecter les connecteurs Google Drive et Gmail sur le compte kartes.
