# Installer Kompa Affaires dans le compte Google Kompa

Durée : 15 minutes, sur ordinateur **Windows, macOS ou ChromeOS**. Tout se fait dans le navigateur (Chrome, Edge, Safari ou Firefox) : aucun logiciel à installer, on colle trois fichiers dans l'éditeur Apps Script de Google.

Raccourcis clavier : **Ctrl** sur Windows et ChromeOS, **⌘ Cmd** sur Mac.

## 0. Créer le compte Google Kompa (une fois)

1. <https://accounts.google.com/signup> → créer un compte gratuit avec une **nouvelle adresse @gmail.com** (Gmail, Drive et Sheets inclus, pas d'abonnement).
2. Activer la validation en deux étapes : <https://myaccount.google.com/security>.
3. Pour recevoir aussi les messages sur votre adresse habituelle : Gmail → Paramètres → **Transfert et POP/IMAP** → ajouter votre adresse.

Toutes les étapes suivantes se font **connecté avec ce compte**, pas avec votre compte personnel.

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

4. Fichier **appsscript.json** : tout sélectionner (Ctrl+A / ⌘+A), coller le contenu de `dist/appsscript.json`.
5. Fichier **Code.gs** : tout sélectionner, coller le contenu de `dist/Code.gs`.
6. Bouton **+** à côté de « Fichiers » → **HTML** → nommer **Index** (sans `.html`, majuscule comprise) → tout sélectionner, coller le contenu de `dist/Index.html`.
7. **Ctrl+S** (⌘+S sur Mac) pour enregistrer.

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

## E. Ouvrir l'app

L'app s'ouvre dans n'importe quel navigateur récent, connecté au compte Kompa. Pour l'avoir comme une application (icône, fenêtre à part) :

| Appareil | Navigateur | Raccourci |
|---|---|---|
| Windows, macOS, ChromeOS | Chrome | Menu ⋮ → **Caster, enregistrer et partager** → **Créer un raccourci…** → cocher **Ouvrir dans une fenêtre** → Créer |
| Windows, macOS | Edge | Menu ··· → **Applications** → **Installer ce site en tant qu'application** |
| macOS | Safari | Menu **Fichier** → **Ajouter au Dock** |
| iPhone | Safari | Bouton Partager → **Sur l'écran d'accueil** |
| Android | Chrome | Menu ⋮ → **Ajouter à l'écran d'accueil** |

Sur ChromeOS, le raccourci apparaît dans le lanceur et peut être épinglé à l'étagère. Sur Windows, il apparaît dans le menu Démarrer ; sur Mac, dans le Dock ou le Launchpad.

L'icône du raccourci est celle de Google Apps Script, pas le logo Kompa : Google ne permet pas de la changer pour ce type d'app.

Si plusieurs comptes Google sont ouverts dans le navigateur, Google peut afficher une erreur d'accès : ouvrir l'app dans un **profil de navigateur** réservé au compte Kompa (Chrome : icône de profil en haut à droite → Ajouter).

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
