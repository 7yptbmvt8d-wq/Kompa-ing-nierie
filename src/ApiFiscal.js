/**
 * API des déclarations URSSAF (CA au rythme des déclarations, estimation des sommes dues).
 */

function apiFiscal(annee) {
  return repondre_(function () { return Fiscal_declarations(Number(annee) || null); });
}

function apiDeclarer(idPeriode, caDeclare, dateDeclaration) {
  return repondre_(function () { Fiscal_marquerDeclaree(idPeriode, caDeclare, dateDeclaration); Relances_synchroniser(); return Fiscal_declarations(Number(String(idPeriode).slice(0, 4))); });
}

/** Déclaration de revenus faite (CA de l'année précédente reporté sur impots.gouv). */
function apiRevenusDeclares(annee, dateDeclaration) {
  return repondre_(function () { Fiscal_revenusDeclares(annee, dateDeclaration); return Fiscal_declarations(Number(annee)); });
}

function apiCumulFait(dateDemande) {
  return repondre_(function () { Fiscal_cumulFait(dateDemande); return Fiscal_declarations(); });
}

function apiCfePayee(annee, montant, datePaiement) {
  return repondre_(function () { Fiscal_cfePayee(annee, montant, datePaiement); return Fiscal_declarations(Number(annee)); });
}

/** Réglages de la CFE depuis la carte de l'accueil : montant estimé (année pleine) et date de création. */
function apiCfeReglages(montant, dateCreation) {
  return repondre_(function () {
    var m = String(montant || '').replace(/[\s\u00a0€]/g, '').replace(',', '.');
    if (m && !(Number(m) >= 0)) throw new Error('Montant de la CFE : nombre attendu.');
    var d = date_(dateCreation);
    if (dateCreation && !d) throw new Error('Date de création : date attendue.');
    Params_enregistrer('fiscal.cfe_montant', m);
    if (d) Params_enregistrer('fiscal.date_creation', Utilities.formatDate(d, APP.FUSEAU, 'yyyy-MM-dd'));
    return Fiscal_declarations();
  });
}

/**
 * Réglages URSSAF depuis Finances › URSSAF et CFE : versement libératoire (oui/non), taux des cotisations,
 * taux du versement libératoire (en %, virgule acceptée). Un taux laissé vide n'est pas modifié.
 */
function apiFiscalReglages(vl, tauxCotisations, tauxVl, annee) {
  return repondre_(function () {
    var taux = function (v, libelle) {
      var t = String(v === undefined || v === null ? '' : v).replace(/[\s\u00a0%]/g, '').replace(',', '.');
      if (t === '') return null;
      if (!(Number(t) >= 0 && Number(t) < 100)) throw new Error(libelle + ' : pourcentage attendu (ex. 24,2).');
      return t;
    };
    var tc = taux(tauxCotisations, 'Taux des cotisations'), tv = taux(tauxVl, 'Taux du versement libératoire');
    Params_enregistrer('fiscal.versement_liberatoire', vl === true || String(vl).toLowerCase() === 'oui' ? 'oui' : 'non');
    if (tc !== null) Params_enregistrer('fiscal.taux_cotisations', tc);
    if (tv !== null) Params_enregistrer('fiscal.taux_versement_liberatoire', tv);
    return Fiscal_declarations(Number(annee) || null);
  });
}

function apiAnnulerDeclaration(idPeriode) {
  return repondre_(function () { Fiscal_annulerDeclaration(idPeriode); Relances_synchroniser(); return Fiscal_declarations(Number((String(idPeriode).match(/\d{4}/) || [])[0]) || null); });
}
