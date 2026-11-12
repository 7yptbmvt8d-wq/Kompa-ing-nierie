/**
 * Module Veille (§ 3) : collecte BOAMP + alertes Gmail, filtres, dédoublonnage, pré-score.
 *
 * API BOAMP (open data DILA, Opendatasoft) — champs confirmés le 12/11/2026 :
 *   idweb, objet, nomacheteur, code_departement[], dateparution, datelimitereponse,
 *   nature (APPEL_OFFRE…), type_marche[] (SERVICES…), procedure_libelle,
 *   descripteur_libelle[], url_avis, donnees (JSON : CPV, montant estimé, référence).
 * Les départements arrivent parfois sans zéro (« 4 ») : normalisés en « 04 ».
 */

var BOAMP_API = 'https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records';
var SOURCE_BOAMP = 'BOAMP';
var SOURCE_GMAIL = 'Alerte e-mail';

// ——— Collecte quotidienne (déclencheur 6 h) ———

function collecteQuotidienne() {
  var verrou = LockService.getScriptLock();
  if (!verrou.tryLock(1000)) { console.warn('Collecte déjà en cours.'); return null; }
  try {
    var ctx = Veille_contexte_();
    var bilan = [Veille_executer_(SOURCE_BOAMP, function () { return Veille_lireBoamp_(ctx); }, ctx),
      Veille_executer_(SOURCE_GMAIL, function () { return Veille_lireGmail_(ctx); }, ctx)];
    try { Relances_synchroniser(); } catch (e) { console.error('Relances : ' + e.message); }
    try { Veille_archiver_(); } catch (e) { console.error('Archivage : ' + e.message); }
    console.log(JSON.stringify(bilan));
    return bilan;
  } finally {
    verrou.releaseLock();
  }
}

/** Paramètres et données lus une fois par collecte. */
function Veille_contexte_() {
  var ca = Compteur_ca();
  var vise = (ca.jalons.filter(function (j) { return j.cle === 'seuil.plafond_vise'; })[0] || {}).resteEngage;
  return {
    aujourdhui: (function () { var d = new Date(); d.setHours(0, 0, 0, 0); return d; })(),
    cpv: Params_liste('veille.cpv'),
    motsCles: Params_liste('veille.mots_cles').map(Veille_norm_),
    motsCoeur: Params_liste('veille.mots_cles_coeur').map(Veille_norm_),
    exclusions: Params_liste('veille.exclusions').map(Veille_norm_),
    exclusionMoe: Veille_norm_(Params_texte('veille.exclusion_moe', '')),
    exceptionMoe: Veille_norm_(Params_texte('veille.exception_moe', '')),
    paca: Params_liste('zone.departements_paca'),
    libellePaca: Params_texte('zone.libelle_paca', 'PACA'),
    libelleFrance: Params_texte('zone.libelle_france', 'France — présentiel à vérifier'),
    jours: Params_nombre('veille.fenetre_jours', 3),
    montantMax: Params_nombre('capacite.montant_max_mission', null),
    resteSousPlafond: typeof vise === 'number' ? vise : null,
    existants: Db_lire(TABLES.AVIS)
  };
}

/** Exécute une source, filtre, dédoublonne, enregistre et journalise. */
function Veille_executer_(source, lire, ctx) {
  var debut = Date.now();
  var bilan = { source: source, lus: 0, exclus: 0, doublons: 0, retenus: 0, erreurs: '' };
  try {
    var bruts = lire();
    bilan.lus = bruts.length;
    var nouveaux = [];
    bruts.forEach(function (a) {
      var f = Veille_filtrer_(a, ctx);
      if (!f.garde) { bilan.exclus++; return; }
      var d = Veille_doublon_(a, ctx.existants.concat(nouveaux));
      if (d) {
        bilan.doublons++;
        if (d.id && d.lien !== a.lien && String(d.liens_autres || '').indexOf(a.lien) < 0 && a.lien) {
          d.liens_autres = (d.liens_autres ? d.liens_autres + '\n' : '') + a.lien;
          Db_maj(TABLES.AVIS, d.id, { liens_autres: d.liens_autres });
        } else if (!d.id && a.lien && d.lien !== a.lien) {
          d.liens_autres = (d.liens_autres ? d.liens_autres + '\n' : '') + a.lien;
        }
        return;
      }
      Veille_scorer_(a, ctx);
      nouveaux.push(a);
    });
    var enregistres = Db_insererPlusieurs(TABLES.AVIS, nouveaux);
    ctx.existants = ctx.existants.concat(enregistres);
    bilan.retenus = enregistres.length;
  } catch (e) {
    bilan.erreurs = String(e && e.message ? e.message : e);
    console.error(source + ' : ' + bilan.erreurs);
  }
  bilan.duree_s = Math.round((Date.now() - debut) / 100) / 10;
  Db_inserer(TABLES.JOURNAL_MOTEUR, {
    date: new Date(), source: source, avis_lus: bilan.lus, avis_retenus: bilan.retenus,
    exclus: bilan.exclus, doublons: bilan.doublons, erreurs: bilan.erreurs, duree_s: bilan.duree_s
  });
  return bilan;
}

// ——— Source BOAMP ———

function Veille_requeteBoamp_(ctx, depuis) {
  var q = function (t) { return '"' + String(t).replace(/["\\]/g, ' ') + '"'; };
  var conditions = ['descripteur_libelle=' + q('Assistance à maîtrise d\'ouvrage')]
    .concat(ctx.cpv.map(function (c) { return 'donnees like \'%' + c.replace(/\D/g, '') + '%\''; }))
    .concat(Params_liste('veille.mots_cles').map(function (m) { return 'search(objet,' + q(m) + ')'; }));
  return 'dateparution>=date\'' + depuis + '\' and nature=\'APPEL_OFFRE\' and type_marche=\'SERVICES\' and (' +
    conditions.join(' or ') + ')';
}

function Veille_lireBoamp_(ctx) {
  var depuis = new Date(ctx.aujourdhui.getTime() - ctx.jours * 86400000);
  var where = Veille_requeteBoamp_(ctx, jourIso_(depuis));
  var resultats = [], offset = 0, total = Infinity;
  while (offset < total && offset < 1000) {
    var url = BOAMP_API + '?where=' + encodeURIComponent(where) + '&order_by=dateparution&limit=100&offset=' + offset;
    var json = Veille_fetchJson_(url);
    total = json.total_count || 0;
    resultats = resultats.concat(json.results || []);
    if (!json.results || !json.results.length) break;
    offset += json.results.length;
  }
  return resultats.map(function (r) { return Veille_depuisBoamp_(r, ctx); });
}

/** Appel HTTP avec 3 essais (l'API coupe parfois la connexion). */
function Veille_fetchJson_(url) {
  var derniere;
  for (var essai = 0; essai < 3; essai++) {
    try {
      var rep = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
      var code = rep.getResponseCode();
      var corps = JSON.parse(rep.getContentText());
      if (code === 200) return corps;
      derniere = new Error('BOAMP ' + code + ' : ' + (corps.message || ''));
      if (code >= 400 && code < 500) break; // requête invalide : inutile de réessayer
    } catch (e) {
      derniere = e;
    }
    Utilities.sleep(2000 * (essai + 1));
  }
  throw derniere;
}

/** Enregistrement BOAMP → avis. */
function Veille_depuisBoamp_(r, ctx) {
  var d = String(r.donnees || '');
  var deps = (r.code_departement || []).map(Veille_dep_);
  var cpv = [];
  var re1 = /"classPrincipale"\s*:\s*"(\d{8})/g, re2 = /"@listName"\s*:\s*"cpv"\s*,\s*"#text"\s*:\s*"(\d{8})/g, m;
  while ((m = re1.exec(d))) if (cpv.indexOf(m[1]) < 0) cpv.push(m[1]);
  while ((m = re2.exec(d))) if (cpv.indexOf(m[1]) < 0) cpv.push(m[1]);
  return {
    source: SOURCE_BOAMP,
    id_source: String(r.idweb),
    date_parution: date_(r.dateparution),
    acheteur: Veille_texte_(r.nomacheteur),
    type_acheteur: Veille_typeAcheteur_(r.nomacheteur),
    departement: deps.filter(function (x) { return ctx.paca.indexOf(x) >= 0; })[0] || deps[0] || '',
    departements: deps,
    objet: Veille_texte_(r.objet),
    cpv: cpv.join(';'),
    descripteurs: (r.descripteur_libelle || []).join(';'),
    reference_acheteur: Veille_referenceBoamp_(d),
    montant_estime: Veille_montantBoamp_(d),
    procedure: r.procedure_libelle || '',
    date_limite: r.datelimitereponse ? new Date(r.datelimitereponse) : '',
    lien: r.url_avis || ('https://www.boamp.fr/pages/avis/?q=idweb:' + r.idweb)
  };
}

function Veille_referenceBoamp_(d) {
  var m = d.match(/"identifiantInterne"\s*:\s*"([^"]+)"/);
  if (m) return m[1].trim();
  m = d.match(/"cac:ProcurementProject"\s*:\s*\{\s*"cbc:ID"\s*:\s*(?:"([^"]+)"|\{[^}]*"#text"\s*:\s*"([^"]+)")/);
  return m ? (m[1] || m[2]).trim() : '';
}

function Veille_montantBoamp_(d) {
  var m = d.match(/"cbc:EstimatedOverallContractAmount"\s*:\s*\{[^}]*"#text"\s*:\s*"([\d.]+)"/) ||
    d.match(/"valeurEstimee"\s*:\s*\{[^}]*?"valeur"\s*:\s*"([\d.]+)"/) ||
    d.match(/"valeurHaute"\s*:\s*"([\d.]+)"/);
  var n = m ? Number(m[1]) : 0;
  return n > 1 ? n : '';
}

// ——— Source Gmail (alertes des plateformes, libellé « Veille ») ———

function Veille_lireGmail_(ctx) {
  var libelle = Params_texte('veille.libelle_gmail', 'Veille');
  var threads = GmailApp.search('label:"' + libelle + '" newer_than:' + Math.max(ctx.jours, 1) + 'd', 0, 100);
  var props = PropertiesService.getScriptProperties();
  var traites = JSON.parse(props.getProperty('GMAIL_TRAITES') || '[]');
  var connus = {};
  traites.forEach(function (id) { connus[id] = true; });
  ctx.existants.forEach(function (a) { if (a.source === SOURCE_GMAIL) connus[a.id_source] = true; });
  var avis = [];
  threads.forEach(function (t) {
    t.getMessages().forEach(function (msg) {
      var id = 'gmail:' + msg.getId();
      if (connus[id]) return;
      connus[id] = true;
      traites.push(id);
      avis.push(Veille_depuisEmail_(id, msg.getSubject(), msg.getFrom(), msg.getPlainBody(), msg.getDate(), ctx));
    });
  });
  props.setProperty('GMAIL_TRAITES', JSON.stringify(traites.slice(-400)));
  return avis;
}

/**
 * Alerte e-mail → avis. V1 générique : un avis par e-mail (objet = sujet, lien = premier lien
 * vers une plateforme, date limite et département cherchés dans le texte). À affiner plateforme
 * par plateforme avec les premières alertes reçues.
 */
function Veille_depuisEmail_(id, sujet, de, corps, quand, ctx) {
  corps = String(corps || '');
  var liens = (corps.match(/https?:\/\/[^\s<>")\]]+/g) || []).filter(function (u) {
    return !/unsubscribe|desinscri|désinscri|desabonn|désabonn|\.(png|jpg|gif)(\?|$)|mailto:/i.test(u);
  });
  var domaines = Params_liste('veille.plateformes_domaines');
  var lien = liens.filter(function (u) { return domaines.some(function (dm) { return u.indexOf(dm) >= 0; }); })[0] || liens[0] || '';
  var dl = corps.match(/(?:date\s+limite|remise\s+des\s+(?:offres|plis)|r[ée]ception\s+des\s+(?:offres|plis))[^0-9]{0,60}(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/i);
  var dateLimite = dl ? new Date(Number(dl[3].length === 2 ? '20' + dl[3] : dl[3]), Number(dl[2]) - 1, Number(dl[1])) : '';
  var cp = corps.match(/\b(\d{2})\d{3}\b/g) || [];
  var deps = cp.map(function (c) { return c.slice(0, 2); });
  var acheteurMatch = corps.match(/(?:acheteur|organisme|pouvoir adjudicateur)\s*:\s*([^\n]+)/i);
  var acheteur = acheteurMatch ? acheteurMatch[1].trim() : String(de || '').replace(/<.*>/, '').replace(/"/g, '').trim();
  var objet = String(sujet || '').replace(/^(\s*(tr|fwd?|re)\s*:\s*)+/i, '').trim();
  return {
    source: SOURCE_GMAIL,
    id_source: id,
    date_parution: quand || new Date(),
    acheteur: acheteur,
    type_acheteur: Veille_typeAcheteur_(acheteur),
    departement: deps.filter(function (x) { return ctx.paca.indexOf(x) >= 0; })[0] || deps[0] || '',
    departements: deps,
    objet: objet,
    texte: corps.slice(0, 3000),
    cpv: (corps.match(/\b7\d{7}\b/g) || []).join(';'),
    descripteurs: '',
    reference_acheteur: '',
    montant_estime: '',
    procedure: '',
    date_limite: dateLimite,
    lien: lien
  };
}

// ——— Filtres (§ 3.2) ———

function Veille_filtrer_(a, ctx) {
  var objet = Veille_norm_(a.objet);
  var texte = objet + ' ' + Veille_norm_(a.texte || '');
  var excl = ctx.exclusions.filter(function (e) { return e && objet.indexOf(e) >= 0; })[0];
  if (excl) return { garde: false, motif: 'exclusion : ' + excl };
  if (ctx.exclusionMoe && objet.indexOf(ctx.exclusionMoe) >= 0 && objet.indexOf(ctx.exceptionMoe) < 0) {
    return { garde: false, motif: 'mission de maîtrise d\'œuvre' };
  }
  // Maîtrise d'œuvre sans AMO (variantes d'écriture : « maîtrise d'oeuvre », « MOE ») — texte normalisé
  if (/maitrise d.?oeuvre|\bmoe\b/.test(objet) && !/assistance a (la )?maitrise d.?ouvrage|\bamo\b/.test(objet)) {
    return { garde: false, motif: 'mission de maîtrise d\'œuvre' };
  }
  var cpvOk = String(a.cpv || '').split(';').some(function (c) { return ctx.cpv.indexOf(c) >= 0; });
  var descOk = /assistance a maitrise d.ouvrage/.test(Veille_norm_(a.descripteurs || ''));
  var motOk = ctx.motsCles.some(function (m) {
    return m.length <= 4 ? new RegExp('\\b' + m + '\\b').test(texte) : texte.indexOf(m) >= 0;
  });
  if (!(cpvOk || descOk || motOk)) return { garde: false, motif: 'hors CPV et mots-clés' };
  return { garde: true };
}

// ——— Dédoublonnage (§ 3.3) ———

function Veille_doublon_(a, existants) {
  var dl = a.date_limite ? jourIso_(a.date_limite instanceof Date ? a.date_limite : date_(a.date_limite) || new Date(a.date_limite)) : '';
  for (var i = 0; i < existants.length; i++) {
    var e = existants[i];
    if (e.source === a.source && String(e.id_source) === String(a.id_source)) return e;
    if (!Veille_memeAcheteur_(a.acheteur, e.acheteur)) continue;
    if (a.reference_acheteur && e.reference_acheteur &&
        Veille_norm_(a.reference_acheteur) === Veille_norm_(e.reference_acheteur)) return e;
    var edl = e.date_limite ? jourIso_(e.date_limite instanceof Date ? e.date_limite : date_(e.date_limite) || new Date(e.date_limite)) : '';
    if (dl && dl === edl && Veille_similarite_(a.objet, e.objet) >= 0.5) return e;
  }
  return null;
}

/** Même acheteur malgré des écritures différentes (« EHPAD X » / « EHPAD Résidence X »). */
function Veille_memeAcheteur_(x, y) {
  var mots = function (s) {
    return Veille_norm_(s).replace(/&#0?39;/g, ' ').split(/[^a-z0-9]+/).filter(function (w) {
      return w.length > 2 && ['commune', 'ville', 'mairie', 'des', 'les', 'residence'].indexOf(w) < 0;
    });
  };
  var a = mots(x), b = mots(y);
  if (!a.length || !b.length) return false;
  if (a.join(' ') === b.join(' ')) return true;
  var communs = a.filter(function (w) { return b.indexOf(w) >= 0; }).length;
  return communs / Math.min(a.length, b.length) >= 0.75 && Math.min(a.length, b.length) >= 2;
}

function Veille_similarite_(x, y) {
  var mots = function (s) { return Veille_norm_(s).split(/[^a-z0-9]+/).filter(function (w) { return w.length > 3; }); };
  var a = mots(x), b = mots(y);
  if (!a.length || !b.length) return 0;
  var communs = a.filter(function (w) { return b.indexOf(w) >= 0; }).length;
  return communs / Math.min(a.length, b.length);
}

// ——— Pré-score (§ 3.4) ———

function Veille_scorer_(a, ctx) {
  var p = function (cle, defaut) { return Params_nombre('score.' + cle, defaut); };
  var deps = a.departements || [a.departement];
  var paca = deps.some(function (d) { return ctx.paca.indexOf(d) >= 0; });
  var objet = Veille_norm_(a.objet);
  var coeur = ctx.motsCoeur.some(function (m) { return objet.indexOf(m) >= 0; });
  var jours = a.date_limite ? Math.floor(((a.date_limite instanceof Date ? a.date_limite : new Date(a.date_limite)) - ctx.aujourdhui) / 86400000) : null;
  var commune = a.type_acheteur === 'Commune' || a.type_acheteur === 'EPCI';
  var montant = Number(a.montant_estime) || 0;
  var plafond = [ctx.montantMax, ctx.resteSousPlafond].filter(function (v) { return typeof v === 'number' && v > 0; });
  var compatible = plafond.every(function (v) { return montant <= v; });

  var detail = {
    zone: paca ? p('zone_paca', 25) : p('zone_france', 10),
    mission: coeur ? p('mission_coeur', 30) : p('mission_autre', 15),
    delai: jours === null ? p('delai_10j', 8) : jours >= 15 ? p('delai_15j', 15) : jours >= 10 ? p('delai_10j', 8) : p('delai_court', 0),
    acheteur: commune ? p('acheteur_commune_epci', 15) : p('acheteur_autre', 10),
    montant: !montant ? p('montant_inconnu', 8) : compatible ? p('montant_compatible', 15) : p('montant_hors', 0)
  };
  var total = detail.zone + detail.mission + detail.delai + detail.acheteur + detail.montant;
  var classement = total >= p('seuil_etudier', 60) ? 'à étudier' : total >= p('seuil_possible', 40) ? 'possible' : 'archivé';

  a.zone = paca ? ctx.libellePaca : ctx.libelleFrance;
  if (paca && ctx.paca.indexOf(a.departement) < 0) a.departement = deps.filter(function (d) { return ctx.paca.indexOf(d) >= 0; })[0];
  a.pre_score = total;
  a.score_detail = 'Zone ' + detail.zone + ' · Mission ' + detail.mission + ' · Délai ' + detail.delai +
    (jours === null ? ' (date inconnue)' : ' (' + jours + ' j)') + ' · Acheteur ' + detail.acheteur + ' · Montant ' + detail.montant;
  a.alerte_delai = jours !== null && jours < 10 ? 'oui' : '';
  a.classement = classement;
  a.statut = classement === 'archivé' ? 'archivé' : 'nouveau';
  delete a.departements;
  delete a.descripteurs;
  delete a.texte;
  return a;
}

// ——— Archivage (allège l'onglet Avis) ———

/** Déplace dans « Avis archivés » les avis échus depuis plus de N jours (sans date : parus il y a plus de 2N jours). */
function Veille_archiver_(quand) {
  var auj = aujourdhui_(quand);
  var n = Params_nombre('veille.archivage_jours', 60);
  var limite = ajouterJours_(auj, -n), limiteParution = ajouterJours_(auj, -2 * n);
  var aArchiver = Db_lire(TABLES.AVIS).filter(function (a) {
    var dl = date_(a.date_limite), dp = date_(a.date_parution);
    return dl ? aujourdhui_(dl) < limite : (dp ? aujourdhui_(dp) < limiteParution : false);
  });
  if (!aArchiver.length) return 0;
  var ids = aArchiver.map(function (a) { return String(a.id); });
  Db_insererPlusieurs(TABLES.AVIS_ARCHIVES, aArchiver);
  Db_supprimerSi(TABLES.AVIS, function (a) { return ids.indexOf(String(a.id)) >= 0; });
  return aArchiver.length;
}

// ——— Actions sur les avis ———

/** « Étudier » : crée l'affaire (statut En étude) liée à l'avis. */
function Avis_etudier(idAvis) {
  var a = Db_trouver(TABLES.AVIS, idAvis);
  if (!a) throw new Error('Avis introuvable : ' + idAvis);
  if (a.id_affaire) return Affaires_get_(a.id_affaire);
  var affaire = Affaires_creer({
    acheteur: a.acheteur, type_acheteur: a.type_acheteur, departement: a.departement, objet: a.objet,
    reference_acheteur: a.reference_acheteur, procedure: Veille_procedure_(a.procedure),
    plateforme: a.source === SOURCE_BOAMP ? 'BOAMP' : '', lien_avis: a.lien,
    date_limite_remise: a.date_limite instanceof Date ? jourIso_(a.date_limite) : a.date_limite,
    pre_score: a.pre_score, id_avis: a.id
  }, { commentaire: 'Créée depuis l\'avis ' + a.id + ' (' + a.source + ', pré-score ' + a.pre_score + ')' });
  Db_maj(TABLES.AVIS, idAvis, { statut: 'étudié', id_affaire: affaire.id });
  return affaire;
}

function Avis_changerStatut(idAvis, statut) {
  if (['nouveau', 'ignoré', 'archivé'].indexOf(statut) < 0) throw new Error('Statut d\'avis non modifiable : ' + statut);
  var a = Db_trouver(TABLES.AVIS, idAvis);
  if (!a) throw new Error('Avis introuvable : ' + idAvis);
  if (a.statut === 'étudié') throw new Error('Avis déjà transformé en affaire (' + a.id_affaire + ').');
  return Db_maj(TABLES.AVIS, idAvis, { statut: statut });
}

// ——— Outils ———

function Veille_norm_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’`´]/g, '\'').replace(/œ/g, 'oe').replace(/\s+/g, ' ')
    .replace(/assistance a la maitrise/g, 'assistance a maitrise').trim();
}

function Veille_normAcheteur_(s) {
  return Veille_norm_(s).replace(/&#0?39;/g, '\'')
    .replace(/\b(commune|ville|mairie|de|du|des|la|le|les|d|l)\b/g, ' ').replace(/[^a-z0-9]+/g, '');
}

function Veille_texte_(s) {
  return String(s || '').replace(/&#0?39;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

function Veille_dep_(d) {
  d = String(d || '').trim();
  return /^\d$/.test(d) ? '0' + d : d.toUpperCase();
}

function Veille_typeAcheteur_(nom) {
  var n = ' ' + Veille_norm_(nom) + ' ';
  if (/\b(communaute|communautes|cnes|cte|metropole|agglomeration|agglo|syndicat|sivom|sivu|sivos|smi?|petr|pays|epci|cc|ca|cu|ccas)\b/.test(n)) return 'EPCI';
  if (/\b(commune|ville|mairie)\b/.test(n)) return 'Commune';
  if (/\b(departement|conseil departemental)\b/.test(n)) return 'Département';
  if (/\b(region|conseil regional)\b/.test(n)) return 'Région';
  if (/\b(habitat|logement|hlm|oph)\b/.test(n)) return 'Bailleur social';
  if (/\b(prefecture|ministere|dreal|ddt|sgami|direction|etat)\b/.test(n)) return 'État';
  if (/\b(universite|hopital|chu|chru|ch|ehpad|etablissement public|epf|cnfpt|lycee|college|ecole)\b/.test(n)) return 'Établissement public';
  return 'Autre acheteur public';
}

function Veille_procedure_(libelle) {
  var n = Veille_norm_(libelle);
  if (/adapt/.test(n)) return 'MAPA';
  if (/ouvert|restreint|appel d.offres/.test(n)) return 'AO';
  return libelle || '';
}
