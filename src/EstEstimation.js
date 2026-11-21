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

/** Ligne sans ratio : PU à saisir. Repérée par id_source « sans ratio » pour être reprise quand un ratio arrive. */
var EST_SANS_RATIO = 'sans ratio';

/**
 * Valeurs d'une ligne au ratio : PU = médiane × projection × K ; total = PU × quantité.
 * Sans ratio utilisable : PU 0, source « saisie », id_source « sans ratio ». Renvoie { champs, avertissements }.
 */
function Est_valeursLigne_(code, r, quantite, k, travaux) {
  var seuil = Est_param_('est.seuil_anonymat', '3');
  if (!r || !r.utilisable || !(r.mediane > 0)) {
    return {
      champs: {
        pu_m0: 0, m0: '', indice: '', indice_mois: '', indice_valeur: '', coef_actualisation: 1, pu_ht: 0, total_ht: 0,
        source: 'saisie', id_source: EST_SANS_RATIO, fiabilite: 'C', commentaire: 'Pas de ratio : PU à saisir.'
      },
      avertissements: [code + ' : ' + (!r ? 'aucun marché importé pour cette typologie et cette nature' : 'ratio masqué (moins de ' + seuil + ' marchés)') + ', PU à saisir.']
    };
  }
  var avert = [];
  var proj = travaux && r.moisIndice ? Est_projection_(r.moisIndice, travaux) : { coef: 1, mois: 0 };
  var valeur = r.moisIndice ? Est_valeurIndice_(r.indice, r.moisIndice) : null;
  var pu = Est_arrondi_(r.mediane * proj.coef * k);
  if (r.sousSeuil) avert.push(code + ' : ratio fondé sur ' + r.n + ' marché(s), sous le seuil de ' + seuil + ' : à confirmer.');
  if (r.nonActualisees) avert.push(code + ' : ' + r.nonActualisees + ' observation(s) non actualisée(s) (index du mois M0 absent).');
  return {
    champs: {
      pu_m0: r.mediane, m0: r.moisIndice, indice: r.indice, indice_mois: r.moisIndice, indice_valeur: valeur ? valeur.valeur : '',
      coef_actualisation: Est_arrondi_(proj.coef, 4), pu_ht: pu, total_ht: Est_arrondi_(pu * Number(quantite)),
      source: 'ratio', id_source: r.n + ' marché(s)', fiabilite: r.fiabilite,
      commentaire: 'Médiane de ' + r.n + ' marché(s) (' + Est_fr_(r.min) + ' à ' + Est_fr_(r.max) + ' €/m²), actualisée ' + r.indice + ' ' +
        Est_moisLisible_(r.moisIndice) + (proj.mois ? ' ; projection ' + Est_moisLisible_(travaux) + ' × ' + Est_fr_(proj.coef, 4) : '') +
        ' ; K ' + Est_fr_(k, 4)
    },
    avertissements: avert
  };
}

/** Ligne qui suit la bibliothèque : au ratio, ou sans ratio et PU encore à 0. Un PU saisi à la main est conservé. */
function Est_ligneSuitRatio_(l) {
  return l.source === 'ratio' || (l.source === 'saisie' && !(Number(l.pu_ht) > 0) &&
    (l.id_source === EST_SANS_RATIO || /^Pas de ratio/.test(String(l.commentaire || ''))));
}

/**
 * Brouillon : reprend les ratios actuels de la bibliothèque (imports, annulations, nouveaux index) pour les lignes
 * qui les suivent, puis recalcule les totaux. Sans effet sur une estimation figée. Renvoie le nombre de lignes modifiées.
 */
function Est_actualiserBrouillon_(id) {
  var e = Db_trouver(EST_TABLES.ESTIMATIONS, id);
  if (!e || e.statut === 'figée') return 0;
  var ratios = {};
  Est_ratios_(e.typologie, e.nature, null).forEach(function (r) { ratios[r.lot] = r; });
  var lignes = Db_lire(EST_TABLES.LIGNES).filter(function (l) { return String(l.id_estimation) === String(id); });
  var champsSuivis = ['pu_m0', 'm0', 'indice', 'indice_mois', 'indice_valeur', 'coef_actualisation', 'pu_ht', 'total_ht', 'source', 'id_source', 'fiabilite', 'commentaire'];
  var n = 0, avert = [];
  lignes.forEach(function (l) {
    if (!Est_ligneSuitRatio_(l)) return;
    var v = Est_valeursLigne_(l.lot, ratios[l.lot], l.quantite, Number(e.k) || 1, e.date_travaux ? Est_mois_(e.date_travaux) : '');
    avert = avert.concat(v.avertissements);
    var maj = {};
    champsSuivis.forEach(function (c) { if (String(v.champs[c]) !== String(l[c] === undefined ? '' : l[c])) maj[c] = v.champs[c]; });
    if (Object.keys(maj).length) { Db_maj(EST_TABLES.LIGNES, l.id, maj); n++; }
  });
  if (n) {
    var c = Est_estimationComplete_(id);
    var mois = c.lignes.filter(function (l) { return l.indice_mois; }).map(function (l) { return l.indice_mois; }).sort().pop() || '';
    Db_maj(EST_TABLES.ESTIMATIONS, id, {
      total_ht: Est_arrondi_(c.totaux.htAleas), total_ttc: Est_arrondi_(c.totaux.ttc), mois_indice_bt: mois, commentaire: avert.join(' ').slice(0, 500)
    });
    Est_journal_('estimation', 'ratios actualisés', id + ' : ' + n + ' ligne(s)');
  }
  return n;
}

/** Actualise toutes les estimations en brouillon (après un import ou une annulation). Renvoie le nombre d'estimations modifiées. */
function Est_actualiserBrouillons_() {
  return Db_lire(EST_TABLES.ESTIMATIONS).filter(function (e) { return e.statut !== 'figée'; })
    .reduce(function (s, e) { return s + (Est_actualiserBrouillon_(e.id) ? 1 : 0); }, 0);
}

/**
 * Calcule une estimation sans l'enregistrer (aperçu) : renvoie { entete, lignes, totaux, k, avertissements }.
 * d : { id_affaire, phase, typologie, nature, departement, surface, k_ids: [...], mois_indice (AAAA-MM ou ''),
 *       date_travaux (MM/AAAA ou ''), lots: [codes], tva (facultatif) }.
 */
function Est_calculer_(d) {
  // Chiffrage rapide (accueil Estimation) : sans affaire, phase par défaut, kdép déduit du département.
  var a = d.id_affaire ? Affaires_get_(d.id_affaire) : { id: '' };
  var phases = Est_paramListe_('est.phases');
  if (!d.phase && !d.id_affaire) d.phase = phases[1] || phases[0];
  if (phases.indexOf(d.phase) < 0) throw new Error('Phase attendue parmi : ' + phases.join(', ') + '.');
  var m = Est_validerMarche_({ typologie: d.typologie, nature: d.nature, departement: d.departement, m0: '01/2000', surface: d.surface });
  var lotsChoisis = (d.lots || []).map(function (x) { return String(x).toUpperCase(); });
  if (!lotsChoisis.length && !d.id_affaire) {
    lotsChoisis = Est_ratios_(m.typologie, m.nature, null).filter(function (r) { return r.utilisable; }).map(function (r) { return r.lot; });
    if (!lotsChoisis.length) throw new Error('Aucun ratio pour cette typologie et cette nature : importez des marchés dans la bibliothèque.');
  }
  if (!lotsChoisis.length) throw new Error('Choisissez au moins un lot.');
  var kIds = (d.k_ids || []).slice();
  if (!kIds.length) { var kd = Est_kdepPour_(m.departement); if (kd) kIds.push(String(kd.id)); }
  var k = Est_calculerK_(kIds);
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
    var v = Est_valeursLigne_(code, ratios[code], m.surface, k.k, travaux);
    avert = avert.concat(v.avertissements);
    return Object.assign({
      lot: code, num_article: ('0' + (i + 1)).slice(-2), designation: lot.libelle, unite: 'm²', quantite: m.surface, coef_k: k.k
    }, v.champs);
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

/**
 * Change la surface de référence d'un brouillon : les lignes au m² qui portaient l'ancienne surface la reprennent,
 * les totaux sont recalculés. Les autres quantités (saisies à la main) ne bougent pas.
 */
function Est_modifierSurface_(id, surface) {
  var e = Est_estimationModifiable_(id);
  var s = Number(String(surface).replace(/[\s m²]/g, '').replace(',', '.'));
  if (!(s > 0)) throw new Error('Surface de référence : nombre de m² supérieur à 0 attendu.');
  var ancienne = Number(e.surface_sdp);
  Db_lire(EST_TABLES.LIGNES).forEach(function (l) {
    if (String(l.id_estimation) !== String(id) || String(l.unite) !== 'm²' || Number(l.quantite) !== ancienne) return;
    Db_maj(EST_TABLES.LIGNES, l.id, { quantite: s, total_ht: Est_arrondi_(Number(l.pu_ht) * s) });
  });
  Db_maj(EST_TABLES.ESTIMATIONS, id, { surface_sdp: s });
  Est_journal_('estimation', 'surface modifiée', id + ' : ' + Est_fr_(ancienne) + ' → ' + Est_fr_(s) + ' m²');
  return Est_recalculerTotaux_(id);
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
