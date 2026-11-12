# Recette — Lot 5 · Tableau de bord et enseignements

**Critère (§ 12)** : les indicateurs recalculés à la main sur 3 affaires fictives donnent les mêmes résultats.

## Mise à jour de l'app (à faire une fois)

1. Éditeur Apps Script : recoller **Code.gs** et **Index** depuis `dist/` (recharger la page GitHub avant de copier). `appsscript.json` ne change pas.
2. **Ctrl+S**, puis **Déployer → Gérer les déploiements → ✏️ → Nouvelle version → Déployer**. Inutile de relancer `installer`.

## Déroulé

1. Faire la recette **avant** d'avoir pris des décisions Go / No-go ou reçu des résultats sur de vraies affaires : sinon elles entrent dans les calculs et les valeurs ci-dessous changent.
2. Éditeur : choisir **creerAffairesTestIndicateurs** → **▷ Exécuter**. Trois affaires « [TEST] » sont créées.
3. Ouvrir l'app (Accueil) et comparer chaque tuile avec le tableau ci-dessous.
4. Éditeur : choisir **supprimerAffairesTest** → **▷ Exécuter**. Les affaires [TEST] disparaissent, avec leur historique, leurs critères et leur facture (le compteur de CA revient à sa valeur réelle).

## Données (Mouthe + 3 affaires [TEST])

| Affaire | Décision | Dépôt | Montant HT | Jours de réponse | Résultat | Prix attributaire | Rang | Note technique (Kompa / attributaire) | Pièce à améliorer |
|---|---|---|---|---|---|---|---|---|---|
| KA-2026-001 Mouthe (exercice) | Go 08/09/2026 | 01/10/2026 | 19 800 € | 3 | Perdue 06/11/2026 | 17 600 € | 2 | 44 / 50 | note méthodologique |
| [TEST] Commune A | Go 02/06/2026 | 20/06/2026 | 20 000 € | 4 | Gagnée 15/07/2026, notifiée 20 000 € | — | 1 | — | — |
| [TEST] EPCI B | Go 01/07/2026 | 20/07/2026 | 15 000 € | 3 | Perdue 10/09/2026 | 12 000 € | 3 | 40 / 48 | prix |
| [TEST] Commune C | No-go 05/08/2026 (charge) | — | — | — | — | — | — | — | — |

Facture [TEST] Commune A : 10 000 € HT le 31/08/2026, encaissée le 30/09/2026.

## Calcul à la main (12 mois glissants, année 2026)

| Indicateur | Calcul | Résultat attendu | OK |
|---|---|---|---|
| Affaires en cours | Commune A en « Gagnée » (mission en cours) | **1** (Gagnée 1) | [ ] |
| Taux de Go | 3 Go (Mouthe, A, B) / 4 décisions | **75 %** | [ ] |
| Taux d'attribution (nombre) | 1 gagnée / (1 + 2 perdues) | **33 %** | [ ] |
| Taux d'attribution (montant) | 20 000 / (20 000 + 15 000 + 19 800) = 20 000 / 54 800 | **36 %** | [ ] |
| Rang moyen | (2 + 1 + 3) / 3 | **2,0** | [ ] |
| Écart de prix (moyenne des perdues) | Mouthe (19 800 − 17 600) / 17 600 = +12,5 % ; B (15 000 − 12 000) / 12 000 = +25,0 % ; moyenne | **+18,8 %** | [ ] |
| Écart de note technique | Mouthe 44 − 50 = −6 ; B 40 − 48 = −8 ; moyenne | **−7,0** | [ ] |
| Coût de la réponse 2026 | (4 + 3 + 3) jours / 20 000 € notifiés × 10 000 | **5,0 j** pour 10 000 € | [ ] |
| CA 2026 | encaissé 10 000 € ; signé 20 000 € ; facturé 10 000 € | **10 000 €** encaissé | [ ] |
| Motifs de No-go | charge : 1 | **charge 1** | [ ] |
| Motifs de rejet (pièce à améliorer) | note méthodologique 1 ; prix 1 | **2 barres à 1** | [ ] |
| Écran Enseignements | Mouthe (+12,5 %, −6) et B (+25,0 %, −8), la plus récente en premier | **2 lignes** | [ ] |

Si vous avez déjà d'autres affaires avec décision, résultat ou facture, ajoutez-les au calcul (ou faites la recette sur une copie du classeur).

## Définitions (§ 7)

- **12 mois glissants** : du jour J − 365 au jour J.
- **Taux de Go** : sur la date de décision. **Taux d'attribution** : sur la date du résultat ; « sans suite » exclu.
- **Taux en montant** : montant HT des offres gagnées / montant HT des offres jugées (gagnées + perdues).
- **Écart de note technique** : somme des critères dont le nom contient « technique ».
- **Coût de la réponse** : jours passés à répondre (offres déposées dans l'année) / montants notifiés dans l'année, exprimé en jours pour 10 000 € gagnés.
- **Motifs de rejet** : pièce-type à améliorer saisie dans le bloc Enseignements de la fiche.
- **Alertes de seuils** : compteur de CA de l'accueil (franchise de TVA 37 500 / 41 250 €, plafond visé, plafond micro) ; alerte à 80 % puis dépassement.
