/**
 * Module Estimation — fonctions appelées par l'interface (google.script.run).
 * Même enveloppe que le suivi (repondre_ : contrôle d'accès, erreurs, sérialisation).
 */

function Est_versClient_(nom, ligne) {
  return versClient_(EST_TABLES[nom], ligne);
}

/** Référentiels et leur description pour l'écran. */
function apiEstReferentiels() {
  return repondre_(function () {
    var out = {};
    Object.keys(EST_REFERENTIELS).forEach(function (nom) {
      var def = EST_REFERENTIELS[nom];
      out[nom] = {
        titre: def.titre, aide: def.aide, sansAjout: !!def.sansAjout, cle: EST_TABLES[nom].cle,
        colonnes: def.colonnes.map(function (c) { return { nom: c[0], libelle: c[1], type: c[2] }; }),
        lignes: Est_refLister_(nom).map(function (l) { return Est_versClient_(nom, l); })
      };
    });
    return out;
  });
}

function apiEstRefAjouter(nom, champs) {
  return repondre_(function () { return Est_versClient_(nom, Est_refAjouter_(nom, champs)); });
}

function apiEstRefModifier(nom, cle, champs) {
  return repondre_(function () { return Est_versClient_(nom, Est_refModifier_(nom, cle, champs)); });
}

/** Écran Estimation : liste des estimations, avec l'affaire rattachée. */
function apiEstAccueil() {
  return repondre_(function () {
    var affaires = {};
    Db_lire(TABLES.AFFAIRES).forEach(function (a) { affaires[a.id] = a; });
    var ests = Db_lire(EST_TABLES.ESTIMATIONS).map(function (e) {
      var a = affaires[e.id_affaire] || {};
      var c = Est_versClient_('ESTIMATIONS', e);
      c.acheteur = a.acheteur || '';
      c.objet = a.objet || '';
      return c;
    });
    ests.sort(function (x, y) { return String(y.modifie_le).localeCompare(String(x.modifie_le)); });
    return { version: EST_VERSION, estimations: ests };
  });
}

/** Estimations d'une affaire (onglet « Estimations » de la fiche). */
function apiEstAffaire(idAffaire) {
  return repondre_(function () {
    return Db_lire(EST_TABLES.ESTIMATIONS)
      .filter(function (e) { return String(e.id_affaire) === String(idAffaire); })
      .map(function (e) { return Est_versClient_('ESTIMATIONS', e); });
  });
}

/** Index Insee : séries, dernière valeur, état de la dernière mise à jour. */
function apiEstIndices() {
  return repondre_(function () {
    var derniers = {};
    Db_lire(EST_TABLES.INDICES_VALEURS).forEach(function (v) {
      var c = String(v.code);
      if (!derniers[c] || String(v.mois) > derniers[c].mois) derniers[c] = { mois: String(v.mois), valeur: Number(v.valeur), qualite: String(v.qualite) };
    });
    var etat = Est_etatIndices_();
    return {
      series: Db_lire(EST_TABLES.INDICES).map(function (s) {
        var c = Est_versClient_('INDICES', s);
        c.dernier = derniers[String(s.code)] || null;
        return c;
      }),
      etat: etat ? { date: etat.date instanceof Date ? etat.date.toISOString() : etat.date, resultat: etat.resultat, detail: etat.detail, enEchec: etat.enEchec } : null
    };
  });
}

/** Bouton « Mettre à jour les index ». */
function apiEstIndicesMettreAJour() {
  return repondre_(function () { return Est_indicesMettreAJour({ source: 'manuelle' }); });
}

/** Historique d'un index (36 derniers mois). */
function apiEstIndiceHistorique(code) {
  return repondre_(function () {
    return Est_valeursIndice_(code).slice(-36).map(function (v) {
      return { mois: String(v.mois), valeur: Number(v.valeur), qualite: String(v.qualite), date_jo: String(v.date_jo || '') };
    });
  });
}

/** Calculette d'actualisation (onglet Index Insee) : vérification des formules sur un prix. */
function apiEstActualiser(pu, m0, lot, nature, moisCible) {
  return repondre_(function () {
    var n = Number(String(pu).replace(/\s/g, '').replace(',', '.'));
    if (!isFinite(n)) throw new Error('Prix unitaire : nombre attendu.');
    if (!Est_mois_(m0)) throw new Error('Mois M0 : format MM/AAAA attendu (ex. 03/2024).');
    return Est_actualiser_(n, m0, { lot: lot, nature: nature, moisCible: moisCible || null });
  });
}

// ——— Bibliothèque de ratios (étape 4) ———

/** Imports, listes du formulaire d'import. */
function apiEstBibliotheque() {
  return repondre_(function () {
    var f = Est_formulaire_('');
    return { imports: Est_imports_(), typologies: f.typologies, natures: f.natures, lots: f.lots };
  });
}

/** Analyse des lignes collées : postes reconnus (lot deviné) et lignes écartées. Rien n'est enregistré. */
function apiEstAnalyserPostes(texte) {
  return repondre_(function () { return Est_analyserPostes_(texte); });
}

function apiEstImporter(donnees) {
  return repondre_(function () {
    var imp = Est_importer_(donnees);
    return { id: imp.id, imports: Est_imports_(), brouillonsActualises: Est_actualiserBrouillons_() };
  });
}

function apiEstAnnulerImport(id) {
  return repondre_(function () { Est_annulerImport_(id); return { imports: Est_imports_(), brouillonsActualises: Est_actualiserBrouillons_() }; });
}

/** Ratios d'une typologie et d'une nature, actualisés au dernier index. */
function apiEstRatios(typologie, nature) {
  return repondre_(function () { return Est_ratios_(typologie, nature, null); });
}

// ——— Estimation au ratio (étape 5) ———

function apiEstFormulaire(idAffaire) {
  return repondre_(function () { return Est_formulaire_(idAffaire); });
}

/** Aperçu sans enregistrement. */
function apiEstApercu(d) {
  return repondre_(function () { return Est_calculer_(d); });
}

function apiEstCreer(d) {
  return repondre_(function () { return Est_creerEstimation_(d); });
}

/** Ouverture d'une estimation : un brouillon reprend d'abord les ratios à jour de la bibliothèque. */
function apiEstEstimation(id) {
  return repondre_(function () {
    var n = Est_actualiserBrouillon_(id);
    var c = Est_estimationComplete_(id);
    c.lignesActualisees = n;
    return c;
  });
}

function apiEstSurfaceMaj(id, surface) {
  return repondre_(function () { return Est_modifierSurface_(id, surface); });
}

function apiEstLigneMaj(idLigne, champs) {
  return repondre_(function () { return Est_ligneMaj_(idLigne, champs); });
}

function apiEstFiger(id) {
  return repondre_(function () { return Est_figer_(id); });
}

function apiEstSupprimer(id) {
  return repondre_(function () { return Est_supprimerEstimation_(id); });
}

// ——— Export .xlsx (étape 6) ———

function apiEstExporter(id) {
  return repondre_(function () { var r = Est_exporter_(id); r.estimation = Est_estimationComplete_(id); return r; });
}
