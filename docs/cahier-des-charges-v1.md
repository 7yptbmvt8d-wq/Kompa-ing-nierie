# Kompa Affaires — Cahier des charges V1

11 nov. 2026 · Sébastien

## 1. Objet et périmètre

Kompa Affaires est l'outil de veille et de suivi des marchés publics de Kompa Ingénierie : il repère chaque matin les consultations d'AMO pertinentes, suit chaque affaire de la veille à la clôture et mesure les résultats.

**Contexte.** Kompa Ingénierie (Sébastien De Raedt EI, micro-entreprise) répond seul à des marchés de services d'AMO technique pour des acheteurs publics. L'app sert un utilisateur unique.

**Objectifs V1**

1. Ne manquer aucune consultation d'AMO publiée en PACA, ni hors PACA quand la mission n'impose pas de présentiel.
2. Décider vite Go / No-go sur des critères constants.
3. Ne manquer aucune échéance : remise, questions, relances.
4. Mesurer le taux d'attribution et tirer les enseignements de chaque offre perdue.
5. Surveiller le CA par rapport aux seuils de TVA et de la micro-entreprise.

**Hors périmètre V1** : missions de maîtrise d'œuvre, AMO juridique ou financière, marchés de travaux côté entreprises, rédaction des offres (faite avec Claude, hors app), comptabilité.

## 2. Architecture technique

Tout tourne dans le compte Google de Kompa : un moteur Apps Script planifié, un classeur Google Sheets comme base de données et une web app. Aucun serveur, aucun coût d'hébergement.

Le moteur et l'app passent tous deux par le classeur : c'est la seule source de vérité.

| Élément | Choix | Raison |
|---|---|---|
| Moteur | Google Apps Script, déclencheurs horaires (6 h collecte, 7 h e-mail) | Exécution planifiée gratuite, accès natif à Gmail, Sheets et Drive |
| Base de données | Google Sheets, un onglet par table (§ 9) | Consultable et corrigeable à la main, sauvegarde Google |
| Interface | Web app (HTML, CSS, JavaScript) servie par Apps Script, pour ordinateur (Windows, macOS, ChromeOS) ; pas de version mobile | Même compte, pas d'hébergement à gérer |
| Authentification | Compte Google Kompa, accès limité à ce seul compte | Utilisateur unique |
| Sauvegarde | Historique des versions de Google Sheets + copie hebdomadaire automatique du classeur dans Drive | Retour arrière en cas d'erreur |
| Pièces des affaires | Un dossier Drive par affaire, lien dans la fiche | Les DCE restent hors du classeur |

Les quotas gratuits d'Apps Script (durée d'exécution, e-mails envoyés, appels externes) couvrent largement un utilisateur unique ; ils seront vérifiés au lot 1.

## 3. Module Veille

Chaque matin à 6 h, le moteur collecte les nouveaux avis, les filtre, les dédoublonne, leur attribue un pré-score sur 100 et les range dans l'onglet Veille.

### 3.1 Sources

| Source | Mode de collecte | Fréquence |
|---|---|---|
| API BOAMP (open data DILA) | Requête filtrée : type services, codes CPV, départements, date de parution | Quotidienne, 6 h |
| Alertes e-mail des plateformes (PLACE, profils acheteurs de PACA) | Lecture de la boîte Gmail de veille, libellé « Veille » : extraction acheteur, objet, lien, date limite | Quotidienne, 6 h |
| Saisie manuelle | Formulaire « Nouvelle affaire » : consultation directe, contact, bouche-à-oreille | À la demande |

Les noms des champs de l'API BOAMP sont à confirmer au lot 2, sur le modèle de données publié par la DILA.

### 3.2 Filtres (modifiables dans l'onglet Paramètres)

- **Codes CPV retenus** : 71241000 (études de faisabilité, conseil), 71242000 (préparation de projets, estimation des coûts), 71541000 (gestion de projets de construction), 71310000 (conseil en ingénierie), 71530000 (conseil en construction).
- **Mots-clés retenus** : assistance à maîtrise d'ouvrage, AMO, programmation, étude de faisabilité, études préalables, conduite d'opération, assistance technique.
- **Exclusions** : marché de travaux ; objet contenant « mission de maîtrise d'œuvre » sans « assistance à maîtrise d'ouvrage » ; AMO juridique, financière ou assurances.
- **Zones** : départements 04, 05, 06, 13, 83, 84 → « PACA » ; autres → « France — présentiel à vérifier ».

### 3.3 Dédoublonnage

Un même avis peut arriver par le BOAMP et par une alerte. Clé de dédoublonnage : référence de l'acheteur, sinon acheteur + date limite + objet proche. Les doublons sont fusionnés en gardant tous les liens.

### 3.4 Pré-score Go / No-go

| Critère | Points |
|---|---|
| Zone : PACA 25 · France 10 | 25 |
| Mission : mot-clé cœur (faisabilité, programmation, conduite d'opération) 30 · autre AMO technique 15 | 30 |
| Délai avant remise : ≥ 15 j 15 · 10 à 14 j 8 · < 10 j 0 + alerte | 15 |
| Acheteur : commune ou EPCI 15 · autre acheteur public 10 | 15 |
| Montant estimé : compatible avec la capacité (paramètre) 15 · inconnu 8 · hors capacité 0 | 15 |

Classement : ≥ 60 à étudier, 40 à 59 possible, < 40 archivé (consultable). Les barèmes sont des paramètres, ajustables après quelques semaines d'usage.

Un avis passe en Affaire quand vous cliquez « Étudier » ; il garde son lien vers l'avis d'origine.

## 4. Module Affaires

Chaque affaire suit un cycle de statuts datés ; chaque changement de statut est horodaté dans l'historique, ce qui alimente les délais et les taux du tableau de bord.

Une affaire déposée finit gagnée, perdue ou sans suite ; seule une affaire gagnée passe en exécution puis soldée.

**Statuts retenus** (validés le 12/11/2026) :

```
En étude → Go → Déposée → Gagnée → Soldée
    ↘ No-go  ↘ Abandonnée   ↘ Perdue
                            ↘ Sans suite
```

| Statut | Sens |
|---|---|
| En étude | Avis retenu, DCE en cours de lecture |
| Go / No-go | Décision de répondre ou non (motif obligatoire si No-go) |
| Abandonnée | Renoncement à déposer après un Go |
| Déposée | Offre remise |
| Gagnée | Marché notifié, mission en cours d'exécution |
| Perdue | Offre non retenue |
| Sans suite | Procédure déclarée sans suite ou infructueuse par l'acheteur |
| Soldée | Montant notifié entièrement encaissé (ou clôture manuelle) |

### 4.1 Règles de passage

- **No-go** : motif obligatoire, choisi dans une liste (hors zone, hors compétence, références insuffisantes, délai trop court, charge, autre).
- **Déposée** : montant HT, montant pondéré s'il existe et jours passés à répondre obligatoires.
- **Perdue** : crée automatiquement la relance « demander les motifs du rejet » ; le bloc Résultat et le bloc Enseignements deviennent à compléter.
- **Gagnée** : date de notification et montant notifié obligatoires ; ouvre le bloc Exécution.
- **Soldée** : quand le montant encaissé égale le montant notifié (ou sur décision manuelle).

### 4.2 Fiche affaire

| Bloc | Champs |
|---|---|
| Identification | N° interne (KA-AAAA-NNN), acheteur, type d'acheteur, département, objet, référence acheteur, procédure (MAPA, AO, consultation directe), plateforme, lien vers l'avis, lien vers le dossier DCE (Google Drive) |
| Échéances | Date limite de remise, date limite des questions, date de visite éventuelle, durée de validité de l'offre |
| Décision | Pré-score, score final après lecture du DCE, Go ou No-go, motif, date |
| Offre | Groupement ou seul, cotraitant, tranches, jours par tranche, prix par jour, montant HT, montant pondéré, jours passés à répondre, date de dépôt |
| Résultat | Statut final, date de la décision, attributaire, prix de l'attributaire, vos notes et ses notes par critère, rang, motifs du rejet |
| Enseignements | Points faibles constatés, action corrective, pièce-type à améliorer (note méthodologique, CV, références, prix) |
| Exécution | Date de notification, montant notifié, factures émises (date, montant), encaissements (date, montant), reste à facturer |
| Journal | Notes libres datées, historique des statuts |

## 5. Échéancier et relances

L'échéancier est calculé à partir des dates des affaires : aucune échéance n'est saisie deux fois.

| Échéance | Calcul | Alerte |
|---|---|---|
| Remise de l'offre | Date limite de remise | J-7, J-3, J-1 |
| Questions à l'acheteur | Date limite des questions (souvent remise - 10 j, à saisir) | J-3 |
| Visite de site | Date saisie | J-2 |
| Décision attendue | Date de dépôt + durée de validité de l'offre | Si dépassée sans résultat : relance « demander où en est la décision » |
| Motifs du rejet | Créée au passage en Perdue | J+0, puis J+10 si rien reçu |
| Facturation | Échéances de paiement saisies dans le bloc Exécution | J-0 |
| Encaissement | Facture + délai de paiement public (30 j) | J+30 si non encaissé |

**Modèles de courriers** : l'app propose, pour chaque relance, un texte prêt à copier (demande des motifs et des notes de l'attributaire, demande d'information sur la décision, relance de paiement), aux couleurs Kompa.

Chaque relance a un statut : à faire, faite (date), sans objet.

## 6. E-mail du matin

Un e-mail de synthèse part **du lundi au vendredi** à 7 h, après la collecte de 6 h, vers **kompa.ingenierie@gmail.com** (paramètre `email.destinataire`). Il remplace l'usage de l'app sur téléphone. Pas d'envoi le samedi ni le dimanche (décision du 12/11/2026). Objet : `Kompa Affaires — [date] — [n] nouveaux avis · [n] échéances`.

1. Nouveaux avis PACA, triés par pré-score : acheteur, objet, date limite, score, lien vers l'avis, bouton « Étudier ».
2. Nouveaux avis France : mêmes informations, étiquette « présentiel à vérifier ».
3. Échéances des 7 prochains jours : remises, questions, visites.
4. Relances à faire : motifs de rejet, décisions en attente, factures à encaisser.
5. Indicateurs : affaires en cours par statut, taux d'attribution sur 12 mois, CA encaissé de l'année face aux seuils.

Format HTML simple aux couleurs Kompa, lisible sur téléphone (dans Gmail). Les rubriques vides sont masquées. Aucun envoi si les cinq rubriques sont vides, sauf le lundi (récap de la semaine).

## 7. Tableau de bord

Le tableau de bord tient sur un écran et se lit en 10 secondes : où en sont les affaires, combien on gagne, où en est le CA face aux seuils.

| Indicateur | Calcul | Période |
|---|---|---|
| Affaires par statut | Nombre d'affaires dans chaque statut | En cours |
| Taux de Go | Go / (Go + No-go) | 12 mois glissants |
| Taux d'attribution (nombre) | Gagnées / (Gagnées + Perdues) | 12 mois glissants |
| Taux d'attribution (montant) | Montant gagné / montant déposé | 12 mois glissants |
| Rang moyen | Moyenne des rangs connus | 12 mois glissants |
| Écart de prix avec l'attributaire | (Votre prix - prix attributaire) / prix attributaire | Par affaire perdue + moyenne |
| Écart de note technique | Votre note - note attributaire | Par affaire perdue + moyenne |
| Coût de la réponse | Jours passés à répondre / montant gagné | Année |
| CA signé / facturé / encaissé | Sommes des blocs Exécution | Année civile |
| Motifs de No-go et de rejet | Répartition par motif | 12 mois glissants |

**Alertes de seuils**, sur le CA encaissé de l'année civile :

- Franchise de TVA (services) : 37 500 €, seuil majoré 41 250 € — alerte à 80 % puis à 100 %.
- Plafond de la micro-entreprise (prestations de services) : 83 600 € — alerte à 80 % puis à 100 %.

Les seuils sont des paramètres, à mettre à jour quand la loi change. En V1, factures et encaissements sont saisis à la main ; la V2 les reprendra de Qonto.

## 8. Écrans

L'app est conçue pour ordinateur (Windows, macOS, ChromeOS), dans le navigateur. **Pas de version mobile** (décision du 12/11/2026) : le suivi à distance passe par l'e-mail quotidien (§ 6).

| Écran | Contenu | Présentation |
|---|---|---|
| Accueil | Tableau de bord, échéances 7 j, relances à faire | Cartes |
| Veille | Liste des avis filtrable (zone, score, date limite), boutons Étudier / Ignorer | Tableau |
| Affaires | Vue en colonnes par statut (glisser-déposer) et vue liste | Colonnes des statuts en cours + colonne « Clôturées » |
| Fiche affaire | Les blocs du § 4.2, un onglet par bloc, historique | Édition complète |
| Échéancier | Calendrier mensuel et liste des relances | Calendrier |
| Enseignements | Toutes les affaires perdues : écarts, motifs, actions correctives | Tableau |
| Paramètres | Codes CPV, mots-clés, exclusions, zones, barème du score, seuils, heure de l'e-mail | Tableau éditable |

Actions principales : créer une affaire en un formulaire court, passer d'un statut à l'autre en un clic, ouvrir l'avis et le dossier Drive d'un clic, copier un modèle de relance.

## 9. Modèle de données

Un classeur Google Sheets « Kompa Affaires — données », un onglet par table. Chaque ligne a un identifiant unique et des dates de création et de modification.

| Onglet | Une ligne = | Champs principaux |
|---|---|---|
| Avis | Un avis collecté | id, source, date de parution, acheteur, département, objet, CPV, date limite, lien, pré-score, zone, statut (nouveau, étudié, ignoré, archivé), id affaire |
| Affaires | Une affaire | Tous les champs du § 4.2 sauf les listes ci-dessous |
| Historique | Un changement de statut | id affaire, ancien statut, nouveau statut, date |
| Critères | Une note par critère et par affaire | id affaire, critère, pondération, votre note, note de l'attributaire |
| Factures | Une facture | id affaire, n°, date, montant, date d'encaissement, montant encaissé |
| Relances | Une relance | id affaire, type, date prévue, statut, date faite |
| Acheteurs | Un acheteur | nom, type, département, plateforme, contact, nombre d'affaires, résultats |
| Paramètres | Un paramètre | clé, valeur, commentaire |
| Journal moteur | Une exécution du moteur | date, source, avis lus, retenus, erreurs |

Les listes de valeurs (statuts, motifs, types d'acheteurs, procédures) sont dans l'onglet Paramètres pour rester modifiables sans toucher au code.

## 10. Charte graphique et ergonomie

L'app applique la charte Kompa (fichier DESIGN.md et tokens.css du kit) : même famille que Kontrol, accent rouille, jamais de violet.

- **Couleurs** : variables de tokens.css uniquement, aucune couleur codée en dur. Fond blanc, ardoise pour l'en-tête, rouille #B4460E pour un seul accent par écran (statut actif, alerte).
- **Police** : IBM Plex Sans pour le texte, IBM Plex Mono pour les références, dates, montants et scores.
- **Tableaux** : en-tête brume, filets horizontaux, montants alignés à droite.
- **Icône et titre** : symbole Kompa, nom « Kompa Affaires ».
- **Statuts** : une couleur sémantique par famille (en cours, gagnée, perdue, abandonnée), avec un libellé texte en plus de la couleur.
- **Accessibilité** : contraste ≥ 4,5:1, navigation au clavier.
- **Langue** : français, vocabulaire de l'acheteur public.

## 11. Prérequis à fournir avant le développement

- [ ] Créer le compte Google Kompa (adresse Gmail dédiée) : il portera la boîte de veille, le classeur, le moteur et l'hébergement de l'app.
- [ ] S'abonner aux alertes e-mail de PLACE et des plateformes des acheteurs de PACA avec cette adresse (liste des plateformes à dresser).
- [ ] Créer le filtre Gmail qui range ces alertes sous le libellé « Veille ».
- [ ] Valider la liste des codes CPV, des mots-clés et des exclusions du § 3.2.
- [ ] Fixer la capacité visée (montant maximal par mission et charge annuelle) pour le critère Montant du score.
- [ ] Fournir le kit de charte Kompa (DESIGN.md, tokens.css, logos) dans le dossier du projet Claude Code.
- [ ] Saisir la simulation de Mouthe comme affaire de test.

## 12. Ordre de développement V1 et recette

La V1 se construit en 5 lots ; chaque lot est testé et validé par Sébastien avant le suivant.

| Lot | Contenu | Critère de recette |
|---|---|---|
| 1. Socle | Classeur et onglets, app web vide aux couleurs Kompa, connexion Google, onglet Paramètres | L'app s'ouvre sur ordinateur, lit et écrit un paramètre dans le classeur |
| 2. Affaires | Fiche affaire, statuts et règles de passage, historique, vues colonnes et liste | L'affaire Mouthe est saisie de bout en bout ; chaque changement de statut est daté |
| 3. Veille | Collecte BOAMP + boîte de veille, filtres, dédoublonnage, pré-score, écran Veille, bouton Étudier | Sur 5 jours, les avis d'AMO de PACA du BOAMP apparaissent sans doublon ; un avis devient une affaire en un clic |
| 4. Échéances et e-mail | Échéancier, relances, modèles de courriers, e-mail de 7 h | L'e-mail arrive chaque matin du lundi au vendredi pendant une semaine, avec les bonnes rubriques, et pas le week-end |
| 5. Tableau de bord | Indicateurs, alertes de seuils, écran Enseignements | Les indicateurs recalculés à la main sur 3 affaires fictives donnent les mêmes résultats |

Le journal du moteur (onglet Journal moteur) sert à la recette du lot 3 : nombre d'avis lus, retenus, erreurs.

## 13. V2 — fonctions prévues

Ces fonctions seront spécifiées après quelques mois d'usage de la V1.

- **Tri « présentiel » par Claude** : envoi du texte des avis hors PACA à l'API Claude, réponse « présentiel probable / non » justifiée (clé d'API payante).
- **Liaison Qonto** : reprise automatique des factures et des encaissements, rapprochement avec les affaires.
- **Prix des concurrents (DECP)** : récupération des attributions publiées dans les données essentielles de la commande publique pour situer les prix et suivre les concurrents.
- **Analyse automatique des DCE** : lecture du règlement et du CCTP par Claude, extraction des critères, des réunions et des exigences, pré-remplissage du score final.
- **Prospection** : fiches acheteurs enrichies, contacts, projets repérés, relances de prospection pour les marchés sans publicité (sous 60 000 € HT).
- **Bibliothèque de pièces-types** : lien entre enseignements et modèles de réponse à améliorer.
