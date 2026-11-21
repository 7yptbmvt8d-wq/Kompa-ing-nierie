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

function apiAnnulerDeclaration(idPeriode) {
  return repondre_(function () { Fiscal_annulerDeclaration(idPeriode); Relances_synchroniser(); return Fiscal_declarations(Number((String(idPeriode).match(/\d{4}/) || [])[0]) || null); });
}
