/**
 * E-mail du matin (§ 6) : du lundi au vendredi à 7 h vers le compte Kompa.
 * Rubriques : nouveaux avis PACA, nouveaux avis France, échéances à 7 jours, relances à faire,
 * indicateurs. Rubriques vides masquées ; pas d'envoi si les quatre premières sont vides,
 * sauf le lundi (récapitulatif).
 *
 * Les e-mails n'acceptent pas les variables CSS : les couleurs de la charte (tokens.css)
 * sont reprises ici en valeurs.
 */

var COULEURS_EMAIL = {
  encre: '#0B1220', ardoise: '#1B263B', rouille: '#B4460E', brume: '#EEF1F6',
  gris: '#4A5568', filet: '#D5DBE5', blanc: '#FFFFFF', inverse: '#EEF2F8', inverse2: '#A3B0C4'
};
var JOURS_SEMAINE = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

/** Déclencheur quotidien (7 h). */
function envoyerEmailMatin() {
  return Email_envoyer_(new Date(), false);
}

/** Envoi immédiat depuis l'app (bouton de test) : ignore le jour de la semaine. */
function Email_envoyerTest() {
  return Email_envoyer_(new Date(), true);
}

function Email_envoyer_(quand, force) {
  var jour = JOURS_SEMAINE[quand.getDay()];
  var jours = Params_liste('email.jours');
  if (!force && jours.length && jours.indexOf(jour) < 0) {
    console.log('E-mail du matin : pas d\'envoi le ' + jour + '.');
    return { envoye: false, motif: 'jour non ouvré (' + jour + ')' };
  }
  Relances_synchroniser(quand);
  var props = PropertiesService.getScriptProperties();
  var dernier = props.getProperty('EMAIL_DERNIER_ENVOI');
  var mail = Email_construire(quand, dernier ? new Date(dernier) : null);
  var lundi = jour === 'lun' && Params_texte('email.recap_lundi', 'oui') === 'oui';
  if (!mail.contenu && !lundi && !force) {
    console.log('E-mail du matin : rien à signaler, pas d\'envoi.');
    return { envoye: false, motif: 'rubriques vides' };
  }
  var destinataire = Params_texte('email.destinataire', '') || Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({ to: destinataire, subject: mail.sujet, htmlBody: mail.html, body: mail.texte, name: APP.NOM });
  props.setProperty('EMAIL_DERNIER_ENVOI', quand.toISOString());
  return { envoye: true, destinataire: destinataire, sujet: mail.sujet };
}

/** Contenu de l'e-mail. depuis : avis créés depuis cette date (défaut : 24 h). */
function Email_construire(quand, depuis) {
  quand = quand || new Date();
  var auj = aujourdhui_(quand);
  depuis = depuis || new Date(quand.getTime() - 86400000);
  var paca = Params_texte('zone.libelle_paca', 'PACA');
  var url = Email_urlApp_();

  var nouveaux = Db_lire(TABLES.AVIS).filter(function (a) {
    return a.statut === 'nouveau' && date_(a.cree_le) && new Date(a.cree_le) > depuis;
  }).sort(function (x, y) { return (Number(y.pre_score) || 0) - (Number(x.pre_score) || 0); });
  var avisPaca = nouveaux.filter(function (a) { return a.zone === paca; });
  // Hors PACA : seuls les avis « à étudier » sont détaillés ; les « possibles » sont comptés (lisibilité).
  var horsPaca = nouveaux.filter(function (a) { return a.zone !== paca; });
  var avisFrance = horsPaca.filter(function (a) { return a.classement === 'à étudier'; });
  var autresFrance = horsPaca.length - avisFrance.length;
  var echeances = Echeances_calculer(auj, ajouterJours_(auj, 7), quand)
    .filter(function (e) { return ['Remise', 'Questions', 'Visite'].indexOf(e.type) >= 0; });
  var relances = Relances_aFaire(quand);
  var ind = Indicateurs_resume(quand);

  var C = COULEURS_EMAIL;
  var h = function (s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var jr = function (d) { return Utilities.formatDate(date_(d) || new Date(d), APP.FUSEAU, 'dd/MM/yyyy'); };
  var mono = 'font-family:\'IBM Plex Mono\',Consolas,monospace;';
  var bouton = function (lien, txt) {
    return '<a href="' + h(lien) + '" style="display:inline-block;background:' + C.ardoise + ';color:' + C.inverse + ';text-decoration:none;padding:6px 12px;border-radius:4px;font-size:13px;font-weight:600">' + h(txt) + '</a>';
  };
  var section = function (titre, nb, lignes) {
    return '<tr><td style="padding:24px 24px 0"><h2 style="margin:0 0 8px;font-size:16px;color:' + C.ardoise + ';border-top:2px solid ' + C.ardoise + ';padding-top:10px">' +
      h(titre) + ' <span style="' + mono + 'color:' + C.gris + ';font-weight:400">(' + nb + ')</span></h2>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">' + lignes + '</table></td></tr>';
  };
  var ligneAvis = function (a, etiquette) {
    var jl = date_(a.date_limite) ? ecartJours_(new Date(a.date_limite), auj) : null;
    return '<tr><td style="padding:10px 0;border-bottom:1px solid ' + C.filet + ';vertical-align:top;width:44px">' +
      '<span style="' + mono + 'display:inline-block;background:' + (a.classement === 'à étudier' ? C.ardoise + ';color:' + C.inverse : C.brume + ';color:' + C.ardoise) + ';padding:2px 6px;border-radius:4px;font-weight:600">' + h(a.pre_score) + '</span></td>' +
      '<td style="padding:10px 8px;border-bottom:1px solid ' + C.filet + ';vertical-align:top">' +
      '<div style="font-weight:600">' + h(a.acheteur) + (a.departement ? ' <span style="' + mono + 'color:' + C.gris + ';font-weight:400">(' + h(a.departement) + ')</span>' : '') + '</div>' +
      '<div>' + h(a.objet) + '</div>' +
      '<div style="color:' + C.gris + ';font-size:13px">' + (jl === null ? 'Date limite inconnue' : 'Date limite <span style="' + mono + '">' + jr(a.date_limite) + '</span> (J-' + jl + ')') +
      (etiquette ? ' · <span style="color:' + C.rouille + ';font-weight:600">' + h(etiquette) + '</span>' : '') +
      ' · <a href="' + h(a.lien) + '" style="color:' + C.ardoise + '">Voir l\'avis</a></div></td>' +
      '<td style="padding:10px 0;border-bottom:1px solid ' + C.filet + ';vertical-align:top;text-align:right">' + bouton(url + '#veille', 'Étudier') + '</td></tr>';
  };
  var ligneSimple = function (date, quoi, a, lien, urgent) {
    return '<tr><td style="padding:8px 0;border-bottom:1px solid ' + C.filet + ';' + mono + 'white-space:nowrap;vertical-align:top;' + (urgent ? 'color:' + C.rouille + ';font-weight:600' : '') + '">' + h(date) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid ' + C.filet + ';vertical-align:top"><strong>' + h(quoi) + '</strong> — ' + h(a.acheteur) +
      '<div style="color:' + C.gris + ';font-size:13px">' + h(String(a.objet || '').slice(0, 140)) + '</div></td>' +
      '<td style="padding:8px 0;border-bottom:1px solid ' + C.filet + ';text-align:right;vertical-align:top"><a href="' + h(lien) + '" style="color:' + C.ardoise + '">Ouvrir</a></td></tr>';
  };

  var corps = '';
  if (avisPaca.length) corps += section('Nouveaux avis ' + paca, avisPaca.length, avisPaca.map(function (a) { return ligneAvis(a, ''); }).join(''));
  if (avisFrance.length || autresFrance) corps += section('Nouveaux avis hors ' + paca + ' à étudier', avisFrance.length,
    avisFrance.map(function (a) { return ligneAvis(a, 'présentiel à vérifier'); }).join('') +
    (autresFrance ? '<tr><td colspan="3" style="padding:10px 0;color:' + C.gris + ';font-size:13px">+ ' + autresFrance + ' autre' + (autresFrance > 1 ? 's' : '') +
      ' avis « possible » hors ' + h(paca) + ' : <a href="' + h(url) + '#veille" style="color:' + C.ardoise + '">voir dans l\'app</a></td></tr>' : ''));
  if (echeances.length) corps += section('Échéances des 7 prochains jours', echeances.length, echeances.map(function (e) {
    return ligneSimple(jr(e.date) + (e.jours === 0 ? ' (aujourd\'hui)' : ' (J-' + e.jours + ')'), e.libelle, e, url + '#affaire/' + e.id_affaire, e.urgent);
  }).join(''));
  if (relances.length) corps += section('Relances à faire', relances.length, relances.map(function (r) {
    return ligneSimple(jr(r.date_prevue), r.type, r, url + '#echeancier', r.jours < 0);
  }).join(''));
  var contenu = !!corps;
  if (!contenu) {
    corps = '<tr><td style="padding:24px 24px 0;color:' + C.gris + '">Rien de nouveau depuis le dernier envoi : pas de nouvel avis, pas d\'échéance dans les 7 jours, pas de relance à faire.</td></tr>';
  }

  // Indicateurs
  var statuts = Object.keys(ind.enCours).map(function (s) { return s + ' : <strong style="' + mono + '">' + ind.enCours[s] + '</strong>'; }).join(' · ');
  var taux = ind.attribution.gagnees + ind.attribution.perdues
    ? '<strong style="' + mono + '">' + Math.round(ind.attribution.taux * 100) + ' %</strong> (' + ind.attribution.gagnees + ' gagnée(s) / ' + (ind.attribution.gagnees + ind.attribution.perdues) + ')'
    : 'pas encore de résultat';
  var ca = ind.ca;
  var jalons = ca.jalons.map(function (j) {
    var couleur = j.etat === 'ok' ? C.gris : C.rouille;
    return '<span style="color:' + couleur + '">' + h(j.libelle) + ' <span style="' + mono + '">' + Courriers_euros_(j.seuil) + '</span>' + (j.etat === 'depasse' ? ' — dépassé' : j.etat === 'alerte' ? ' — ≥ ' + ca.alertePct + ' %' : '') + '</span>';
  }).join('<br>');
  corps += section('Indicateurs', 3,
    '<tr><td style="padding:8px 0;border-bottom:1px solid ' + C.filet + ';width:170px;color:' + C.gris + '">Affaires en cours</td><td style="padding:8px;border-bottom:1px solid ' + C.filet + '">' + (statuts || 'aucune') + '</td></tr>' +
    '<tr><td style="padding:8px 0;border-bottom:1px solid ' + C.filet + ';color:' + C.gris + '">Taux d\'attribution (12 mois)</td><td style="padding:8px;border-bottom:1px solid ' + C.filet + '">' + taux + '</td></tr>' +
    '<tr><td style="padding:8px 0;border-bottom:1px solid ' + C.filet + ';color:' + C.gris + ';vertical-align:top">CA encaissé ' + ca.annee + '</td><td style="padding:8px;border-bottom:1px solid ' + C.filet + '"><strong style="' + mono + '">' + Courriers_euros_(ca.encaisse) + '</strong> · engagé <span style="' + mono + '">' + Courriers_euros_(ca.engage) + '</span><br>' + jalons + '</td></tr>');

  var dateTxt = Utilities.formatDate(quand, APP.FUSEAU, 'dd/MM/yyyy');
  var nbAvis = avisPaca.length + horsPaca.length;
  var sujet = APP.NOM + ' — ' + dateTxt + ' — ' + nbAvis + (nbAvis > 1 ? ' nouveaux' : ' nouvel') + ' avis · ' + echeances.length + ' échéance' + (echeances.length > 1 ? 's' : '');

  var html = '<!DOCTYPE html><html lang="fr"><body style="margin:0;background:' + C.brume + ';font-family:\'IBM Plex Sans\',Arial,sans-serif;color:' + C.encre + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.brume + '"><tr><td align="center" style="padding:16px 8px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:' + C.blanc + ';border-radius:12px;overflow:hidden">' +
    '<tr><td style="background:' + C.ardoise + ';padding:18px 24px;color:' + C.inverse + '">' +
      '<div style="font-size:12px;letter-spacing:.14em;color:' + C.inverse2 + ';font-weight:600">KOMPA INGÉNIERIE</div>' +
      '<div style="font-size:20px;font-weight:700">Kompa Affaires — ' + dateTxt + '</div></td></tr>' +
    corps +
    '<tr><td style="padding:24px">' + bouton(url, 'Ouvrir Kompa Affaires') + '</td></tr>' +
    '<tr><td style="padding:12px 24px;border-top:1px solid ' + C.filet + ';color:' + C.gris + ';font-size:12px;' + mono + '">E-mail automatique du lundi au vendredi à ' + Params_nombre('email.heure', 7) + ' h — paramètres email.* de l\'app.</td></tr>' +
    '</table></td></tr></table></body></html>';

  var texte = [sujet, '']
    .concat(avisPaca.length ? ['NOUVEAUX AVIS ' + paca].concat(avisPaca.map(function (a) { return '- [' + a.pre_score + '] ' + a.acheteur + ' — ' + a.objet + ' — ' + a.lien; })).concat(['']) : [])
    .concat(avisFrance.length ? ['NOUVEAUX AVIS HORS ' + paca + ' (présentiel à vérifier)'].concat(avisFrance.map(function (a) { return '- [' + a.pre_score + '] ' + a.acheteur + ' — ' + a.objet + ' — ' + a.lien; })).concat(['']) : [])
    .concat(echeances.length ? ['ÉCHÉANCES À 7 JOURS'].concat(echeances.map(function (e) { return '- ' + jr(e.date) + ' ' + e.libelle + ' — ' + e.acheteur; })).concat(['']) : [])
    .concat(relances.length ? ['RELANCES À FAIRE'].concat(relances.map(function (r) { return '- ' + jr(r.date_prevue) + ' ' + r.type + ' — ' + r.acheteur; })).concat(['']) : [])
    .concat(['Ouvrir l\'app : ' + url]).join('\n');

  return { sujet: sujet, html: html, texte: texte, contenu: contenu,
    nombres: { avisPaca: avisPaca.length, avisFrance: horsPaca.length, echeances: echeances.length, relances: relances.length } };
}

function Email_urlApp_() {
  var u = Params_texte('app.url', '');
  if (u) return u;
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}
