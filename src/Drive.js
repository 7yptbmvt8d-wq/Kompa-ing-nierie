/**
 * Dossiers Drive des affaires.
 *
 *   Kompa Affaires — Dossiers/            (racine, paramètre drive.dossier_racine)
 *     2026/                               (un dossier par année, d'après le n° KA-AAAA-NNN)
 *       KA-2026-012 — Acheteur — Objet/   (un dossier par affaire, lien dans la fiche)
 *         01 DCE, 02 Questions et visite              → à la création (En étude)
 *         03 Candidature, 04 Offre, 05 Dépôt          → au passage en Go
 *         06 Résultat                                 → au résultat (gagnée, perdue, sans suite)
 *         07 Exécution, 08 Facturation                → au passage en Gagnée
 * Les noms des sous-dossiers sont des paramètres (drive.sous_dossiers_*).
 * Une erreur Drive ne bloque jamais l'affaire : elle est notée dans le journal de l'affaire.
 */

var ETAPES_DRIVE = {
  etude: 'drive.sous_dossiers_etude',
  go: 'drive.sous_dossiers_go',
  resultat: 'drive.sous_dossiers_resultat',
  gagnee: 'drive.sous_dossiers_gagnee'
};

/** Identifiant Drive tiré d'une URL ou d'un identifiant collé tel quel. */
function Drive_id_(v) {
  var t = String(v || '').trim();
  var m = t.match(/\/folders\/([\w-]{10,})/) || t.match(/[?&]id=([\w-]{10,})/);
  return m ? m[1] : (/^[\w-]{10,}$/.test(t) ? t : '');
}

function Drive_racine_() {
  var id = Drive_id_(Params_texte('drive.dossier_racine', ''));
  if (id) {
    try { var d = DriveApp.getFolderById(id); if (!d.isTrashed()) return d; } catch (e) { /* recréé ci-dessous */ }
  }
  var racine = DriveApp.createFolder(Params_texte('drive.nom_racine', 'Kompa Affaires — Dossiers'));
  Params_enregistrer('drive.dossier_racine', racine.getUrl());
  return racine;
}

/** Sous-dossier de nom donné (créé s'il n'existe pas). */
function Drive_sousDossier_(parent, nom) {
  var it = parent.getFoldersByName(nom);
  return it.hasNext() ? it.next() : parent.createFolder(nom);
}

function Drive_nomAffaire_(a) {
  var propre = function (s, n) {
    s = String(s || '').replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
  };
  return [a.id, propre(a.acheteur, 50), propre(a.objet, 70)].filter(String).join(' — ');
}

function Drive_dossierAffaire_(a) {
  var id = Drive_id_(a.lien_dce);
  if (!id) return null;
  try { var d = DriveApp.getFolderById(id); return d.isTrashed() ? null : d; } catch (e) { return null; }
}

/** Crée (ou retrouve) le dossier de l'affaire et les sous-dossiers des étapes atteintes. Renvoie son URL. */
function Drive_preparerAffaire(idAffaire) {
  var a = Affaires_get_(idAffaire);
  var dossier = Drive_dossierAffaire_(a);
  if (!dossier) {
    var annee = (String(a.id).match(/^KA-(\d{4})-/) || [])[1] || Utilities.formatDate(new Date(), APP.FUSEAU, 'yyyy');
    dossier = Drive_sousDossier_(Drive_sousDossier_(Drive_racine_(), annee), Drive_nomAffaire_(a));
    Db_maj(TABLES.AFFAIRES, a.id, { lien_dce: dossier.getUrl() });
  }
  Drive_etapes_(a.statut).forEach(function (etape) {
    Params_liste(ETAPES_DRIVE[etape]).forEach(function (nom) { Drive_sousDossier_(dossier, nom); });
  });
  return dossier.getUrl();
}

/** Étapes atteintes pour un statut. */
function Drive_etapes_(statut) {
  var e = ['etude'];
  if (['Go', 'Déposée', 'Abandonnée', 'Gagnée', 'Perdue', 'Sans suite', 'Soldée'].indexOf(statut) >= 0) e.push('go');
  if (['Gagnée', 'Perdue', 'Sans suite', 'Soldée'].indexOf(statut) >= 0) e.push('resultat');
  if (['Gagnée', 'Soldée'].indexOf(statut) >= 0) e.push('gagnee');
  return e;
}

/** Version sûre : une erreur Drive est notée dans le journal de l'affaire, sans bloquer. */
function Drive_preparerAffaireSansErreur_(idAffaire) {
  if (Params_texte('drive.actif', 'oui').toLowerCase() !== 'oui') return '';
  try {
    return Drive_preparerAffaire(idAffaire);
  } catch (e) {
    console.error('Dossier Drive ' + idAffaire + ' : ' + e.message);
    try { Affaires_ajouterNote(idAffaire, 'Dossier Drive non créé : ' + e.message); } catch (e2) { /* sans effet */ }
    return '';
  }
}

/** Crée les dossiers des affaires qui n'en ont pas (lancé par installer). */
function creerDossiersManquants() {
  var n = 0;
  Affaires_lister().forEach(function (a) {
    if (!Drive_dossierAffaire_(a) && Drive_preparerAffaireSansErreur_(a.id)) n++;
  });
  console.log(n + ' dossier(s) Drive créé(s).');
  return n;
}
