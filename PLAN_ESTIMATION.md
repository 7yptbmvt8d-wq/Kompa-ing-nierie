# Module Estimation des travaux — Phase 1 : analyse et plan

Kompa Affaires v1.2.2 — 15/11/2026.
Ce document est le livrable de la phase 1. **Aucun code n'a été modifié.** La phase 2 ne démarrera qu'après votre validation et vos réponses aux questions de la section 4.

---

## 1. Cartographie de l'existant

### 1.1 Stack

| Élément | Choix actuel |
|---|---|
| Serveur | Google Apps Script (moteur V8), projet « Kompa Affaires » du compte kompa.ingenierie@gmail.com |
| Données | Un classeur Google Sheets, « Kompa Affaires — données » : un onglet par table, ligne 1 = noms de colonnes |
| Interface | Web app Apps Script (HtmlService), page unique, routage par `#ecran/param`, appels serveur par `google.script.run` |
| Fichiers | Google Drive : un dossier par affaire (`KA-AAAA-NNN — acheteur — objet`), sous-dossiers 01 à 08 créés au fil des statuts |
| Réseau sortant | `UrlFetchApp` (API BOAMP déjà utilisée), droit `script.external_request` déjà accordé |
| Planification | Déclencheurs horaires : sauvegarde (lundi 5 h), collecte de la veille (6 h), e-mail du matin (7 h) |
| Accès | Web app limitée au propriétaire (`access: MYSELF`, `executeAs: USER_DEPLOYING`) |
| Développement | Sources dans `src/`, assemblées par `tools/build.js` en 3 fichiers (`dist/Code.gs` 3 365 lignes, `dist/Index.html` 1 851 lignes, `appsscript.json`) **copiés-collés à la main** dans l'éditeur |
| Tests | `npm test` : 70 tests Node sur une simulation des services Google (`tools/gas-mock.js`) ; `npm run apercu` : captures Playwright de l'interface |

### 1.2 Structure des dossiers

```
src/            code serveur (*.js) et interface (*.html)
  Config.js       constantes, schéma des tables (TABLES), conversions client
  Db.js           accès aux onglets : lire, trouver, insérer, mettre à jour, supprimer
  Params.js       paramètres clé/valeur (onglet Paramètres), migrations
  Setup.js        installer(), déclencheurs, sauvegarde hebdomadaire
  Affaires.js     statuts, transitions, fiche, aides de saisie
  Veille.js       collecte BOAMP + alertes Gmail, filtres, pré-score
  Echeances.js, Courriers.js, Email.js, Indicateurs.js, Fiscal.js, Compteur.js, Drive.js, Exercice.js
  Api*.js         points d'entrée appelés par l'interface (repondre_ → {ok, data | erreur})
  WebApp.js       doGet, accueil, paramètres
  Index.html + App*.html, Styles.html, Tokens.html   interface (un fichier par écran)
dist/           version assemblée à coller dans Apps Script
tools/          build, simulation Google, tests, aperçu
docs/           cahier des charges, recettes des lots 1 à 5, notes
skills/         skill Claude « reponse-amo-kompa » (hors app)
charte/         charte graphique Kompa (tokens, logos)
```

### 1.3 Modèle de données actuel (11 onglets)

| Table | Clé | Rôle | Relations |
|---|---|---|---|
| Avis | `AV-…` | avis collectés par la veille | `id_affaire` → Affaires |
| Avis archivés | `AV-…` | avis échus depuis plus de 60 jours | idem |
| Affaires | `KA-AAAA-NNN` | une consultation suivie (~45 colonnes : identification, échéances, décision, offre, résultat, enseignements, exécution) | `id_avis` → Avis ; `lien_dce` → dossier Drive |
| Historique | `HI-…` | chaque changement de statut | `id_affaire` |
| Critères | `CR-…` | notes par critère (Kompa / attributaire) | `id_affaire` |
| Factures | `FA-…` | factures et encaissements | `id_affaire` |
| Relances | `RE-…` | relances calculées (clé fonctionnelle `cle`) | `id_affaire`, `id_facture` |
| Acheteurs | `AC-…` | annuaire (peu utilisé) | — |
| Paramètres | `cle` | ~75 paramètres clé/valeur (veille, barème, seuils, Drive…) | — |
| Déclarations | `DE-…` | déclarations URSSAF trimestrielles | — |
| Journal moteur | `JM-…` | une ligne par collecte de la veille | — |

Les relations ne sont pas contrôlées par la base : c'est le code qui maintient la cohérence (par exemple `Affaires_changerStatut` écrit l'historique et crée les dossiers Drive).

### 1.4 Écrans et navigation

Barre de navigation : **Accueil · Veille · Affaires · Échéancier · Enseignements · Paramètres**.
La fiche d'une affaire (`#affaire/KA-…`) comporte les onglets Identification, Pièces, Échéances, Décision, Offre, Résultat, Enseignements, Exécution et Journal.
Chaque écran est déclaré dans `K.ecrans` et chargé par `K.charger`, qui affiche d'abord la dernière version connue (mémoire locale) puis la version fraîche.

### 1.5 Points de fragilité pour l'ajout du module

| # | Fragilité | Effet sur le module Estimation | Parade proposée |
|---|---|---|---|
| F1 | **Déploiement par copier-coller** d'un fichier unique de 3 365 lignes. Des collages partiels ont déjà eu lieu (Code.gs non remplacé, collage au mauvais endroit). | Le module ajoutera environ 2 500 lignes ; le risque de collage incomplet augmente. | Découper `dist/` en plusieurs fichiers (`Code.gs` pour le suivi, `Estimation.gs` pour le module). Le module devient indépendant : une erreur de collage dans Estimation.gs ne casse pas le suivi. Autre option : outil `clasp` (déploiement par commande), voir question Q14. |
| F2 | **Un seul classeur**, code d'accès figé sur `APP.PROP_CLASSEUR_ID`. | La bibliothèque de prix peut compter des dizaines de milliers de lignes ; mélangée au suivi, elle ralentirait tout et grossirait les sauvegardes. | Un **second classeur « Kompa Estimation — données »**. `Db.js` est généralisé pour qu'une table indique son classeur. Changement limité et couvert par les tests existants. |
| F3 | **Lecture complète des onglets** (`Db_lire` charge tout l'onglet, puis le garde en mémoire pour l'appel). | Acceptable pour quelques milliers de lignes ; trop lent pour une bibliothèque de 30 000 à 50 000 prix si l'écran la charge entière. | Recherche côté serveur (filtre par lot et famille, puis par mots), pagination à 100 lignes, jamais d'envoi complet à l'interface. Mesure de performance prévue à l'étape 6. |
| F4 | **Limites Apps Script** : 6 min par exécution (y compris les appels de l'interface), 20 000 appels réseau par jour. | Les imports Excel volumineux (bibliothèque commerciale) peuvent dépasser 6 min. | Import par lots de 2 000 lignes, avec reprise ; traitement en arrière-plan par déclencheur ponctuel pour les gros fichiers. |
| F5 | **Pas de lecture native des .xlsx** dans Apps Script. | Imports de bibliothèque et de DPGF. | Dépôt du .xlsx dans Drive (mécanisme de l'onglet Pièces déjà en place), conversion temporaire en Google Sheets par l'API Drive (service avancé Drive à activer dans `appsscript.json`, droit déjà accordé), lecture, puis suppression de la copie convertie. |
| F6 | **Pas d'export .xlsx natif.** | Export DPGF. | Création d'un Google Sheets mis en forme (charte Kompa, formules conservées), export en .xlsx via l'adresse d'export Drive avec le jeton du script, dépôt dans le dossier de l'affaire, suppression du fichier temporaire. Technique sans nouveau droit d'accès. |
| F7 | **Sauvegarde hebdomadaire limitée au classeur de suivi.** | Le classeur Estimation ne serait pas sauvegardé. | Étendre `sauvegardeHebdo` aux deux classeurs. |
| F8 | **Données confidentielles** : les DPGF de titulaires portent le nom des entreprises, et parfois du site ou de l'opération. | Votre exigence d'anonymat. | Seules des lignes d'ouvrage et des montants agrégés sont enregistrés ; aucun champ entreprise, site ou opération n'existe dans le modèle. Le fichier source reste dans votre Drive, ou n'est pas conservé (question Q11). Seuil d'affichage d'un ratio fondé sur trop peu de marchés (question Q3). |
| F9 | **Tests limités au serveur** ; l'interface n'est vérifiée que par captures d'écran. | Les écrans du module (assistant en 5 étapes) sont plus complexes que l'existant. | Logique de calcul isolée en fonctions pures, testées en Node (actualisation, K, médianes, classement, export) ; scénario Playwright de bout en bout sur l'assistant. |
| F10 | **Dates** : les cellules de date Google Sheets et le fuseau horaire ont déjà causé des décalages (corrigés par `jourIso_`). | Le mois M0 et le mois d'indice sont centraux. | Mois stockés en texte `AAAA-MM`, jamais en date. |
| F11 | **Paramètres clé/valeur** : adaptés à des réglages simples, pas à des tableaux (coefficients K, correspondance lot → indice). | Tables de paramètres du module. | Tables dédiées, modifiables à l'écran (pas dans l'onglet Paramètres). |

Pas de dette bloquante : le code est découpé par module, les écritures passent toutes par `Db.js`, et les 70 tests passent. Les étapes 0 et 1 du plan traitent F1, F2 et F7 avant toute fonction nouvelle.

---

## 2. Architecture du module Estimation

### 2.1 Principes

- **Séparé du suivi commercial** : un classeur dédié, des fichiers de code préfixés `Est*.js` et `AppEstimation.html`, et un écran « Estimation » dans la barre de navigation.
- **Rattaché à l'affaire par le n° KA** : chaque estimation porte `id_affaire`. Dans la fiche affaire, un onglet « Estimations » liste les estimations et ouvre l'assistant. Le module lit l'affaire mais n'y écrit rien.
- **Aucune valeur métier en dur** : lots, familles d'ouvrage, correspondances lot → indice, coefficients K, TVA, seuils d'anonymat et règles de classement sont des tables modifiables à l'écran.
- **Traçabilité de chaque prix** : source, fiabilité, mois M0, indice et mois d'indice utilisé figurent sur chaque ligne d'estimation et dans l'export.

### 2.2 Données (classeur « Kompa Estimation — données »)

**Référentiels (paramétrables)**

| Table | Champs | Notes |
|---|---|---|
| `EST_LOTS` | code (GO, VRD, CVC, ELE…), libellé, famille (bâtiment / VRD), indice_défaut, ordre, actif | Correspondance lot → indice, exemples à valider : CVC → BT40/BT41, PLB → BT38, ELE → BT47, VRD → TP08 (question Q4) |
| `EST_FAMILLES` | code, lot, libellé, unité type, mots-clés de classement | Familles d'ouvrage (ex. « GO-Fondations », « VRD-Enrobés ») |
| `EST_TYPOLOGIES` | code, libellé, nature (neuf / réhabilitation), unité de référence (m² SDP / m² aménagé) | Liste à fournir (question Q2) |
| `EST_K_FACTEURS` | facteur, modalité, coefficient, mode de combinaison, actif, commentaire | Structure générique en attendant votre méthode (question Q5) |
| `EST_PARAMS` | clé, valeur | TVA par défaut, seuil d'anonymat, indices par défaut (BT01, TP01), jour de mise à jour des indices |

**Indices Insee**

| Table | Champs |
|---|---|
| `EST_INDICES` | code (BT01…), idbank, libellé, famille (BT / TP), base (2010), actif |
| `EST_INDICES_VALEURS` | code, mois (`AAAA-MM`), valeur, qualité (DEF / provisoire, champ `OBS_QUAL` de l'Insee), date de parution au JO, date de récupération |

Identifiants vérifiés le 15/11/2026 sur l'API BDM (`https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/{idbank}`) :

| Index | idbank | Libellé Insee | Dernière valeur (mois) |
|---|---|---|---|
| BT01 | 001710986 | Index du bâtiment – Tous corps d'état – base 2010 | 139,1 (2026-09) |
| BT02 | 001710950 | Terrassements | 147,6 (2026-09) |
| BT38 | 001710972 | Plomberie sanitaire (y compris appareils) | 149,1 (2026-09) |
| BT47 | 001710979 | Électricité | 136,4 (2026-09) |
| TP01 | 001711007 | Index général tous travaux | 142,0 (2026-09) |
| TP08 | 001710996 | Aménagement et entretien de voirie en zones rurale et urbaine | 141,5 (2026-09) |

Autres index de la même série, ajoutables par simple ligne dans `EST_INDICES` : BT03 (001710951), BT06 (001710952), BT08 (001710954), BT40 (001710973), BT41 (001710974), BT42 (001710975), BT46 (001710978), BT50 (001710982), BT53 (001710985), TP02 (001710987), TP09 (001710997), TP10b (001710999), TP12b (001711003).

L'API est libre d'accès (sans clé) et répond en XML SDMX. On peut demander plusieurs séries en une seule requête (`001710986+001710950+…`), ou seulement les dernières valeurs (`?lastNObservations=N`). Au 15/11, le dernier mois publié est septembre 2026 : un décalage d'environ deux mois et demi, conforme à votre remarque.

**Prix et ratios**

| Table | Champs | Notes |
|---|---|---|
| `EST_PRIX` (bibliothèque) | id, lot, famille, code ouvrage, désignation, unité, PU HT, source (`commerciale` / `marché`), référence de source (nom et édition de la bibliothèque, ou n° d'import anonyme), M0, indice, zone, fiabilité, id_import, actif | Aucune donnée d'entreprise. Pour `marché`, la référence est un numéro d'import interne. |
| `EST_OBSERVATIONS` | id aléatoire, typologie, nature, lot, unité de référence, surface de référence, montant HT du lot, €/unité, M0, zone (département ou région), id_import | Une ligne par lot et par marché importé ; base du calcul des ratios. Pas d'entreprise, de site ni d'opération. |
| `EST_QUANTITES` | id, typologie, lot, famille, unité, quantité par m², M0, id_import | Quantités types tirées des DPGF |
| `EST_RATIOS` (calculée) | typologie, nature, lot, unité de référence, zone, M0 de référence, nombre de marchés, médiane, minimum, maximum, date de calcul | Recalculée après chaque import. Les montants sont **actualisés à un même mois** avant le calcul de la médiane, sinon on comparerait des euros d'années différentes. |
| `EST_IMPORTS` | id, type (bibliothèque / DPGF), date, nombre de lignes lues, classées, rejetées, statut, lien vers le fichier source (facultatif) | Journal, sans nom d'entreprise |

**Estimations**

| Table | Champs |
|---|---|
| `EST_ESTIMATIONS` | id (`ES-…`), id_affaire (`KA-…`), phase (Programme / APS / APD / DCE), indice (A, B…), typologie, nature, surfaces (SDP, m² aménagés, autres), K retenu et détail, mode (ratio / détaillé / mixte), mois d'indice utilisé par famille (BT et TP), TVA, totaux HT et TTC, statut (brouillon / figée), commentaire, dates |
| `EST_LIGNES` | id, id_estimation, lot, n° d'article, désignation, unité, quantité, PU M0, M0, indice et sa valeur à M0, mois et valeur de l'indice récent, coefficient d'actualisation, coefficient K, PU HT final, total HT, source (ratio / bibliothèque / saisie), id du prix ou du ratio source, fiabilité, commentaire |

Une estimation **figée** n'est plus recalculée : ses indices et ses prix restent ceux du jour où elle a été figée, ce qui garantit qu'un export reste identique. La phase suivante (par exemple APD après APS) se crée par duplication.

### 2.3 Indices : récupération et actualisation

- **Récupération** (`EstIndices.js`) : une requête groupée pour tous les index actifs. La réponse est lue avec `XmlService`, puis les valeurs sont insérées ou mises à jour pour chaque couple (code, mois), sans doublon. Les valeurs provisoires sont remplacées quand l'Insee publie la valeur définitive.
- **Planification** : déclencheur mensuel le 20 de chaque mois, les index paraissant au Journal officiel vers le 15. Le jour est paramétrable. Un bouton « Mettre à jour les indices » lance la même fonction à la main.
- **Panne de l'API** (pas de réponse, erreur HTTP, XML illisible) : rien n'est effacé, les dernières valeurs connues sont conservées. L'incident est noté dans le journal du module, signalé par un bandeau dans l'écran Estimation et ajouté à l'e-mail du matin. Trois tentatives sont faites, comme pour le BOAMP.
- **Actualisation** (fonction pure, testée) :
  `PU actualisé = PU M0 × (indice du mois récent / indice du mois M0)`.
  L'indice utilisé est celui du lot (`EST_LOTS.indice_défaut`), à défaut BT01 pour le bâtiment ou TP01 pour la VRD.
  Si l'indice du mois M0 n'existe pas (prix trop ancien, ou mois pas encore publié), le prix est signalé « non actualisable », jamais actualisé en silence.
- **Mois affiché** : chaque ligne et chaque export indiquent l'index et son mois, par exemple « BT47 09/2026 = 136,4 ; M0 03/2024 = 129,8 ; coef. 1,0508 », ainsi que la mention « provisoire » s'il y a lieu.
- **Changement de base Insee** : chaque index porte sa base (2010 aujourd'hui). Si l'Insee publie une nouvelle base, un coefficient de raccordement est prévu dans `EST_INDICES`, pour ne pas fausser les rapports d'indices.

### 2.4 Coefficient K

En attendant votre méthode, le modèle prévoit une table de facteurs (localisation, accès, site occupé, phasage, taille de l'opération…), avec pour chacun ses modalités et ses coefficients, ainsi qu'un mode de combinaison paramétrable (produit des facteurs, ou 1 + somme des majorations). L'assistant affiche le détail du calcul ; K est appliqué ligne par ligne et peut être forcé à la main pour un lot, avec un motif obligatoire.

### 2.5 Parcours (écran Estimation, assistant en 5 étapes)

1. **Affaire et typologie** : choix de l'affaire (KA), de la phase, de la typologie et de la nature (neuf ou réhabilitation).
2. **Surfaces** : SDP pour le bâtiment, m² aménagés pour la VRD, et autres surfaces si besoin.
3. **Coefficient K** : choix des modalités, K calculé et affiché avec son détail.
4. **Actualisation** : mois d'indice proposé (le dernier publié), affiché avec sa qualité, provisoire ou définitive. Ce mois peut être choisi plus ancien.
5. **Résultat par lot**, selon deux modes :
   - **au ratio** : médiane (et fourchette minimum–maximum) × surface × actualisation × K ;
   - **détaillé** : quantités × prix de la bibliothèque, avec recherche par lot et par mot.

   Les deux modes peuvent être mixés : un lot au ratio, un autre détaillé. L'écran affiche la source et la fiabilité de chaque ligne, ainsi que l'écart entre le total détaillé et la fourchette du ratio.

**Export .xlsx au format DPGF**
- Colonnes : n° d'article, désignation, unité, quantité, PU HT, total HT.
- Sous-totaux par lot, puis total HT, TVA et TTC, en formules.
- En pied de document : mois d'indice et M0 par lot, K et son détail, sources et fiabilités.
- Charte Kompa (mêmes règles que le chiffrage du skill).
- Fichier déposé dans le dossier Drive de l'affaire (sous-dossier : question Q10), nommé `KA-AAAA-NNN — Estimation <phase> — ind <lettre>.xlsx`, sans jamais écraser un fichier existant.

### 2.6 Alimentation : import d'une DPGF de titulaire

1. **Dépôt du .xlsx** (onglet Pièces ou écran Estimation), conversion temporaire, puis lecture.
2. **Repérage des colonnes** : désignation, unité, quantité, PU, total, détectés à partir des en-têtes. Un écran de vérification permet de corriger la détection avant tout enregistrement.
3. **Renseignement du marché** : typologie, nature, SDP ou m² aménagés, mois M0 (date de l'offre ou mois zéro du marché), zone. **Aucune saisie** d'entreprise, de site ou d'opération.
4. **Classement des lignes** par lot et par famille d'ouvrage. Le système s'appuie sur :
   - les titres de lots de la DPGF ;
   - les mots-clés de `EST_FAMILLES` ;
   - vos corrections précédentes, mémorisées comme règles.

   Un écran affiche les lignes « non classées » à traiter. Les lignes de sous-total, d'option ou à 0 € sont écartées et comptées.
5. **Contrôles avant enregistrement** :
   - le total recalculé (quantité × PU) doit être égal au total de la DPGF, à 1 % près ;
   - les PU aberrants (hors de plus ou moins 3 écarts interquartiles par rapport à la famille) sont signalés.
6. **Enregistrement** :
   - prix unitaires dans `EST_PRIX` (source `marché`) ;
   - une observation par lot dans `EST_OBSERVATIONS` ;
   - quantités par m² dans `EST_QUANTITES` ;
   - recalcul de `EST_RATIOS`.

   Un import peut être annulé dans son ensemble grâce à son `id_import`.

---

## 3. Plan de développement

Chaque étape fait l'objet d'un commit, d'une version de l'app (v1.3.0, v1.3.1…) et d'une recette courte pour vous. Les 70 tests existants doivent passer à chaque étape. Effort indicatif en journées de développement, hors temps de recette.

| Étape | Ce qui change | Test / recette | Risques | Effort |
|---|---|---|---|---|
| **0. Préparation** | `Db.js` multi-classeurs ; `dist/` découpé en `Code.gs` + `Estimation.gs` ; sauvegarde des deux classeurs ; service avancé Drive déclaré | Les 70 tests existants passent ; installer() crée le classeur Estimation vide ; la sauvegarde copie les deux classeurs | Collage : un fichier de plus à coller (guide mis à jour) | 1 j |
| **1. Socle et référentiels** | Tables du module ; écran « Estimation » (navigation) ; écrans de paramètres (lots, familles, typologies, K, TVA) ; onglet « Estimations » vide dans la fiche affaire | Créer, modifier et désactiver un lot, une typologie, un facteur K | Aucun effet sur le suivi : le code est séparé | 1,5 j |
| **2. Indices Insee** | Table des 6 indices (idbank vérifiés) ; récupération SDMX ; historique depuis 2015 ; déclencheur mensuel ; bouton manuel ; gestion de panne et bandeau ; ligne dans l'e-mail du matin | Tests sur réponses XML enregistrées (normale, provisoire, vide, erreur 500) ; recette : bouton → historique visible avec mois et qualité | Format XML de l'Insee qui changerait ; limite de débit (requête groupée unique) | 1,5 j |
| **3. Moteurs de calcul** | Fonctions pures : actualisation, K, médiane / min / max, conversions d'unités | Tests chiffrés de référence (cas validés avec vous à la main) | Arrondis : règle à fixer (question Q8) | 1 j |
| **4. Estimation au ratio** | Assistant (étapes 1 à 5, mode ratio) ; versions par phase et indice ; duplication ; estimation figée ; onglet Estimations de la fiche | Estimation complète sur une affaire test avec 3 ratios saisis à la main ; écran testé par Playwright | Ergonomie de l'assistant (recette visuelle avec vous) | 2,5 j |
| **5. Export DPGF .xlsx** | Génération du fichier mis en forme, dépôt dans le dossier Drive de l'affaire sans doublon | Ouverture dans Excel : formules, totaux, TVA, mentions d'indices | Mise en forme perdue à l'export (vérifiée dans Excel et LibreOffice) | 1,5 j |
| **6. Bibliothèque de prix** | Import d'un fichier commercial (correspondance des colonnes) ; recherche paginée ; mode détaillé de l'assistant | Import de 30 000 lignes en moins de 6 min ; recherche en moins de 3 s | Volume (F3, F4) ; licence de la bibliothèque (question Q6) | 2,5 j |
| **7. Import DPGF et ratios** | Lecture et repérage des colonnes ; classement ; contrôles ; observations anonymes ; recalcul des ratios et des quantités types ; annulation d'un import | Import de 3 DPGF réelles anonymisées : ratios attendus vérifiés à la main ; aucun nom d'entreprise en base | Hétérogénéité des DPGF (mise en page libre) : taux de classement automatique à mesurer, corrections manuelles au début | 3 j |
| **8. Recette d'ensemble et documentation** | Guide d'utilisation, procédure de mise à jour, mise à jour du cahier des charges | Parcours complet sur une affaire réelle | — | 1 j |

**Total indicatif : 15,5 jours de développement.** Les étapes 0 à 5 donnent déjà un module utilisable (estimation au ratio avec export), si les ratios sont saisis à la main. Les étapes 6 et 7 ajoutent l'estimation détaillée et l'alimentation automatique.

---

## 4. Questions à trancher avec vous

**Données et confidentialité**

1. **Origine des DPGF « de mes marchés passés »** : s'agit-il de marchés suivis par Kompa, ou d'opérations suivies dans votre emploi au Ministère des Armées ? Dans le second cas, il faut vérifier que vous avez le droit de réutiliser ces données pour Kompa, même anonymisées (obligation de discrétion, sensibilité des sites militaires). Le module peut aussi fonctionner sans elles.
2. **Typologies** : quelle liste ? Par exemple école, groupe scolaire, cantine ou cuisine centrale, gymnase, bureaux, logements, atelier, local technique, crèche. Faut-il distinguer neuf, réhabilitation lourde et réhabilitation légère ?
3. **Anonymat** : à partir de combien de marchés un ratio peut-il s'afficher (3 proposé, pour qu'on ne puisse pas retrouver un marché) ? La zone se note-t-elle au niveau du département ou de la région ?

**Méthode**

4. **Lots et indices** : quelle nomenclature de lots ? Et quelle correspondance lot → indice ? Vous avez cité BT01, BT02, BT38, BT47, TP01 et TP08 ; proposition pour le reste : GO → BT01 (ou BT03 / BT06), CVC → BT40 / BT41, PLB → BT38, ELE → BT47, MEN → BT42 / BT43, PEINT → BT46, VRD → TP08.
5. **Coefficient K** : merci de transmettre votre méthode. Les facteurs se multiplient-ils, ou s'additionnent-ils en majorations ? K s'applique-t-il à tous les lots, ou selon le lot ?
6. **Bibliothèque commerciale** : laquelle (Batiprix, Bâtichiffrage, autre), dans quel format d'export, avec combien de lignes ? Sa licence permet-elle de l'importer dans votre classeur ? Elle ne sera jamais versée dans le dépôt GitHub.
7. **Actualisation seulement**, ou aussi **projection** jusqu'à la date prévisionnelle des travaux (taux d'inflation annuel paramétrable) ? Ce sont deux notions distinctes, à montrer séparément dans l'export.
8. **Arrondis** : faut-il arrondir les PU actualisés à 2 décimales, et les totaux par lot à la centaine d'euros ? Faut-il ajouter une ligne d'aléas et d'imprévus (pourcentage par phase : programme 15 %, APS 10 %, APD 7 %, DCE 5 %) ?
9. **Fiabilité** : quelle échelle ? Proposition : A = prix de marché récent et local, B = bibliothèque commerciale ou marché ancien, C = ratio fondé sur moins de 5 marchés ou saisie libre.

**Export et rangement**

10. **Rangement Drive** : les estimations sont des livrables de mission, pas des pièces de réponse à une consultation. Faut-il ajouter un sous-dossier « 09 Estimations », créé par l'app comme les autres, ou les ranger dans « 07 Exécution » ?
11. **DPGF source** : faut-il conserver le fichier importé (il porte le nom de l'entreprise), et où ? Ou faut-il le supprimer après import, en ne gardant que les données anonymes ?
12. **TVA** : 20 % par défaut, modifiable par estimation ? En Corse, certains travaux immobiliers relèvent d'un taux particulier : faut-il un taux par zone ?
13. **Format DPGF** : quelle numérotation des articles (« 02.03.01 » par lot, sous-lot et article, ou continue) ? Faut-il reprendre la mise en page Kompa du skill, ou un modèle que vous fournirez ?

**Technique**

14. **Déploiement** : faut-il garder le copier-coller (en 2 fichiers `.gs` au lieu d'1) ? Ou passer à `clasp`, qui déploie par une commande mais demande d'installer Node.js et d'autoriser clasp une fois sur votre ordinateur ?
15. **Ordre des étapes** : le plan livre d'abord l'estimation au ratio (étapes 0 à 5), puis la bibliothèque et l'import DPGF. Préférez-vous l'inverse, en commençant par l'alimentation si vous avez déjà des DPGF à importer ?

---

## 5. Décisions du 15/11/2026 et plan révisé

### 5.1 Réponses reçues

| Question | Décision | Conséquence sur le plan |
|---|---|---|
| Q1 — origine des DPGF | Autorisation de réutilisation confirmée | Import des DPGF de marchés passés retenu |
| Q4 — indices | Couvrir **l'ensemble** des index BT et TP, BT50 au minimum | Les 57 séries de l'Insee identifiées (36 index BT, de BT01 à BT53, et 21 index TP, de TP01 à TP14, base 2010) sont chargées. Les séries arrêtées (BT12, TP10a, TP13, TP14) sont conservées pour l'historique mais ne sont jamais proposées pour une actualisation. **BT50 (rénovation-entretien tous corps d'état)** devient l'index par défaut des opérations de réhabilitation ; BT01 reste celui du neuf, TP01 celui de la VRD. |
| Q5 — coefficient K | Méthode à fournir | Moteur K générique livré à l'étape 3 (table de facteurs). Votre méthode sera paramétrée à réception, sans attendre la fin du module. |
| Q6 — bibliothèque | Pas de bibliothèque commerciale : elle sera constituée à partir des marchés passés | L'import de bibliothèque commerciale est supprimé. **L'import de DPGF alimente à la fois la bibliothèque de prix, les ratios et les quantités types**, et passe en tête du plan, puisque c'est la seule source de données. |
| Q14 — déploiement | Recommandation demandée | **Copier-coller conservé, en 2 fichiers** (`Code.gs` pour le suivi, `Estimation.gs` pour le module). Chaque fichier porte sa version ; l'app affiche une alerte si les deux versions ne correspondent pas, ce qui détecte un collage oublié. clasp n'est pas retenu : il demande Node.js et un terminal, peu adaptés à un usage sous ChromeOS ou à un poste sans droits d'installation. |

### 5.2 Plan révisé

| Étape | Contenu | Effort |
|---|---|---|
| 0. Préparation | `Db.js` multi-classeurs ; `dist/` en 2 fichiers + contrôle des versions ; sauvegarde des 2 classeurs ; service avancé Drive | 1 j |
| 1. Socle et référentiels | Tables ; écran Estimation ; paramètres (lots, familles, typologies, K, TVA) ; onglet Estimations de la fiche | 1,5 j |
| 2. Indices Insee | 57 index BT et TP ; historique depuis 2015 ; mise à jour mensuelle et bouton ; gestion de panne | 1,5 j |
| 3. Moteurs de calcul | Actualisation, K générique, médiane / min / max, aléas | 1 j |
| 4. Import DPGF | Repérage des colonnes, classement par lot et famille, contrôles, **bibliothèque de prix de marché**, observations anonymes, ratios, quantités types, annulation d'un import | 3,5 j |
| 5. Estimation | Assistant complet : au ratio, détaillée par ouvrages, ou mixte ; phases, indices et duplication | 3 j |
| 6. Export DPGF .xlsx | Fichier mis en forme, déposé dans Drive sans doublon | 1,5 j |
| 7. Recette et documentation | Parcours complet sur une affaire réelle | 1 j |

**Total : 14 jours** (contre 15,5). Premier résultat concret dès l'étape 4 : vos premières DPGF importées produisent des ratios consultables.

### 5.3 Questions restantes : valeurs proposées par défaut

Répondez « défauts OK », ou corrigez seulement les points à changer.

| Q | Sujet | Valeur proposée |
|---|---|---|
| Q2 | Typologies | École / groupe scolaire, restauration scolaire / cuisine centrale, crèche, gymnase / équipement sportif, bureaux / administratif, logements, équipement culturel, atelier / local technique, bâtiment militaire (hébergement, ateliers) ; chacune en neuf, réhabilitation lourde ou réhabilitation légère |
| Q3 | Anonymat | Ratio affiché à partir de 3 marchés ; zone enregistrée au niveau du département |
| Q4 bis | Lots et index | GO → BT06 (ossature béton) ou BT03 (maçonnerie) ; TER → BT02 ; CHARP → BT16b / BT07 ; COUV → BT32 / BT34 ; ETAN → BT53 ; MEN-EXT → BT43 / BT27 ; MEN-INT → BT18a ; SERR → BT42 ; PLAT → BT08 ; REV-SOL → BT09 / BT10 ; PEINT → BT46 ; PLB → BT38 ; CVC → BT40 / BT41 ; ELE → BT47 ; ASC → BT48 ; VRD → TP08, réseaux TP10b ; défaut : BT01 neuf, BT50 réhabilitation, TP01 VRD |
| Q7 | Projection | Actualisation au dernier index publié, plus projection facultative à la date des travaux (taux annuel paramétrable, 0 % par défaut), affichée séparément |
| Q8 | Arrondis et aléas | PU à 2 décimales, totaux non arrondis ; ligne d'aléas par phase, paramétrable : programme 15 %, APS 10 %, APD 7 %, DCE 5 % |
| Q9 | Fiabilité | A : prix de marché de moins de 3 ans et de la même région ; B : prix de marché plus ancien ou d'une autre région ; C : ratio fondé sur moins de 5 marchés ou saisie libre |
| Q10 | Rangement Drive | Nouveau sous-dossier « 09 Estimations », créé par l'app au premier export |
| Q11 | DPGF source | Conservée dans un dossier Drive privé « Kompa Estimation — Sources », hors de l'arborescence des affaires, renommée par son n° d'import ; suppression possible depuis le journal des imports |
| Q12 | TVA | Taux par zone, modifiable par estimation : 20 % par défaut ; 10 % en Corse pour les travaux immobiliers (taux propre à la Corse, à confirmer) |
| Q13 | Format DPGF | Numérotation `lot.sous-lot.article` (02.03.01) ; mise en page Kompa, identique au chiffrage du skill |
| Q15 | Ordre | Celui du plan révisé (import DPGF avant l'assistant) |

## 6. Décisions du 19/11/2026 : module rendu utilisable (v1.5.0)

Les DPGF reçues ne donnent qu'un **montant par article**, sans quantité ni prix unitaire. Plutôt que l'import complet (§ 2.6), trois étapes livrées ensemble :

| Étape | Livré | Reporté |
|---|---|---|
| 4. Bibliothèque | Écran Estimation › Bibliothèque : collage des postes d'un marché attribué (libellé + montant HT), lot deviné par mots-clés (paramètre `est.classement_lots`) puis vérifié, une observation par lot (ratio € HT/m² de référence), aucune entreprise ni opération ; annulation d'un import ; ratios par typologie et nature, actualisés au dernier index du lot | Lecture d'un fichier .xlsx, prix unitaires, quantités types, contrôle des PU aberrants |
| 5. Estimation | Assistant au ratio : affaire, phase, typologie, nature, surface, département, kloc (kdép proposé selon le département), date des travaux (projection), lots ; aperçu ; indice A, B… par phase ; PU modifiable ligne par ligne (source « saisie ») ; estimation figée ; suppression d'un brouillon | Mode détaillé (quantités × PU), duplication d'une phase |
| 6. Export | .xlsx au format DPGF (formules Quantité × PU, total, aléas, TVA, TTC ; mentions d'index, de K et de fiabilité), déposé dans « 09 Estimations » sans écraser (suffixe (2)…), note au journal de l'affaire | — |

Lots ajoutés : DG (dispositions générales), DEM (démolitions), EQUIP (équipements spécifiques), sans index propre (BT01 en neuf, BT50 en réhabilitation).
Seuil d'anonymat : un ratio fondé sur moins de 3 marchés reste utilisable, signalé et en fiabilité C (paramètre `est.ratio_sous_seuil` = oui ; « non » pour le masquer).
