# Recette — Lot 4 · Échéances et e-mail

**Critère (§ 12)** : l'e-mail arrive chaque matin du lundi au vendredi pendant une semaine, avec les bonnes rubriques, et pas le week-end.

## Mise à jour de l'app (à faire une fois)

1. Éditeur Apps Script : recoller **Code.gs** et **Index** depuis `dist/` (recharger la page GitHub avant de copier). `appsscript.json` ne change pas.
2. **Ctrl+S**, puis exécuter **installer** : il ajoute le déclencheur `envoyerEmailMatin` (7 h) et les nouveaux paramètres.
3. **Déployer → Gérer les déploiements → ✏️ → Nouvelle version → Déployer**.
4. Paramètres → `app.url` : coller l'adresse `/exec` de l'app (sans `#…`), pour que les liens de l'e-mail ouvrent la bonne version.
5. Paramètres → `courrier.signature` : remplacer `[téléphone]` et `[n°]` (SIRET).

## Ce qui est calculé (§ 5)

| Échéance | Source | Alerte / relance |
|---|---|---|
| Remise de l'offre | Date limite de remise (affaires En étude, Go) | J-7, J-3, J-1 (marquées), liste à 7 jours dans l'e-mail |
| Questions à l'acheteur | Date limite des questions | J-3 |
| Visite de site | Date de visite | J-2 |
| Décision attendue | Date de dépôt + validité de l'offre (90 j par défaut) | Dépassée sans résultat : relance « Décision attendue » |
| Motifs du rejet | Passage en Perdue | J+0, puis rappel à J+10 si les motifs ne sont pas saisis |
| Facturation | Facture saisie à l'avance (date future) | Relance « Facturation » le jour J |
| Encaissement | Date de facture + 30 j | Relance « Encaissement » dès le dépassement si non encaissée |

Les relances se ferment seules (« sans objet ») quand la situation disparaît : motifs saisis, résultat reçu, facture encaissée.

## Modèles de courriers

Bouton **Courrier** sur chaque relance : objet et texte prêts à copier.
- Motifs du rejet (et rappel) : articles R. 2181-1 à R. 2181-4 du code de la commande publique ; motifs, attributaire, prix, notes par critère, classement.
- Décision attendue : point sur la procédure, prolongation possible de la validité.
- Encaissement : délai global de paiement de 30 jours (R. 2192-10), intérêts moratoires et indemnité de 40 € (L. 2192-13, D. 2192-35).
- Facturation : dépôt sur Chorus Pro.

Mentions : « EI », SIRET, « TVA non applicable, art. 293 B du CGI » (signature, paramètre `courrier.signature`). Les informations manquantes restent entre crochets.

## E-mail du matin (§ 6)

Du lundi au vendredi à 7 h, vers kompa.ingenierie@gmail.com (paramètres `email.heure`, `email.jours`, `email.destinataire`).

1. Nouveaux avis PACA (depuis le dernier envoi), triés par score, bouton « Étudier ».
2. Nouveaux avis hors PACA « à étudier », étiquette « présentiel à vérifier » ; les « possibles » sont comptés avec un lien vers l'app.
3. Échéances des 7 prochains jours : remises, questions, visites.
4. Relances à faire.
5. Indicateurs : affaires en cours par statut, taux d'attribution sur 12 mois, CA encaissé face aux seuils.

Rubriques vides masquées ; pas d'envoi si les rubriques 1 à 4 sont vides, sauf le lundi (récapitulatif).

## Contrôles

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| 1 | Accueil | Cartes « Échéances à 7 jours » et « Relances à faire » remplies | [ ] |
| 2 | Échéancier → calendrier du mois, flèches ‹ › | Remises, questions, visites, décisions, factures aux bonnes dates ; clic → fiche | [ ] |
| 3 | Affaire Mouthe (Perdue) : relance « Motifs du rejet » faite | Aucune relance à faire pour Mouthe | [ ] |
| 4 | Créer une affaire, la passer Go → Déposée avec date de dépôt il y a 100 jours | Relance « Décision attendue » ; bouton Courrier → texte à copier | [ ] |
| 5 | Relance → **Faite** | Disparaît de la liste ; date du jour dans l'onglet Relances du classeur | [ ] |
| 6 | Échéancier → **Aperçu de l'e-mail du matin** | Aperçu aux couleurs Kompa, rubriques remplies masquant les vides | [ ] |
| 7 | **Envoyer l'e-mail maintenant** | E-mail reçu dans kompa.ingenierie@gmail.com | [ ] |
| 8 | Du lundi au vendredi, 7 h | E-mail reçu chaque jour ouvré ; objet « Kompa Affaires — date — n nouveaux avis · n échéances » | [ ] |
| 9 | Samedi et dimanche | Aucun e-mail | [ ] |
