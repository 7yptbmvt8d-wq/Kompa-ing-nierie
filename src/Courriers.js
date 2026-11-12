/**
 * Modèles de courriers des relances (§ 5) : texte prêt à copier dans un e-mail ou un courrier.
 * Les informations manquantes restent entre crochets, à compléter (charte Kompa § 1.7).
 */

function Courriers_modele(idRelance) {
  var r = Db_trouver(TABLES.RELANCES, idRelance);
  if (!r) throw new Error('Relance introuvable : ' + idRelance);
  var a = Db_trouver(TABLES.AFFAIRES, r.id_affaire) || {};
  var f = r.id_facture ? Db_trouver(TABLES.FACTURES, r.id_facture) || {} : {};
  var j = function (v) { var d = date_(v); return d ? Utilities.formatDate(d, APP.FUSEAU, 'dd/MM/yyyy') : '[date]'; };
  var e = function (v) { return montant_(v) ? Courriers_euros_(montant_(v)) : '[montant]'; };
  var consultation = '« ' + (a.objet || '[objet de la consultation]') + ' »' + (a.reference_acheteur ? ' (référence ' + a.reference_acheteur + ')' : '');
  var ref = a.reference_acheteur ? a.reference_acheteur + ' — ' : '';
  var signature = Params_texte('courrier.signature', 'Sébastien De Raedt EI\nKompa Ingénierie');
  var politesse = 'Nous vous prions d\'agréer, Madame, Monsieur, l\'expression de nos salutations distinguées.';
  var corps, objet;

  switch (r.type) {
    case TYPES_RELANCE.MOTIFS:
    case TYPES_RELANCE.MOTIFS_RAPPEL:
      objet = ref + 'Demande des motifs de rejet de notre offre' + (r.type === TYPES_RELANCE.MOTIFS_RAPPEL ? ' — rappel' : '');
      corps = [
        'Madame, Monsieur,',
        '',
        (r.type === TYPES_RELANCE.MOTIFS_RAPPEL
          ? 'Notre demande du ' + j(Courriers_premiereDemande_(a.id)) + ' étant restée sans réponse, nous nous permettons de la renouveler.\n\n'
          : '') +
        'Par courrier du ' + j(a.date_resultat) + ', vous nous avez informés du rejet de l\'offre remise par Kompa Ingénierie le ' + j(a.date_depot) +
          ' pour la consultation ' + consultation + '.',
        '',
        'En application des articles R. 2181-1 à R. 2181-4 du code de la commande publique, nous vous remercions de bien vouloir nous communiquer :',
        '– les motifs détaillés du rejet de notre offre ;',
        '– le nom de l\'attributaire et le montant de son offre ;',
        '– les notes obtenues par notre offre et par celle de l\'attributaire pour chacun des critères de jugement, ainsi que notre classement.',
        '',
        'Ces éléments nous permettront d\'améliorer nos prochaines propositions.',
        '',
        politesse
      ];
      break;
    case TYPES_RELANCE.DECISION:
      objet = ref + 'Demande d\'information sur l\'attribution';
      corps = [
        'Madame, Monsieur,',
        '',
        'Kompa Ingénierie a remis le ' + j(a.date_depot) + ' une offre pour la consultation ' + consultation + '.',
        '',
        'La durée de validité de notre offre (' + (montant_(a.validite_offre_jours) || Params_nombre('echeance.validite_defaut_j', 90)) +
          ' jours) étant arrivée à son terme, nous vous remercions de bien vouloir nous indiquer où en est la procédure et, le cas échéant, la date prévisionnelle d\'attribution.',
        '',
        'Nous restons disposés à prolonger la validité de notre offre si nécessaire.',
        '',
        politesse
      ];
      break;
    case TYPES_RELANCE.ENCAISSEMENT:
      objet = ref + 'Relance de paiement — facture ' + (f.numero || '[n°]');
      corps = [
        'Madame, Monsieur,',
        '',
        'Sauf erreur de notre part, la facture n° ' + (f.numero || '[n°]') + ' du ' + j(f.date) + ', d\'un montant de ' + e(f.montant) +
          ' HT (TVA non applicable, art. 293 B du CGI), relative à la mission ' + consultation + ', n\'a pas encore été réglée.',
        '',
        'Le délai global de paiement de 30 jours (article R. 2192-10 du code de la commande publique) est échu depuis le ' + j(f.date_echeance) +
          '. Nous vous remercions de bien vouloir procéder à son règlement dans les meilleurs délais.',
        '',
        'Pour mémoire, le dépassement du délai de paiement fait courir de plein droit des intérêts moratoires et une indemnité forfaitaire pour frais de recouvrement de 40 € (articles L. 2192-13 et D. 2192-35 du même code).',
        '',
        politesse
      ];
      break;
    case TYPES_RELANCE.FACTURATION:
      objet = ref + 'Facture ' + (f.numero || '[n°]');
      corps = [
        'Madame, Monsieur,',
        '',
        'Nous avons déposé ce jour sur Chorus Pro la facture n° ' + (f.numero || '[n°]') + ', d\'un montant de ' + e(f.montant) +
          ' HT (TVA non applicable, art. 293 B du CGI), au titre de la mission ' + consultation + '.',
        '',
        'Nous restons à votre disposition pour tout complément.',
        '',
        politesse
      ];
      break;
    default:
      objet = ref + (r.type || 'Relance');
      corps = ['Madame, Monsieur,', '', '[texte]', '', politesse];
  }
  var texte = corps.join('\n') + '\n\n' + signature;
  return { type: r.type, destinataire: a.acheteur || '[acheteur]', objet: objet, corps: texte };
}

function Courriers_premiereDemande_(idAffaire) {
  var m = Db_lire(TABLES.RELANCES).filter(function (r) { return r.id_affaire === idAffaire && r.type === TYPES_RELANCE.MOTIFS; })[0];
  return m ? (m.date_faite || m.date_prevue) : '';
}

function Courriers_euros_(n) {
  var s = (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
  var p = s.split(',');
  return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + p[1] + ' €';
}
