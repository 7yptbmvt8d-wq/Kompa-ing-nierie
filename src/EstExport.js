/**
 * Module Estimation — export .xlsx au format DPGF (étape 6).
 *
 * Le classeur est construit dans un Google Sheets temporaire (formules et mise en forme Kompa),
 * exporté en .xlsx, déposé dans le sous-dossier « 09 Estimations » de l'affaire (paramètre est.dossier_export),
 * puis le classeur temporaire est mis à la corbeille. Aucun fichier existant n'est écrasé.
 */

var EST_EXPORT_COULEURS = { ardoise: '#1B263B', brume: '#EEF1F6', filet: '#D5DBE5', rouille: '#B4460E', gris: '#4A5568', blanc: '#FFFFFF' };

/** Nom du fichier : « KA-2026-004 — Estimation APS — ind A.xlsx ». */
function Est_nomExport_(e) {
  return e.id_affaire + ' — Estimation ' + e.phase + ' — ind ' + e.indice + '.xlsx';
}

/** Remplit la feuille : en-tête, lignes par lot, totaux en formules, mentions d'index et de K. */
function Est_remplirExport_(feuille, c) {
  var C = EST_EXPORT_COULEURS;
  var e = c.estimation;
  var lignes = c.lignes;
  var fr = function (x, d) { return Est_fr_(x, d === undefined ? 2 : d); };
  feuille.setName('Estimation');
  var entete = [
    ['KOMPA INGÉNIERIE — ESTIMATION ' + String(e.phase).toUpperCase() + ' — IND ' + e.indice],
    [c.affaire.id + (c.affaire.acheteur ? ' — ' + c.affaire.acheteur : '') + (c.affaire.objet ? ' — ' + c.affaire.objet : '')],
    ['Typologie : ' + c.typologie + ' · ' + e.nature + ' · département ' + e.departement + ' · surface de référence ' + fr(e.surface_sdp, 0) + ' m² · estimation au ratio']
  ];
  feuille.getRange(1, 1, 3, 1).setValues(entete);
  feuille.getRange(1, 1).setFontSize(14).setFontWeight('bold').setFontColor(C.ardoise);
  feuille.getRange(2, 1, 2, 1).setFontColor(C.gris);
  var R0 = 5;
  feuille.getRange(R0, 1, 1, 6).setValues([['N°', 'Désignation', 'Unité', 'Quantité', 'PU HT (€)', 'Total HT (€)']])
    .setFontWeight('bold').setFontColor(C.blanc).setBackground(C.ardoise).setHorizontalAlignment('center');
  var r = R0 + 1;
  var premiere = r;
  if (lignes.length) {
    feuille.getRange(r, 1, lignes.length, 1).setNumberFormat('@'); // n° d'article « 01 » conservé en texte
    feuille.getRange(r, 1, lignes.length, 5).setValues(lignes.map(function (l) {
      return [String(l.num_article), String(l.designation), String(l.unite), Number(l.quantite) || 0, Number(l.pu_ht) || 0];
    }));
    feuille.getRange(r, 6, lignes.length, 1).setFormulas(lignes.map(function (_, i) { return ['=D' + (r + i) + '*E' + (r + i)]; }));
    r += lignes.length;
  }
  var derniere = r - 1;
  var totaux = [
    ['Total HT des lots', '=SUM(F' + premiere + ':F' + Math.max(derniere, premiere) + ')'],
    ['Aléas et imprévus (' + fr(e.aleas_pct, 1) + ' %)', '=F' + r + '*' + (Number(e.aleas_pct) || 0) / 100],
    ['TOTAL HT', '=F' + r + '+F' + (r + 1)],
    ['TVA (' + fr(e.tva, 1) + ' %)', '=F' + (r + 2) + '*' + (Number(e.tva) || 0) / 100],
    ['TOTAL TTC', '=F' + (r + 2) + '+F' + (r + 3)]
  ];
  feuille.getRange(r, 5, totaux.length, 1).setValues(totaux.map(function (t) { return [t[0]]; }));
  feuille.getRange(r, 6, totaux.length, 1).setFormulas(totaux.map(function (t) { return [t[1]]; }));
  feuille.getRange(r, 5, totaux.length, 2).setFontWeight('bold').setBackground(C.brume);
  feuille.getRange(r + 2, 5, 1, 2).setBackground(C.filet);
  feuille.getRange(r + 4, 5, 1, 2).setBackground(C.ardoise).setFontColor(C.blanc);
  feuille.getRange(premiere, 4, Math.max(derniere - premiere + 1, 1), 3).setNumberFormat('#,##0.00');
  feuille.getRange(r, 6, totaux.length, 1).setNumberFormat('#,##0.00');
  // Mentions : index, K, sources et fiabilités
  var n = r + totaux.length + 1;
  var mentions = [['Méthode et sources']].concat([
    ['Montant d\'un lot = médiane du ratio (€ HT/m², marchés importés de même typologie et même nature) actualisée au dernier index du lot × surface × projection × K.'],
    ['Coefficient de localisation K = ' + fr(e.k, 4) + ' : ' + (e.k_detail || '—')],
    [e.date_travaux ? 'Projection jusqu\'à la date des travaux ' + Est_moisLisible_(e.date_travaux) + ' (paramètre est.projection_taux).' : 'Pas de projection à la date des travaux.']
  ]).concat(lignes.map(function (l) {
    return [l.num_article + ' ' + l.designation + ' — ' + (l.source === 'ratio' ? 'ratio, ' : 'PU saisi, ') + 'fiabilité ' + l.fiabilite +
      (l.indice ? ' — ' + l.indice + ' ' + Est_moisLisible_(l.indice_mois) + (l.indice_valeur !== '' ? ' = ' + fr(l.indice_valeur, 1) : '') : '') +
      (l.commentaire ? ' — ' + l.commentaire : '')];
  })).concat([['Fiabilité : A = prix de marché de moins de 3 ans, même zone ; B = plus ancien ou autre zone ; C = moins de 5 marchés ou saisie libre.'],
    ['Estimation établie le ' + Utilities.formatDate(new Date(), APP.FUSEAU, 'dd/MM/yyyy') + ' — statut : ' + e.statut + ' — ' + e.id + '.']]);
  feuille.getRange(n, 1, mentions.length, 1).setValues(mentions);
  feuille.getRange(n, 1).setFontWeight('bold').setFontColor(C.ardoise);
  feuille.getRange(n + 1, 1, mentions.length - 1, 1).setFontColor(C.gris).setFontSize(9);
  feuille.getRange(1, 1, n + mentions.length, 6).setFontFamily('Arial');
  feuille.setColumnWidth(1, 60);
  feuille.setColumnWidth(2, 360);
  feuille.setColumnWidth(3, 60);
  feuille.setColumnWidth(4, 90);
  feuille.setColumnWidth(5, 170);
  feuille.setColumnWidth(6, 120);
  feuille.setFrozenRows(R0);
  return { premiere: premiere, derniere: derniere, totaux: r };
}

/** Exporte l'estimation en .xlsx dans le dossier Drive de l'affaire. Renvoie { nom, url, dossier }. */
function Est_exporter_(id) {
  var c = Est_estimationComplete_(id);
  var e = c.estimation;
  var a = Affaires_get_(e.id_affaire);
  var dossier = Drive_dossierAffaireOuCreer_(a);
  var nomDossier = Est_param_('est.dossier_export', '09 Estimations');
  var cible = Drive_sousDossier_(dossier, nomDossier);
  var temp = SpreadsheetApp.create('Export temporaire ' + e.id);
  try {
    Est_remplirExport_(temp.getSheets()[0], c);
    SpreadsheetApp.flush();
    var rep = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + temp.getId() + '/export?format=xlsx', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
    });
    if (rep.getResponseCode() !== 200) throw new Error('Export .xlsx refusé par Google (HTTP ' + rep.getResponseCode() + ').');
    var nom = Drive_nomLibre_(cible, Est_nomExport_(e));
    var fichier = cible.createFile(rep.getBlob().setName(nom));
    Db_maj(EST_TABLES.ESTIMATIONS, id, { export_url: fichier.getUrl() });
    Affaires_ajouterNote(a.id, 'Estimation exportée : ' + nomDossier + ' / ' + nom);
    Est_journal_('export', 'ok', id + ' → ' + nom);
    return { nom: nom, url: fichier.getUrl(), dossier: nomDossier };
  } finally {
    try { DriveApp.getFileById(temp.getId()).setTrashed(true); } catch (err) { /* déjà supprimé */ }
  }
}
