# Dossiers Drive des affaires

Ajout du 12/11/2026. Un dossier Drive est créé automatiquement pour chaque affaire (bouton **Étudier** de la Veille ou **Nouvelle affaire**), dans un dossier par année. Le lien est enregistré dans la fiche (bloc Identification, « Dossier Drive de l'affaire ») et un bouton **Dossier Drive** l'ouvre depuis l'en-tête de la fiche.

## Arborescence

```
Kompa Affaires — Dossiers/
└── 2026/
    └── KA-2026-012 — Commune de Digne-les-Bains — Programmation d'une cantine/
        ├── 01 DCE                     ← à la création : RC, CCTP, CCAP, AE, DPGF, plans
        ├── 02 Questions et visite     ← à la création : questions posées, réponses, attestation de visite
        ├── 03 Candidature             ← au Go : DC1, DC2 ou DUME, attestations, assurance
        ├── 04 Offre                   ← au Go : mémoire technique, DPGF/BPU, CV, références, planning
        ├── 05 Dépôt                   ← au Go : accusé de réception de la plateforme, offre déposée
        ├── 06 Résultat                ← au résultat : notification ou lettre de rejet, motifs, notes
        ├── 07 Exécution               ← au passage en Gagnée : marché notifié, OS, CR, livrables
        └── 08 Facturation             ← au passage en Gagnée : factures, dépôts Chorus Pro
```

- **Année** : celle du n° d'affaire (KA-**2026**-012).
- **Nom du dossier** : n° — acheteur — objet (raccourcis, caractères interdits retirés).
- Les sous-dossiers apparaissent **au fil des étapes** : une affaire en No-go ne garde que 01 et 02.
- Les noms des sous-dossiers se modifient dans **Paramètres › Dossiers Drive** (`drive.sous_dossiers_*`) ; le dossier racine aussi (`drive.dossier_racine` : coller l'URL d'un dossier existant).
- Une erreur Drive ne bloque jamais l'affaire : elle est notée dans le journal de la fiche ; `creerDossiersManquants` (lancé par `installer`) rattrape les affaires sans dossier.

## Fluidité (même mise à jour)

1. L'accueil en un seul échange avec le serveur (au lieu de cinq).
2. Chaque onglet du classeur n'est lu qu'une fois par échange.
3. Les relances ne sont plus recalculées à l'ouverture des écrans, mais à 6 h, à 7 h et après chaque changement (statut, facture, fiche, déclaration).
4. Chaque écran s'affiche tout de suite avec la dernière version connue, puis se met à jour discrètement.
5. Ignorer / Restaurer un avis, Faite / Sans objet sur une relance, déplacer une carte, ajouter une note : effet immédiat, enregistrement en arrière-plan (annulé avec un message en cas d'erreur).
6. Les avis échus depuis plus de 60 jours passent dans l'onglet « Avis archivés » (paramètre `veille.archivage_jours`).

## Mise à jour

1. Recoller **Code.gs** et **Index** depuis `dist/`, **Ctrl+S**.
2. Exécuter **installer** : crée l'onglet « Avis archivés », les paramètres `drive.*`, le dossier racine, le dossier 2026 et les dossiers des affaires existantes (dont l'exercice Mouthe).
3. Publier une nouvelle version.
