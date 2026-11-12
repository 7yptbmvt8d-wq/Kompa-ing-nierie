# Déclarations URSSAF — CA au rythme des déclarations

Ajout du 12/11/2026 (demande : « le CA sur le même rythme que ce qu'imposent les impôts »).

## Principe

- **Base** : CA **encaissé** de la période (date et montant d'encaissement saisis dans l'onglet Exécution de la fiche affaire), comme pour la déclaration de la micro-entreprise.
- **Rythme** : trimestriel (paramètre `fiscal.periodicite`, ou « mensuelle »).
- **Échéances** : T1 → 30/04 ; T2 → 31/07 ; T3 → 31/10 ; T4 → 31/01 de l'année suivante (mensuel : dernier jour du mois suivant).
- **Estimation des sommes à payer** : CA × taux des paramètres.

| Paramètre | Valeur | À faire |
|---|---|---|
| `fiscal.taux_cotisations` | vide | **À renseigner** : taux de cotisations sociales appliqué sur votre espace autoentrepreneur.urssaf.fr |
| `fiscal.taux_cfp` | 0,2 % | Contribution à la formation professionnelle (libéral) — à vérifier chaque année |
| `fiscal.versement_liberatoire` | oui | Mettre « non » si vous n'avez pas opté pour le versement libératoire |
| `fiscal.taux_versement_liberatoire` | 2,2 % | Activité libérale (BNC) — à vérifier chaque année |
| `fiscal.debut_suivi` | date d'installation | Les périodes terminées avant cette date ne sont pas relancées |

## Où le voir

- **Accueil → Déclarations URSSAF** : une ligne par trimestre (CA encaissé, cotisations, CFP, impôt, total, date limite, état) et le total de l'année.
- Bouton **Déclarée** quand la déclaration est faite (CA déclaré et date enregistrés dans l'onglet « Déclarations » du classeur).
- Tant qu'une période terminée n'est pas déclarée : relance **Déclaration URSSAF** dans l'échéancier et dans l'e-mail du matin ; échéance « Déclaration » dans le calendrier.

## Mise à jour

1. Recoller **Code.gs** et **Index** depuis `dist/`, **Ctrl+S**.
2. Exécuter **installer** : crée l'onglet « Déclarations » et les paramètres `fiscal.*` (début du suivi = date du jour).
3. Publier une nouvelle version.
4. Paramètres › Déclarations URSSAF : renseigner `fiscal.taux_cotisations` ; vérifier les autres taux et le versement libératoire.
