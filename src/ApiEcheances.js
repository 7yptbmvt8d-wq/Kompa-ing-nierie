/**
 * API du lot 4 (échéancier, relances, courriers, e-mail du matin).
 */

function echeanceClient_(e) {
  var o = Object.assign({}, e);
  o.date = jourIso_(e.date);
  return o;
}

function relanceClient_(r) {
  return versClient_(TABLES.RELANCES, r);
}

/** Échéancier : échéances du mois affiché (aaaa-mm) ± marge, échéances dépassées, relances. */
function apiEcheancier(mois) {
  return repondre_(function () {
    var sync = Relances_synchroniser();
    var auj = aujourdhui_();
    var m = String(mois || '').match(/^(\d{4})-(\d{2})$/);
    var debutMois = m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date(auj.getFullYear(), auj.getMonth(), 1);
    var finMois = new Date(debutMois.getFullYear(), debutMois.getMonth() + 1, 0);
    // Grille du calendrier : du lundi précédant le 1er au dimanche suivant la fin du mois
    var debut = ajouterJours_(debutMois, -((debutMois.getDay() + 6) % 7));
    var fin = ajouterJours_(finMois, (7 - finMois.getDay()) % 7);
    var liste = Echeances_calculer(auj, ajouterJours_(auj, 60));
    return {
      mois: Utilities.formatDate(debutMois, APP.FUSEAU, 'yyyy-MM'),
      grille: { debut: jourIso_(debut), fin: jourIso_(fin) },
      calendrier: Echeances_calculer(debut, fin).map(echeanceClient_),
      prochaines: liste.map(echeanceClient_),
      relances: Relances_aFaire(null, true).map(relanceClient_),
      synchronisation: sync,
      aujourdhui: jourIso_(auj)
    };
  });
}

/** Accueil : échéances à 7 jours et relances à faire. */
function apiSuivi() {
  return repondre_(function () {
    Relances_synchroniser();
    var auj = aujourdhui_();
    return {
      echeances: Echeances_calculer(auj, ajouterJours_(auj, 7)).map(echeanceClient_),
      relances: Relances_aFaire().map(relanceClient_)
    };
  });
}

function apiRelanceStatut(idRelance, statut) {
  return repondre_(function () { return relanceClient_(Relances_changerStatut(idRelance, statut)); });
}

function apiCourrier(idRelance) {
  return repondre_(function () { return Courriers_modele(idRelance); });
}

/** Aperçu de l'e-mail du matin (sans envoi). */
function apiEmailApercu() {
  return repondre_(function () {
    Relances_synchroniser();
    var m = Email_construire(new Date());
    return { sujet: m.sujet, html: m.html, nombres: m.nombres };
  });
}

/** Envoi immédiat de l'e-mail du matin (test). */
function apiEmailEnvoyer() {
  return repondre_(function () { return Email_envoyerTest(); });
}
