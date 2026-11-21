/**
 * Veille qui apprend de vos décisions (21/11/2026).
 *
 * Exemples écartés : avis « ignoré » (onglets Avis et Avis archivés) et affaires passées en No-go.
 * Exemples retenus : avis « étudié » dont l'affaire n'est pas en No-go.
 * Pour chaque mot de l'objet (4 lettres et plus, hors mots vides), part des avis retenus parmi ceux qui le contiennent,
 * comparée à la part globale. Le pré-score d'un nouvel avis reçoit un ajustement « Historique » borné
 * (paramètre score.apprentissage_max, 10 points), visible dans le détail du score avec les mots qui l'expliquent.
 * Sans effet tant qu'il y a moins de veille.apprentissage_min décisions (15) ou si veille.apprentissage = non.
 */

var VEILLE_MOTS_VIDES = ['avec', 'pour', 'dans', 'des', 'les', 'une', 'sur', 'aux', 'par', 'entre', 'suite', 'cadre', 'relative', 'relatif',
  'concernant', 'objet', 'marche', 'marches', 'lot', 'lots', 'prestation', 'prestations', 'mission', 'missions', 'assistance', 'maitrise', 'ouvrage',
  'travaux', 'commune', 'ville', 'departement', 'communaute', 'communes', 'accord', 'accords', 'cadre', 'service', 'services', 'realisation',
  'operation', 'projet', 'etude', 'etudes', 'dans', 'leur', 'tout', 'tous', 'plus', 'autres', 'type', 'site', 'sites'];

function Veille_motsObjet_(objet) {
  var vus = {};
  return Veille_norm_(objet).split(/[^a-z0-9]+/).filter(function (w) {
    if (w.length < 4 || /^\d+$/.test(w) || VEILLE_MOTS_VIDES.indexOf(w) >= 0 || vus[w]) return false;
    vus[w] = true;
    return true;
  });
}

/** Statistiques apprises : { actif, decisions, retenus, ecartes, mots: { mot: [retenus, ecartes] } }. */
function Veille_apprentissage_() {
  var actif = Params_texte('veille.apprentissage', 'oui').toLowerCase() === 'oui';
  var res = { actif: false, decisions: 0, retenus: 0, ecartes: 0, mots: {} };
  if (!actif) return res;
  var affaires = {};
  Db_lire(TABLES.AFFAIRES).forEach(function (a) { affaires[String(a.id)] = a; });
  var exemples = [], avisLies = {};
  var avis = Db_lire(TABLES.AVIS);
  try { avis = avis.concat(Db_lire(TABLES.AVIS_ARCHIVES)); } catch (e) { /* onglet absent */ }
  avis.forEach(function (x) {
    if (x.statut === 'ignoré') exemples.push({ objet: x.objet, retenu: false });
    else if (x.statut === 'étudié' && x.id_affaire && affaires[String(x.id_affaire)]) {
      avisLies[String(x.id_affaire)] = true;
      exemples.push({ objet: x.objet, retenu: affaires[String(x.id_affaire)].statut !== 'No-go' });
    }
  });
  // Affaires créées à la main (sans avis) : leur décision compte aussi
  Object.keys(affaires).forEach(function (id) {
    var a = affaires[id];
    if (avisLies[id] || /^\[EXERCICE\]/.test(String(a.objet || ''))) return;
    if (a.statut === 'No-go') exemples.push({ objet: a.objet, retenu: false });
    else if (['Go', 'Déposée', 'Gagnée', 'Perdue', 'Sans suite', 'Soldée', 'Abandonnée'].indexOf(String(a.statut)) >= 0) exemples.push({ objet: a.objet, retenu: true });
  });
  res.decisions = exemples.length;
  if (exemples.length < Params_nombre('veille.apprentissage_min', 15)) return res;
  exemples.forEach(function (ex) {
    if (ex.retenu) res.retenus++; else res.ecartes++;
    Veille_motsObjet_(ex.objet).forEach(function (w) {
      var m = res.mots[w] = res.mots[w] || [0, 0];
      m[ex.retenu ? 0 : 1]++;
    });
  });
  res.actif = res.retenus > 0 && res.ecartes > 0;
  return res;
}

/**
 * Ajustement « Historique » d'un objet d'avis : { points, plus: [mots], moins: [mots] } ou null.
 * Un mot compte s'il apparaît dans au moins 3 décisions ; il faut au moins 2 mots connus.
 */
function Veille_ajustementHistorique_(objet, app) {
  if (!app || !app.actif) return null;
  var base = (app.retenus + 1) / (app.retenus + app.ecartes + 2);
  var connus = Veille_motsObjet_(objet).map(function (w) {
    var m = app.mots[w];
    if (!m || m[0] + m[1] < 3) return null;
    return { mot: w, ecart: (m[0] + 1) / (m[0] + m[1] + 2) - base };
  }).filter(Boolean);
  if (connus.length < 2) return null;
  var moyenne = connus.reduce(function (s, c) { return s + c.ecart; }, 0) / connus.length;
  var max = Params_nombre('score.apprentissage_max', 10);
  var points = Math.round(Math.max(-1, Math.min(1, moyenne * 2)) * max);
  if (!points) return null;
  connus.sort(function (x, y) { return x.ecart - y.ecart; });
  return {
    points: points,
    moins: connus.filter(function (c) { return c.ecart < -0.1; }).slice(0, 3).map(function (c) { return c.mot; }),
    plus: connus.filter(function (c) { return c.ecart > 0.1; }).reverse().slice(0, 3).map(function (c) { return c.mot; })
  };
}
