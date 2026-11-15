/* Kompa Affaires — module Estimation 1.3.0 — fichier généré par tools/build.js depuis src/Est*.js. Ne pas modifier ici. */

// ════════ EstConfig.js ════════

/**
 * Module Estimation des travaux — configuration.
 *
 * Ce fichier et les autres src/Est*.js sont assemblés dans dist/Estimation.gs, distinct de
 * dist/Code.gs (suivi des affaires) : une erreur de collage dans l'un ne casse pas l'autre.
 * Le module a son propre classeur (« Kompa Estimation — données »), relié aux affaires par le n° KA.
 * Plan : PLAN_ESTIMATION.md. Aucune valeur métier en dur : tout est paramétrable dans les tables EST_*.
 *
 * Règle de chargement : aucune référence aux variables de Code.gs au niveau global de ce fichier
 * (l'ordre de chargement des fichiers dans Apps Script n'est pas garanti) ; seulement dans des fonctions.
 */

/** Doit être égale à APP.VERSION (Code.gs) : sinon l'accueil signale une mise à jour incomplète. */
var EST_VERSION = '1.3.0';

/** Tables du module (classeur EST), complétées à partir de l'étape 1. */
var EST_TABLES = {};

/** Initialisation du module, appelée par installer() après la création des onglets. */
function Est_installer_() {
  return { version: EST_VERSION, tables: Object.keys(EST_TABLES).length };
}
