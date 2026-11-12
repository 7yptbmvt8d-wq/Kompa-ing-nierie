/**
 * API des déclarations URSSAF (CA au rythme des déclarations, estimation des sommes dues).
 */

function apiFiscal(annee) {
  return repondre_(function () { return Fiscal_declarations(Number(annee) || null); });
}

function apiDeclarer(idPeriode, caDeclare, dateDeclaration) {
  return repondre_(function () { Fiscal_marquerDeclaree(idPeriode, caDeclare, dateDeclaration); Relances_synchroniser(); return Fiscal_declarations(Number(String(idPeriode).slice(0, 4))); });
}

function apiAnnulerDeclaration(idPeriode) {
  return repondre_(function () { Fiscal_annulerDeclaration(idPeriode); Relances_synchroniser(); return Fiscal_declarations(Number(String(idPeriode).slice(0, 4))); });
}
