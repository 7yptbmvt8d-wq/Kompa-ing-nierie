# Installer Kompa Affaires dans le compte Google Kompa

Durée : 15 minutes, sur PC. Aucun logiciel à installer : on colle trois fichiers dans l'éditeur Apps Script de Google.

**Prérequis** : le compte Google Kompa (adresse Gmail dédiée, § 11 du cahier des charges) existe. Toutes les étapes se font **connecté avec ce compte** (pas votre compte personnel).

Les trois fichiers à coller sont dans le dossier `dist/` du dépôt :

| Fichier du dépôt | Contenu |
|---|---|
| `dist/appsscript.json` | Réglages du projet (fuseau Paris, accès limité au compte) |
| `dist/Code.gs` | Le moteur : classeur, paramètres, compteur de CA, sauvegarde |
| `dist/Index.html` | L'application (écrans, charte Kompa) |

Sur GitHub, ouvrir le fichier puis cliquer l'icône **Copier le fichier brut** (deux carrés superposés, en haut à droite du contenu).

## A. Créer le projet

1. Aller sur <https://script.google.com> → **Nouveau projet**.
2. Cliquer sur « Projet sans titre » en haut → renommer **Kompa Affaires**.
3. Menu de gauche, roue dentée **Paramètres du projet** → cocher **Afficher le fichier manifeste "appsscript.json" dans l'éditeur**.

## B. Coller les trois fichiers

Revenir à l'**Éditeur** (icône `< >` à gauche).

4. Fichier **appsscript.json** : tout sélectionner (Ctrl+A), coller le contenu de `dist/appsscript.json`.
5. Fichier **Code.gs** : tout sélectionner, coller le contenu de `dist/Code.gs`.
6. Bouton **+** à côté de « Fichiers » → **HTML** → nommer **Index** (sans `.html`, majuscule comprise) → tout sélectionner, coller le contenu de `dist/Index.html`.
7. **Ctrl+S** pour enregistrer.

## C. Créer le classeur

8. En haut de l'éditeur, liste déroulante des fonctions → choisir **installer** → **Exécuter**.
9. Google demande l'autorisation : **Examiner les autorisations** → choisir le compte Kompa.
   Écran « Google n'a pas validé cette application » : c'est normal, le script est le vôtre. **Paramètres avancés** → **Accéder à Kompa Affaires (non sécurisé)** → **Autoriser**.
10. Le **journal d'exécution** s'affiche en bas : il donne l'adresse du classeur « Kompa Affaires — données » (aussi visible dans Google Drive).

## D. Publier l'application

11. Bouton bleu **Déployer** → **Nouveau déploiement**.
12. Roue dentée à côté de « Sélectionner le type » → **Application Web**.
    - Description : `Lot 1`
    - Exécuter en tant que : **Moi**
    - Qui a accès : **Moi uniquement**
13. **Déployer** → copier l'**URL de l'application Web** (elle se termine par `/exec`). C'est l'adresse de l'app : la mettre en favori.

## E. Ouvrir sur PC et téléphone

14. PC : ouvrir l'URL dans le navigateur connecté au compte Kompa.
15. Téléphone : se connecter au compte Kompa dans Safari ou Chrome, ouvrir l'URL, puis
    - iPhone : bouton Partager → **Sur l'écran d'accueil** ;
    - Android : menu ⋮ → **Ajouter à l'écran d'accueil**.

L'icône du raccourci est celle de Google Apps Script, pas le logo Kompa : Google ne permet pas de la changer pour ce type d'app.

## Mettre à jour après une nouvelle livraison

1. Recoller les fichiers de `dist/` qui ont changé (étapes 4 à 7).
2. Relancer **installer** (étape 8) : il ajoute les nouveaux onglets, colonnes et paramètres, sans rien effacer.
3. **Déployer** → **Gérer les déploiements** → crayon → Version : **Nouvelle version** → **Déployer**. L'URL ne change pas.

## En cas de problème

| Message | Cause | Solution |
|---|---|---|
| « Classeur introuvable : lancez la fonction installer() » | Étape 8 non faite | Exécuter `installer` |
| « Accès réservé au compte Kompa » / page de connexion Google | Navigateur connecté avec un autre compte | Se connecter avec le compte Kompa |
| « Script function not found: doGet » | Fichier Code.gs incomplet | Recoller `dist/Code.gs` en entier |
| Page blanche | Fichier HTML mal nommé | Le fichier doit s'appeler exactement `Index` |
