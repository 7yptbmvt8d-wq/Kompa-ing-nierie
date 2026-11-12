# Recette — Lot 3 · Veille

**Critère (§ 12)** : sur 5 jours, les avis d'AMO de PACA du BOAMP apparaissent sans doublon ; un avis devient une affaire en un clic.

## Mise à jour de l'app (à faire une fois)

Les **trois** fichiers changent cette fois : `appsscript.json` ajoute deux autorisations (appel de l'API BOAMP, lecture de Gmail).

1. Éditeur Apps Script : recoller **appsscript.json**, **Code.gs** et **Index** depuis `dist/` (rechargez la page GitHub avant de copier).
   - https://github.com/7yptbmvt8d-wq/Kompa-ing-nierie/blob/claude/amazing-cray-l4l2w9/dist/appsscript.json
   - https://github.com/7yptbmvt8d-wq/Kompa-ing-nierie/blob/claude/amazing-cray-l4l2w9/dist/Code.gs
   - https://github.com/7yptbmvt8d-wq/Kompa-ing-nierie/blob/claude/amazing-cray-l4l2w9/dist/Index.html
2. **Ctrl+S**, puis exécuter **installer**. Google redemande l'autorisation (Gmail en lecture, services externes) : accepter.
   Le journal doit indiquer `"exerciceMouthe": "KA-2026-001"` et les déclencheurs `sauvegardeHebdo`, `collecteQuotidienne`.
3. **Déployer → Gérer les déploiements → ✏️ → Nouvelle version → Déployer** (le lien ne change pas).

## Boîte de veille Gmail (kompa.ingenierie@gmail.com)

1. Gmail → panneau de gauche → **Libellés → +** → nom : `Veille`.
2. S'abonner aux alertes des plateformes avec kompa.ingenierie@gmail.com (PLACE, profils acheteurs de PACA).
3. Ouvrir une alerte reçue → **⋮ → Filtrer les messages similaires** → (expéditeur pré-rempli) → **Créer un filtre** → cocher **Appliquer le libellé : Veille** → **Créer un filtre**. Répéter pour chaque plateforme.
4. Les alertes rangées sous « Veille » sont lues à chaque collecte (fenêtre : 3 derniers jours).

En V1, une alerte e-mail donne un avis (objet = sujet du message, lien vers la plateforme, date limite et département cherchés dans le texte). Transmettez-moi 2 ou 3 alertes réelles par plateforme : l'extraction sera ajustée à leur format.

## Contrôles

| # | Action | Résultat attendu | OK |
|---|---|---|---|
| 1 | Veille → **Collecter maintenant** | Message « BOAMP : n nouveau(x) · Alerte e-mail : n » ; liste des avis triée par score | [ ] |
| 2 | Journal du moteur (bas de l'écran) et onglet « Journal moteur » du classeur | Lus, retenus, exclus, doublons ; colonne Erreurs vide | [ ] |
| 3 | Filtre zone **PACA** | Avis des départements 04, 05, 06, 13, 83, 84 uniquement | [ ] |
| 4 | Survoler un score | Détail : zone, mission, délai, acheteur, montant | [ ] |
| 5 | Relancer **Collecter maintenant** | 0 nouveau BOAMP (pas de doublon) | [ ] |
| 6 | **Étudier** sur un avis | Fiche affaire créée (En étude) : acheteur, objet, date limite, lien vers l'avis, pré-score ; l'avis affiche le n° de l'affaire | [ ] |
| 7 | **Ignorer** un avis → filtre statut « Ignorés » → **Restaurer** | L'avis disparaît puis revient | [ ] |
| 8 | Le lendemain à 6 h (sans rien faire) | Journal moteur : un passage BOAMP et un passage Alerte e-mail | [ ] |
| 9 | Pendant 5 jours ouvrés | Chaque jour, les nouveaux avis d'AMO de PACA du BOAMP apparaissent ; aucun en double | [ ] |
| 10 | Affaires | KA-2026-001 (exercice Mouthe) dans la colonne « Clôturées » | [ ] |

## Règles appliquées

**Source BOAMP** (API open data DILA) : avis publiés ces 3 derniers jours, nature « appel d'offres », marchés de services, et au moins un critère : descripteur « Assistance à maîtrise d'ouvrage », un code CPV du § 3.2, ou un mot-clé du § 3.2 dans l'objet.

**Exclusions** : objet contenant un terme de `veille.exclusions` ; maîtrise d'œuvre sans « assistance à maîtrise d'ouvrage » ni « AMO ».

**Doublons** : même avis déjà collecté ; sinon même acheteur et même référence ; sinon même acheteur, même date limite et objet proche. Les liens du doublon sont ajoutés à l'avis existant (« lien 2 »).

**Pré-score** (§ 3.4, paramètres `score.*`) : zone PACA 25 / France 10 ; mot-clé cœur 30 / autre 15 ; délai ≥ 15 j 15 / 10 à 14 j 8 / < 10 j 0 + alerte (date inconnue : 8) ; commune ou EPCI 15 / autre 10 ; montant compatible 15 / inconnu 8 / hors capacité 0.
Montant compatible = inférieur ou égal au montant maximal par mission (s'il est renseigné) **et** au reste disponible sous le plafond visé (compteur de CA, CA engagé).
Classement : ≥ 60 à étudier ; 40 à 59 possible ; < 40 archivé (consultable avec le filtre « Archivés »).

Constaté sur un échantillon réel de 40 avis BOAMP (3 au 10/11/2026) : 33 retenus, 6 exclus (maîtrise d'œuvre, hors mots-clés), 1 doublon (même EHPAD publié deux fois).
