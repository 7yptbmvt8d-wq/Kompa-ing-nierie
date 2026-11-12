# Recette — Lot 2 · Affaires

**Critère (§ 12)** : l'affaire Mouthe est saisie de bout en bout ; chaque changement de statut est daté.

## Mise à jour de l'app (à faire une fois)

1. Éditeur Apps Script : recoller **Code.gs** et **Index** depuis `dist/` (Ctrl+A, Suppr, « Copier le fichier brut » sur GitHub, Ctrl+V, Ctrl+S). `appsscript.json` ne change pas.
2. Exécuter **installer** : il met les colonnes « département » et « référence » au format texte (« 05 » reste « 05 »).
3. Choisir **creerAffaireExerciceMouthe** → **▷ Exécuter** : crée l'affaire d'exercice KA-2026-001 (sans effet si elle existe déjà).
4. **Déployer → Gérer les déploiements → ✏️ → Nouvelle version → Déployer**.

## Affaire d'exercice Mouthe

DCE réel (SIVOM des Hauts du Doubs) ; offre, dates et résultat **fictifs**.

| Date | Passage | Données saisies |
|---|---|---|
| 03/09/2026 | Création → En étude | Acheteur, EPCI, 25, MAPA, remise 02/10/2026, questions 22/09/2026, validité 90 j, pré-score 78 |
| 08/09/2026 | En étude → Go | Score final 62 |
| 01/10/2026 | Go → Déposée | Seul ; TF 14 j + TO1a 6 j + TO2a 16 j × 550 € = **19 800 € HT** ; 3 jours passés à répondre |
| 06/11/2026 | Déposée → Perdue | Attributaire fictif, 17 600 € HT, rang 2 ; relance « motifs du rejet » créée, faite le 10/11/2026 |

Critères : valeur technique 60 (Kompa 44, attributaire 50) ; prix 40 (Kompa 35,6, attributaire 40) → 79,6 contre 90.
Enseignements : note méthodologique (planning TO2a, grille de vérification APS / APD, déplacements chiffrés à part).

## Contrôles

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| 1 | Affaires → cocher « Afficher les affaires clôturées » | KA-2026-001 dans la colonne **Perdue** | [ ] |
| 2 | Ouvrir KA-2026-001 → onglets Identification, Échéances, Décision, Offre, Résultat, Enseignements | Données du tableau ci-dessus ; total des critères 100 / 79,6 / 90 | [ ] |
| 3 | Onglet Journal | 4 passages datés (03/09, 08/09, 01/10, 06/11), 2 notes, relance « Motifs du rejet » faite | [ ] |
| 4 | Classeur → onglet Historique | 4 lignes pour KA-2026-001 avec leur date | [ ] |
| 5 | **Nouvelle affaire** : acheteur + objet → Créer | Fiche KA-2026-002 au statut En étude, 1 ligne d'historique datée du jour | [ ] |
| 6 | Vue Colonnes : glisser KA-2026-002 vers **Déposée** | Colonne grisée, dépôt impossible (il faut passer par Go) | [ ] |
| 7 | Glisser KA-2026-002 vers **Go** → Valider | Carte en colonne Go ; historique daté | [ ] |
| 8 | Fiche → **Déposée** sans montant | Refus : « Champ obligatoire : Montant HT » | [ ] |
| 9 | Déposée avec montant et jours → **Gagnée** | Date de notification et montant notifié proposés (montant HT) ; obligatoires | [ ] |
| 10 | Onglet Exécution → ajouter une facture du montant notifié → « Encaissée » | Statut **Soldée** automatiquement ; compteur de CA de l'accueil mis à jour | [ ] |
| 11 | Créer une affaire → **No-go** sans motif | Refus ; avec motif « charge » : statut No-go, décision et date renseignées | [ ] |
| 12 | Téléphone : Affaires | Liste par statut ; fiche en lecture ; boutons de changement de statut et ajout de note | [ ] |

Supprimer ensuite les affaires de test des points 5 à 11 directement dans le classeur (onglets Affaires, Historique, Factures), ou les garder clôturées.

## Règles de passage appliquées (§ 4.1)

| Vers | Depuis | Champs obligatoires | Effet |
|---|---|---|---|
| Go | En étude | — (score final facultatif) | Décision = Go, date de décision |
| No-go | En étude | Motif (liste) | Décision = No-go, date de décision |
| En étude | No-go | — | Reprise de l'étude |
| Déposée | Go | Montant HT, jours passés à répondre, date de dépôt | — |
| Abandonnée | Go | — | — |
| Gagnée | Déposée | Date de notification, montant notifié | Statut final, ouvre la facturation |
| Perdue | Déposée | Date de la décision | Statut final, relance « Motifs du rejet » |
| Sans suite | Déposée | Date de la décision | Statut final |
| Soldée | Gagnée | — | Automatique quand l'encaissé atteint le montant notifié |

Un changement de statut se corrige directement dans le classeur (onglets Affaires et Historique) si besoin.
