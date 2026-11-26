/**
 * Accord-cadre à bons de commande (décision du 26/11/2026).
 *
 * - Offre : le bordereau des prix unitaires (BPU) est saisi ligne par ligne (désignation, unité, prix unitaire HT,
 *   quantité du détail quantitatif estimatif, DQE). Le montant du DQE devient le montant de l'offre (montant_ht).
 * - Exécution : chaque bon de commande (BC) reçu de l'acheteur remplace les tranches. Son code (n° du bon) sert de
 *   « tranche » au planning : livrables, facture, paiement, relances, Qonto (« KI-2027-004 BC-02 ») et CA prévisionnel.
 * - Périodes : début (ac_debut, à défaut la notification), durée d'une période (ac_duree_mois, 12 par défaut),
 *   nombre de reconductions (ac_reconductions) ; minimum et maximum HT par période (ac_minimum, ac_maximum).
 */

var TYPE_MARCHE_AC = 'Accord-cadre à bons de commande';
var TYPE_MARCHE_ORDINAIRE = 'Marché ordinaire';

function AC_est_(a) { return /accord/i.test(String((a && a.type_marche) || '')); }

// ——— BPU ———

function AC_bpu(idAffaire) {
  return Db_lire(TABLES.BPU)
    .filter(function (l) { return String(l.id_affaire) === String(idAffaire); })
    .sort(function (x, y) { return (Number(x.ordre) || 0) - (Number(y.ordre) || 0); })
    .map(function (l, i) {
      var pu = montant_(l.prix_unitaire), q = Number(String(l.quantite_dqe === '' ? 0 : l.quantite_dqe).replace(',', '.')) || 0;
      return { id: String(l.id), n: i + 1, numero: String(l.numero === '' || l.numero === undefined || l.numero === null ? i + 1 : l.numero),
        designation: String(l.designation || ''), unite: String(l.unite || ''),
        prix_unitaire: arrondi_(pu), quantite_dqe: q, montant: arrondi_(pu * q) };
    });
}

function AC_dqe_(lignes) {
  return arrondi_(lignes.reduce(function (s, l) { return s + l.montant; }, 0));
}

function AC_nombre_(v, libelle) {
  var t = String(v === undefined || v === null ? '' : v).replace(/[\s  €]/g, '').replace(',', '.');
  if (t === '') return 0;
  var n = Number(t);
  if (!(n >= 0)) throw new Error(libelle + ' : nombre attendu (« ' + v + ' »).');
  return n;
}

/**
 * Remplace le BPU de l'affaire par les lignes données [{ designation, unite, prix_unitaire, quantite_dqe }]
 * (lignes sans désignation ignorées). En accord-cadre, le montant de l'offre devient le montant du DQE.
 */
function AC_bpuEnregistrer(idAffaire, lignes) {
  var a = Affaires_get_(idAffaire);
  var propres = (lignes || []).map(function (l, i) {
    var d = String(l.designation || '').trim();
    if (!d) return null;
    return {
      id_affaire: idAffaire, ordre: (i + 1) * 10, numero: String(l.numero === undefined || l.numero === null ? '' : l.numero).trim().slice(0, 20) || String(i + 1),
      designation: d.slice(0, 300), unite: String(l.unite || '').trim().slice(0, 40),
      prix_unitaire: arrondi_(AC_nombre_(l.prix_unitaire, 'Prix unitaire de « ' + d + ' »')),
      quantite_dqe: AC_nombre_(l.quantite_dqe, 'Quantité de « ' + d + ' »')
    };
  }).filter(Boolean);
  Db_supprimerSi(TABLES.BPU, function (l) { return String(l.id_affaire) === String(idAffaire); });
  if (propres.length) Db_insererPlusieurs(TABLES.BPU, propres);
  var bpu = AC_bpu(idAffaire);
  if (AC_est_(a)) Db_maj(TABLES.AFFAIRES, idAffaire, { montant_ht: AC_dqe_(bpu) });
  return bpu;
}

/** N° de ligne d'un BPU d'acheteur : 1, 1.2, 1.2.3, 2-1, A, A1, A.2, II.3, art. 4… */
function AC_estNumeroBpu_(x) {
  var t = String(x || '').trim().replace(/^(art(icle)?\.?|n°|poste)\s*/i, '');
  return t.length > 0 && t.length <= 12 && /^([A-Z]{1,3}|\d+)([.\-\/ ]?(\d+|[A-Z]))*\.?$/i.test(t) && /\d|^[A-Z]{1,3}\.?$/i.test(t);
}

/**
 * Lit un BPU collé depuis Excel ou Google Sheets (colonnes séparées par des tabulations, ou « ; ») :
 * [n° de l'acheteur], désignation, [unité], [prix unitaire], [quantité], [montant…]. Le n° de l'acheteur
 * (1.1, A2…) est conservé. Le BPU du DCE est le plus souvent vierge de prix : une ligne sans prix est
 * gardée (prix à compléter) dès qu'elle a une unité ou une quantité. Ignorées : ligne d'en-tête,
 * titres de chapitre (n° et intitulé seuls), lignes vides.
 */
function AC_bpuLireTexte_(texte) {
  var out = [];
  var nb = function (x) {
    var t = String(x || '').replace(/[\s  €]/g, '').replace(/HT$/i, '');
    if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, ''); // 1.234,56
    t = t.replace(',', '.');
    return t !== '' && !isNaN(Number(t)) ? Number(t) : null;
  };
  String(texte || '').split(/\r?\n/).forEach(function (ligne) {
    if (!ligne.trim()) return;
    var c = ligne.split(ligne.indexOf('\t') >= 0 ? '\t' : ';').map(function (x) { return x.trim(); });
    while (c.length && c[0] === '') c.shift(); // colonne vide en tête (cellules fusionnées)
    var numero = '';
    // N° de l'acheteur en tête (1.1, A2…) suivi d'une désignation en texte
    if (c.length >= 2 && AC_estNumeroBpu_(c[0]) && c[1] && nb(c[1]) === null) {
      numero = c.shift().replace(/^(art(icle)?\.?|n°|poste)\s*/i, '');
    }
    var designation = c[0] || '';
    if (!designation || nb(designation) !== null) return;
    if (/^(n°|num[ée]ro|d[ée]signation.*|libell[ée].*|intitul[ée].*|prestations?|nature des prestations|description)$/i.test(designation)) return; // en-tête
    var reste = c.slice(1);
    var unite = '';
    if (reste.length && reste[0] && nb(reste[0]) === null) unite = reste.shift();
    if (/^unit[ée]s?$/i.test(unite)) return; // en-tête
    var pu = reste.length ? nb(reste[0]) : null;
    var q = reste.length > 1 ? nb(reste[1]) : null;
    if (pu === null && !unite && q === null) return; // titre de chapitre, total : ni unité, ni prix, ni quantité
    out.push({ numero: numero, designation: designation, unite: unite, prix_unitaire: pu === null ? 0 : pu, quantite_dqe: q === null ? 0 : q, sansPrix: pu === null });
  });
  return out;
}

/** Ajoute à la suite du BPU existant les lignes collées depuis Excel. Renvoie { ajoutees, bpu }. */
function AC_bpuColler(idAffaire, texte) {
  var nouvelles = AC_bpuLireTexte_(texte);
  if (!nouvelles.length) throw new Error('Aucune ligne reconnue : sélectionnez dans le tableur les colonnes n°, désignation, unité, prix et quantité (lignes de prestations, pas seulement les titres), copiez, puis collez.');
  var bpu = AC_bpuEnregistrer(idAffaire, AC_bpu(idAffaire).concat(nouvelles));
  return { ajoutees: nouvelles.length, sansPrix: nouvelles.filter(function (l) { return l.sansPrix; }).length, bpu: bpu };
}

/**
 * Fichier BPU déposé par le skill dans le dossier Drive de l'affaire (04 Offre, ou tout sous-dossier) :
 * « BPU-KI-AAAA-NNN.tsv » (ou .txt), colonnes n°, désignation, unité, prix unitaire HT, quantité.
 * Renvoie le plus récent { id, nom, date } ou null.
 */
function AC_fichierSkill_(a, avecFichier) {
  try {
    var dossier = Drive_dossierAffaire_(a);
    if (!dossier) return null;
    var trouve = null;
    var voir = function (d) {
      var it = d.getFiles();
      while (it.hasNext()) {
        var f = it.next(), nom = String(f.getName());
        if (!/^BPU.*\.(tsv|txt)$/i.test(nom)) continue;
        if (!trouve || f.getDateCreated() > trouve.f.getDateCreated()) trouve = { f: f, nom: nom };
      }
    };
    voir(dossier);
    var it = dossier.getFolders();
    while (it.hasNext()) voir(it.next());
    if (!trouve) return null;
    var info = { id: trouve.f.getId(), nom: trouve.nom, date: Utilities.formatDate(trouve.f.getDateCreated(), APP.FUSEAU, 'dd/MM/yyyy HH:mm') };
    if (avecFichier) info.fichier = trouve.f;
    return info;
  } catch (e) { return null; }
}

/** Remplace le BPU de l'affaire par celui du fichier déposé par le skill. Renvoie { lignes, fichier, bpu }. */
function AC_bpuImporterSkill(idAffaire) {
  var a = Affaires_get_(idAffaire);
  var fichier = AC_fichierSkill_(a, true);
  if (!fichier) throw new Error('Aucun fichier « BPU-' + a.id + '.tsv » dans le dossier Drive de l\'affaire (le skill le dépose dans 04 Offre).');
  var lignes = AC_bpuLireTexte_(fichier.fichier.getBlob().getDataAsString('UTF-8'));
  if (!lignes.length) throw new Error('Le fichier ' + fichier.nom + ' ne contient aucune ligne de prix lisible.');
  var bpu = AC_bpuEnregistrer(idAffaire, lignes);
  Affaires_ajouterNote(idAffaire, 'BPU importé depuis ' + fichier.nom + ' (' + lignes.length + ' lignes, DQE ' + Courriers_euros_(AC_dqe_(bpu)) + ' HT)');
  return { lignes: lignes.length, fichier: fichier, bpu: bpu };
}

// ——— Périodes ———

function AC_ajouterMois_(d, n) {
  var r = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
  r.setHours(0, 0, 0, 0);
  return r;
}

/** Périodes de l'accord-cadre : [{ n, debut, fin }] (dates ISO), la période en cours et la fin au plus tard. */
function AC_periodes_(a, quand) {
  var auj = aujourdhui_(quand);
  var debut = date_(a.ac_debut) || date_(a.date_notification);
  var duree = Number(a.ac_duree_mois) || 12;
  var recon = Math.max(0, Math.floor(Number(a.ac_reconductions) || 0));
  if (!debut) return { periodes: [], courante: null, fin: '', duree: duree, reconductions: recon };
  debut = aujourdhui_(debut);
  var periodes = [];
  for (var i = 0; i <= recon; i++) {
    var d = AC_ajouterMois_(debut, i * duree), f = AC_ajouterMois_(debut, (i + 1) * duree);
    f.setDate(f.getDate() - 1);
    periodes.push({ n: i + 1, debut: jourIso_(d), fin: jourIso_(f) });
  }
  var courante = periodes.filter(function (p) { return jourIso_(auj) >= p.debut && jourIso_(auj) <= p.fin; })[0] || null;
  return { periodes: periodes, courante: courante, fin: periodes[periodes.length - 1].fin, duree: duree, reconductions: recon };
}

// ——— Bons de commande ———

function AC_lignesBon_(texte) {
  try { var v = JSON.parse(String(texte || '[]')); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

function AC_bons(idAffaire) {
  return Db_lire(TABLES.BONS_COMMANDE)
    .filter(function (b) { return String(b.id_affaire) === String(idAffaire); })
    .map(function (b) {
      return { id: String(b.id), numero: String(b.numero || ''), code: Planning_codeTranche_(b.numero),
        date: date_(b.date) ? jourIso_(date_(b.date)) : '', date_delai: date_(b.date_delai) ? jourIso_(date_(b.date_delai)) : '',
        objet: String(b.objet || ''), montant: arrondi_(montant_(b.montant)), lignes: AC_lignesBon_(b.lignes), commentaire: String(b.commentaire || '') };
    })
    .sort(function (x, y) { return (x.date || '9') < (y.date || '9') ? -1 : (x.date || '9') > (y.date || '9') ? 1 : x.numero.localeCompare(y.numero, 'fr', { numeric: true }); });
}

/** Prochain n° proposé : BC-01, BC-02… */
function AC_prochainNumero_(idAffaire) {
  var n = AC_bons(idAffaire).length + 1;
  return 'BC-' + (n < 10 ? '0' : '') + n;
}

/**
 * Champs d'un bon : numero, date, date_delai, objet, quantites { idBpu: quantité } (prix du BPU),
 * ou montant saisi si le bon ne reprend pas le BPU. Montant = Σ quantité × prix unitaire.
 */
function AC_bonValider_(idAffaire, champs, idExclu) {
  var a = Affaires_get_(idAffaire);
  var numero = String(champs.numero || '').trim() || AC_prochainNumero_(idAffaire);
  var code = Planning_codeTranche_(numero);
  if (AC_bons(idAffaire).some(function (b) { return b.code === code && b.id !== idExclu; })) throw new Error('Le bon de commande « ' + numero + ' » existe déjà.');
  var bpu = AC_bpu(idAffaire);
  var lignes = [];
  var q = champs.quantites || {};
  bpu.forEach(function (l) {
    var n = AC_nombre_(q[l.id], 'Quantité de « ' + l.designation + ' »');
    if (n > 0) lignes.push({ numero: l.numero, designation: l.designation, unite: l.unite, prix_unitaire: l.prix_unitaire, quantite: n, montant: arrondi_(n * l.prix_unitaire) });
  });
  var montant = lignes.length ? AC_dqe_(lignes) : arrondi_(AC_nombre_(champs.montant, 'Montant du bon'));
  if (!(montant > 0)) throw new Error('Indiquez des quantités du BPU, ou le montant du bon de commande.');
  var d = date_(champs.date) || aujourdhui_();
  var delai = String(champs.date_delai || '').trim() ? date_(champs.date_delai) : '';
  if (String(champs.date_delai || '').trim() && !delai) throw new Error('Délai d\'exécution : date attendue.');
  return {
    id_affaire: a.id, numero: numero.slice(0, 12), date: d, date_delai: delai || '', objet: String(champs.objet || '').trim().slice(0, 200),
    montant: montant, lignes: JSON.stringify(lignes), commentaire: String(champs.commentaire || '').trim()
  };
}

function AC_bonAjouter(idAffaire, champs) {
  var b = Db_inserer(TABLES.BONS_COMMANDE, AC_bonValider_(idAffaire, champs || {}, ''));
  var s = AC_synthese(idAffaire);
  Affaires_ajouterNote(idAffaire, 'Bon de commande ' + b.numero + ' du ' + Utilities.formatDate(date_(b.date), APP.FUSEAU, 'dd/MM/yyyy') + ' : ' + Courriers_euros_(montant_(b.montant)) + ' HT' + (b.objet ? ' — ' + b.objet : '') +
    (s.depasse ? ' (maximum de la période dépassé)' : ''));
  return b;
}

function AC_bonMaj(idAffaire, idBon, champs) {
  var b = Db_trouver(TABLES.BONS_COMMANDE, idBon);
  if (!b || String(b.id_affaire) !== String(idAffaire)) throw new Error('Bon de commande introuvable.');
  var actuel = AC_bons(idAffaire).filter(function (x) { return x.id === String(idBon); })[0];
  var fusion = Object.assign({ numero: actuel.numero, date: actuel.date, date_delai: actuel.date_delai, objet: actuel.objet, montant: actuel.montant, commentaire: actuel.commentaire }, champs || {});
  if (!champs || !champs.quantites) {
    // Sans nouvelles quantités : lignes et montant conservés (sauf montant saisi)
    var v = AC_bonValider_(idAffaire, Object.assign({}, fusion, { quantites: {}, montant: 'montant' in (champs || {}) ? champs.montant : actuel.montant }), String(idBon));
    if (!('montant' in (champs || {}))) { v.lignes = JSON.stringify(actuel.lignes); v.montant = actuel.montant; }
    return Db_maj(TABLES.BONS_COMMANDE, idBon, v);
  }
  return Db_maj(TABLES.BONS_COMMANDE, idBon, AC_bonValider_(idAffaire, fusion, String(idBon)));
}

/** Supprime un bon tant qu'il n'est pas facturé. */
function AC_bonSupprimer(idAffaire, idBon) {
  var b = AC_bons(idAffaire).filter(function (x) { return x.id === String(idBon); })[0];
  if (!b) throw new Error('Bon de commande introuvable.');
  var facture = Db_lire(TABLES.FACTURES).some(function (f) { return String(f.id_affaire) === String(idAffaire) && Planning_codeTranche_(f.tranche) === b.code && f.qonto_statut !== 'annulée'; });
  if (facture) throw new Error('Le bon ' + b.numero + ' est déjà facturé : il ne peut plus être supprimé.');
  Db_supprimerSi(TABLES.BONS_COMMANDE, function (x) { return String(x.id) === String(idBon); });
  Affaires_ajouterNote(idAffaire, 'Bon de commande ' + b.numero + ' supprimé');
  return true;
}

/**
 * Synthèse de l'accord-cadre : périodes, bons, commandé (période en cours et total), minimum / maximum,
 * DQE de l'offre. null si l'affaire n'est pas un accord-cadre.
 */
function AC_synthese(idAffaire, quand) {
  var a = Affaires_get_(idAffaire);
  if (!AC_est_(a)) return null;
  var per = AC_periodes_(a, quand);
  var bons = AC_bons(idAffaire);
  var dans = function (b, p) { return p && b.date >= p.debut && b.date <= p.fin; };
  // Période de référence : en cours ; avant le début, la 1re ; après la fin, la dernière
  var cour = per.courante || (per.periodes.length ? (jourIso_(aujourdhui_(quand)) < per.periodes[0].debut ? per.periodes[0] : per.periodes[per.periodes.length - 1]) : null);
  var commandePeriode = arrondi_(bons.filter(function (b) { return dans(b, cour); }).reduce(function (s, b) { return s + b.montant; }, 0));
  var commandeTotal = arrondi_(bons.reduce(function (s, b) { return s + b.montant; }, 0));
  var maximum = montant_(a.ac_maximum), minimum = montant_(a.ac_minimum);
  var bpu = AC_bpu(idAffaire);
  var periodes = per.periodes.map(function (p) {
    var c = arrondi_(bons.filter(function (b) { return dans(b, p); }).reduce(function (s, b) { return s + b.montant; }, 0));
    return Object.assign({}, p, { commande: c, courante: !!(per.courante && per.courante.n === p.n), depasse: !!(maximum && c > maximum + 0.005) });
  });
  return {
    periodes: periodes, reference: cour,
    courante: cour, fin: per.fin, duree: per.duree, reconductions: per.reconductions,
    minimum: minimum || 0, maximum: maximum || 0, dqe: AC_dqe_(bpu), bpu: bpu, bons: bons,
    commandePeriode: commandePeriode, commandeTotal: commandeTotal,
    depasse: periodes.some(function (p) { return p.depasse; }) || !!(maximum && !per.periodes.length && commandeTotal > maximum + 0.005),
    minimumAtteint: !minimum || commandePeriode + 0.005 >= minimum,
    prochainNumero: AC_prochainNumero_(idAffaire)
  };
}

/**
 * CA potentiel d'un accord-cadre gagné (pour le CA prévisionnel) : pour chaque période restante, le DQE
 * (à défaut le maximum) moins ce qui est déjà commandé sur la période ; rangé sur l'année de début de la période
 * (année en cours pour la période en cours). Renvoie { annee: montant }.
 */
function AC_potentiel_(a, quand) {
  var auj = aujourdhui_(quand), anCourant = auj.getFullYear();
  var s = AC_synthese(a.id, auj);
  if (!s) return {};
  var reference = s.dqe || s.maximum;
  if (!(reference > 0)) return {};
  var out = {};
  s.periodes.forEach(function (p) {
    if (p.fin < jourIso_(auj)) return;
    var reste = Math.max(reference - p.commande, 0);
    if (s.maximum) reste = Math.min(reste, Math.max(s.maximum - p.commande, 0));
    if (reste <= 0.005) return;
    var an = Math.max(Number(p.debut.slice(0, 4)), anCourant);
    out[an] = arrondi_((out[an] || 0) + reste);
  });
  return out;
}
