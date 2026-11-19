/**
 * Module Estimation — estimation au ratio (étape 5, mode ratio ; le mode détaillé viendra avec les prix unitaires).
 *
 * Montant d'un lot = médiane du ratio (€ HT/m², actualisée au dernier index du lot) × surface × projection × K.
 * Puis aléas de la phase et TVA du département. Une estimation est un brouillon tant qu'elle n'est pas figée ;
 * figée, elle n'est plus modifiable (l'export reste identique).
 */

/** Lettre d'indice suivante pour une affaire et une phase (A, B… Z, puis AA). */
function Est_indiceSuivant_(idAffaire, phase) {
  var lettres = Db_lire(EST_TABLES.ESTIMATIONS).filter(function (e) {
    return String(e.id_affaire) === String(idAffaire) && String(e.phase) === String(phase);
  }).map(function (e) { return String(e.indice || ''); });
  if (!lettres.length) return 'A';
  var max = lettres.sort(function (a, b) { return a.length - b.length || a.localeCompare(b); }).pop();
  return max === 'Z' ? 'AA' : (max.length === 1 ? String.fromCharCode(max.charCodeAt(0) + 1) : max + 'A');
}

/**
 * Calcule une estimation sans l'enregistrer (aperçu) : renvoie { entete, lignes, totaux, k, avertissements }.
 * d : { id_affaire, phase, typologie, nature, departement, surface, k_ids: [...], mois_indice (AAAA-MM ou ''),
 *       date_travaux (MM/AAAA ou ''), lots: [codes], tva (facultatif) }.
 */
function Est_calculer_(d) {
  var a = Affaires_get_(d.id_affaire);
  if (Est_paramListe_('est.phases').indexOf(d.phase) < 0) throw new Error('Phase attendue parmi : ' + Est_paramListe_('est.phases').join(', ') + '.');
  var m = Est_validerMarche_({ typologie: d.typologie, nature: d.nature, departement: d.departement, m0: '01/2000', surface: d.surface });
  var lotsChoisis = (d.lots || []).map(function (x) { return String(x).toUpperCase(); });
  if (!lotsChoisis.length) throw new Error('Choisissez au moins un lot.');
  var k = Est_calculerK_(d.k_ids || []);
  var moisIndice = d.mois_indice ? Est_mois_(d.mois_indice) : '';
  var travaux = d.date_travaux ? Est_mois_(d.date_travaux) : '';
  if (d.date_travaux && !travaux) throw new Error('Date des travaux : format MM/AAAA attendu.');
  var ratios = {};
  Est_ratios_(m.typologie, m.nature, moisIndice || null).forEach(function (r) { ratios[r.lot] = r; });
  var lots = {};
  Db_lire(EST_TABLES.LOTS).forEach(function (l) { lots[l.code] = l; });
  var avert = [];
  lotsChoisis.sort(function (x, y) { return ((lots[x] || {}).ordre || 999) - ((lots[y] || {}).ordre || 999); });
  var lignes = lotsChoisis.map(function (code, i) {
    var lot = lots[code];
    if (!lot) throw new Error('Lot inconnu : ' + code);
    var r = ratios[code];
    var base = {
      lot: code, num_article: ('0' + (i + 1)).slice(-2), designation: lot.libelle, unite: 'm²', quantite: m.surface,
      coef_k: k.k, source: 'ratio', fiabilite: 'C'
    };
    if (!r || !r.utilisable || !(r.mediane > 0)) {
      avert.push(code + ' : ' + (!r ? 'aucun marché importé pour cette typologie et cette nature' : 'ratio masqué (moins de ' + Est_param_('est.seuil_anonymat', '3') + ' marchés)') + ', PU à saisir.');
      return Object.assign(base, {
        pu_m0: 0, m0: '', indice: '', indice_mois: '', indice_valeur: '', coef_actualisation: 1, pu_ht: 0, total_ht: 0,
        source: 'saisie', id_source: '', commentaire: 'Pas de ratio : PU à saisir.'
      });
    }
    var proj = travaux && r.moisIndice ? Est_projection_(r.moisIndice, travaux) : { coef: 1, mois: 0 };
    var valeur = r.moisIndice ? Est_valeurIndice_(r.indice, r.moisIndice) : null;
    var pu = Est_arrondi_(r.mediane * proj.coef * k.k);
    if (r.sousSeuil) avert.push(code + ' : ratio fondé sur ' + r.n + ' marché(s), sous le seuil de ' + Est_param_('est.seuil_anonymat', '3') + ' : à confirmer.');
    if (r.nonActualisees) avert.push(code + ' : ' + r.nonActualisees + ' observation(s) non actualisée(s) (index du mois M0 absent).');
    return Object.assign(base, {
      pu_m0: r.mediane, m0: r.moisIndice, indice: r.indice, indice_mois: r.moisIndice, indice_valeur: valeur ? valeur.valeur : '',
      coef_actualisation: Est_arrondi_(proj.coef, 4), pu_ht: pu, total_ht: Est_arrondi_(pu * m.surface),
      id_source: r.n + ' marché(s)', fiabilite: r.fiabilite,
      commentaire: 'Médiane de ' + r.n + ' marché(s) (' + Est_fr_(r.min) + ' à ' + Est_fr_(r.max) + ' €/m²), actualisée ' + r.indice + ' ' +
        Est_moisLisible_(r.moisIndice) + (proj.mois ? ' ; projection ' + Est_moisLisible_(travaux) + ' × ' + Est_fr_(proj.coef, 4) : '') +
        ' ; K ' + Est_fr_(k.k, 4)
    });
  });
  var tva = d.tva !== undefined && d.tva !== '' && d.tva !== null ? Number(String(d.tva).replace(',', '.')) : Est_tvaPour_(m.departement);
  var aleas = Est_aleasPct_(d.phase);
  return {
    entete: {
      id_affaire: a.id, phase: d.phase, typologie: m.typologie, nature: m.nature, departement: m.departement, surface_sdp: m.surface,
      k: k.k, k_detail: k.detail.map(function (x) { return x.facteur + ' ' + x.modalite + ' (' + Est_fr_(x.coefficient) + ')'; }).join(' + '),
      mode: 'ratio', mois_indice_bt: lignes.filter(function (l) { return l.indice_mois; }).map(function (l) { return l.indice_mois; }).sort().pop() || '',
      date_travaux: travaux, tva: tva, aleas_pct: aleas
    },
    lignes: lignes, totaux: Est_totaux_(lignes, aleas, tva), k: k, avertissements: avert
  };
}

/** Crée l'estimation (brouillon) et ses lignes. Renvoie l'estimation complète. */
function Est_creerEstimation_(d) {
  var c = Est_calculer_(d);
  var e = Db_inserer(EST_TABLES.ESTIMATIONS, Object.assign({}, c.entete, {
    indice: Est_indiceSuivant_(c.entete.id_affaire, c.entete.phase), statut: 'brouillon',
    total_ht: Est_arrondi_(c.totaux.htAleas), total_ttc: Est_arrondi_(c.totaux.ttc),
    commentaire: c.avertissements.join(' ').slice(0, 500)
  }));
  Db_insererPlusieurs(EST_TABLES.LIGNES, c.lignes.map(function (l) { return Object.assign({ id_estimation: e.id }, l); }));
  Est_journal_('estimation', 'créée', e.id + ' (' + e.id_affaire + ', ' + e.phase + ' ind ' + e.indice + ')');
  return Est_estimationComplete_(e.id);
}

/** Estimation, lignes (ordre des lots), totaux et affaire. */
function Est_estimationComplete_(id) {
  var e = Db_trouver(EST_TABLES.ESTIMATIONS, id);
  if (!e) throw new Error('Estimation introuvable : ' + id);
  var lignes = Db_lire(EST_TABLES.LIGNES).filter(function (l) { return String(l.id_estimation) === String(id); })
    .sort(function (x, y) { return String(x.num_article).localeCompare(String(y.num_article), 'fr', { numeric: true }); });
  var a = Db_trouver(TABLES.AFFAIRES, e.id_affaire) || {};
  var typo = Db_trouver(EST_TABLES.TYPOLOGIES, e.typologie) || {};
  return {
    estimation: Est_versClient_('ESTIMATIONS', e),
    lignes: lignes.map(function (l) { return Est_versClient_('LIGNES', l); }),
    totaux: Est_totaux_(lignes, e.aleas_pct, e.tva),
    affaire: { id: a.id || e.id_affaire, acheteur: a.acheteur || '', objet: a.objet || '' },
    typologie: typo.libelle || e.typologie
  };
}

function Est_estimationModifiable_(id) {
  var e = Db_trouver(EST_TABLES.ESTIMATIONS, id);
  if (!e) throw new Error('Estimation introuvable : ' + id);
  if (e.statut === 'figée') throw new Error('Estimation figée : créez un nouvel indice pour la modifier.');
  return e;
}

/** Met à jour les totaux enregistrés d'une estimation après une modification de ligne. */
function Est_recalculerTotaux_(id) {
  var c = Est_estimationComplete_(id);
  Db_maj(EST_TABLES.ESTIMATIONS, id, { total_ht: Est_arrondi_(c.totaux.htAleas), total_ttc: Est_arrondi_(c.totaux.ttc) });
  return Est_estimationComplete_(id);
}

/** Modifie une ligne : PU HT, quantité ou désignation. Un PU saisi remplace le ratio (source « saisie », fiabilité C). */
function Est_ligneMaj_(idLigne, champs) {
  var l = Db_trouver(EST_TABLES.LIGNES, idLigne);
  if (!l) throw new Error('Ligne introuvable : ' + idLigne);
  Est_estimationModifiable_(l.id_estimation);
  var maj = {};
  var nombre = function (v, nom) {
    var n = Number(String(v).replace(/[\s €]/g, '').replace(',', '.'));
    if (!isFinite(n) || n < 0) throw new Error(nom + ' : nombre positif attendu.');
    return n;
  };
  if ('designation' in champs) {
    var t = String(champs.designation || '').trim();
    if (!t) throw new Error('Désignation obligatoire.');
    maj.designation = t.slice(0, 200);
  }
  var pu = 'pu_ht' in champs ? Est_arrondi_(nombre(champs.pu_ht, 'PU HT')) : Number(l.pu_ht);
  var q = 'quantite' in champs ? nombre(champs.quantite, 'Quantité') : Number(l.quantite);
  if ('pu_ht' in champs && pu !== Number(l.pu_ht)) {
    maj.source = 'saisie';
    maj.fiabilite = 'C';
    maj.commentaire = ('PU saisi' + (l.source === 'ratio' ? ' (ratio : ' + Est_fr_(l.pu_ht) + ' €/m²)' : '') + '. ' + String(l.commentaire || '')).slice(0, 300);
  }
  maj.pu_ht = pu;
  maj.quantite = q;
  maj.total_ht = Est_arrondi_(pu * q);
  Db_maj(EST_TABLES.LIGNES, idLigne, maj);
  return Est_recalculerTotaux_(l.id_estimation);
}

function Est_figer_(id) {
  Est_estimationModifiable_(id);
  Db_maj(EST_TABLES.ESTIMATIONS, id, { statut: 'figée' });
  return Est_estimationComplete_(id);
}

/** Supprime une estimation en brouillon et ses lignes. */
function Est_supprimerEstimation_(id) {
  Est_estimationModifiable_(id);
  Db_supprimerSi(EST_TABLES.LIGNES, function (l) { return String(l.id_estimation) === String(id); });
  Db_supprimerSi(EST_TABLES.ESTIMATIONS, function (e) { return String(e.id) === String(id); });
  Est_journal_('estimation', 'supprimée', String(id));
  return true;
}

/** Données du formulaire « Nouvelle estimation » : listes et valeurs proposées. */
function Est_formulaire_(idAffaire) {
  var actifs = function (t) { return Db_lire(t).filter(function (l) { return l.actif === 'oui'; }); };
  var ordre = function (x, y) { return (Number(x.ordre) || 0) - (Number(y.ordre) || 0); };
  var k = {};
  actifs(EST_TABLES.K).forEach(function (l) {
    var f = Est_estKdep_(l.facteur) ? 'kdép' : String(l.facteur);
    (k[f] = k[f] || []).push({ id: String(l.id), modalite: String(l.modalite), coefficient: Number(l.coefficient) });
  });
  var affaires = Db_lire(TABLES.AFFAIRES).map(function (a) {
    return { id: a.id, acheteur: a.acheteur, objet: a.objet, departement: String(a.departement || ''), statut: a.statut };
  }).sort(function (x, y) { return String(y.id).localeCompare(String(x.id), 'fr', { numeric: true }); });
  var etat = Est_etatIndices_();
  return {
    affaires: affaires, choisie: idAffaire || '',
    phases: Est_paramListe_('est.phases'), natures: Est_paramListe_('est.natures'),
    typologies: actifs(EST_TABLES.TYPOLOGIES).sort(ordre).map(function (t) { return { code: t.code, libelle: t.libelle }; }),
    lots: actifs(EST_TABLES.LOTS).sort(ordre).map(function (l) { return { code: l.code, libelle: l.libelle }; }),
    k: k, kMode: Est_param_('est.k_mode', 'kloc'), tvaZones: Est_paramDico_('est.tva_zones'), tvaDefaut: Est_paramNombre_('est.tva_defaut', 20),
    aleas: Est_paramDico_('est.aleas'), dernierIndex: etat && etat.bt01 ? etat.bt01.mois : ''
  };
}
