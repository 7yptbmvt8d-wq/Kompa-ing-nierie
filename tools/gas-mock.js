/**
 * Simulation minimale des services Google Apps Script utilisés par le socle,
 * pour exécuter le code de src/ sous Node (tests et aperçu local).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

/** Horloge des modifications de classeur : date « Drive » de dernière modification (mémoire partagée de Db.js). */
const horloge = { n: 0 };

function creerFeuille(nom) {
  const f = {
    nom,
    lignes: [], // tableau 2D de valeurs
    maxLignes: 1000,
    maxColonnes: 26,
    formats: {},
    getName: () => f.nom,
    getLastRow: () => {
      for (let i = f.lignes.length - 1; i >= 0; i--) {
        if ((f.lignes[i] || []).some((v) => v !== '' && v !== undefined && v !== null)) return i + 1;
      }
      return 0;
    },
    getLastColumn: () => {
      let max = 0;
      f.lignes.forEach((l) => {
        for (let j = (l || []).length - 1; j >= 0; j--) {
          if (l[j] !== '' && l[j] !== undefined && l[j] !== null) { max = Math.max(max, j + 1); break; }
        }
      });
      return max;
    },
    getMaxRows: () => f.maxLignes,
    getMaxColumns: () => f.maxColonnes,
    insertColumnsAfter: (_apres, n) => { f.maxColonnes += n; },
    deleteRow: (r) => { horloge.n++; f.lignes.splice(r - 1, 1); },
    setFrozenRows: () => f,
    formules: {},
    getRange: (r, c, nr = 1, nc = 1) => creerPlage(f, r, c, nr, nc)
  };
  // Mise en forme de la feuille (setName, setColumnWidth…) : sans effet, chaînable ; setName renomme.
  f.setName = (n) => { f.nom = n; return f; };
  return new Proxy(f, { get: (cible, prop) => (prop in cible ? cible[prop] : () => cible) });
}

function creerPlage(f, r, c, nr, nc) {
  if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error(`Plage invalide ${r},${c},${nr},${nc}`);
  if (c + nc - 1 > f.maxColonnes) throw new Error(`Hors grille : colonne ${c + nc - 1} > ${f.maxColonnes}`);
  if (r + nr - 1 > f.maxLignes) f.maxLignes = r + nr - 1;
  const plage = {
    getValues: () => {
      const out = [];
      for (let i = 0; i < nr; i++) {
        const l = f.lignes[r - 1 + i] || [];
        const row = [];
        for (let j = 0; j < nc; j++) {
          const v = l[c - 1 + j];
          row.push(v === undefined ? '' : v);
        }
        out.push(row);
      }
      return out;
    },
    setValues: (vals) => {
      if (vals.length !== nr || vals.some((l) => l.length !== nc)) {
        throw new Error(`Dimensions incohérentes : ${vals.length}x${vals[0] && vals[0].length} pour ${nr}x${nc}`);
      }
      horloge.n++;
      for (let i = 0; i < nr; i++) {
        f.lignes[r - 1 + i] = f.lignes[r - 1 + i] || [];
        for (let j = 0; j < nc; j++) {
          let v = vals[i][j];
          const texte = f.formats[c + j] === '@' && r + i > 1;
          // Comportement de Sheets : une chaîne numérique devient un nombre, sauf en format texte.
          if (!texte && typeof v === 'string' && v.trim() !== '' && /^-?\d+(\.\d+)?$/.test(v.trim())) v = Number(v);
          f.lignes[r - 1 + i][c - 1 + j] = v;
        }
      }
      return plage.moi;
    },
    setNumberFormat: (fmt) => { for (let j = 0; j < nc; j++) f.formats[c + j] = fmt; return plage.moi; },
    // Formules conservées à part (adresse « L,C » → texte), pour les tests d'export
    setFormulas: (vals) => { vals.forEach((l, i) => l.forEach((v, j) => { f.formules[(r + i) + ',' + (c + j)] = v; })); return plage.moi; }
  };
  // Méthodes de mise en forme (setFontWeight, setBackground…) : sans effet, chaînables.
  const proxy = new Proxy(plage, {
    get: (cible, prop) => (prop in cible ? cible[prop] : () => proxy)
  });
  plage.moi = proxy;
  return proxy;
}

function creerClasseur(nom) {
  const id = 'SS-' + crypto.randomUUID();
  const s = {
    id, nom,
    feuilles: [creerFeuille('Feuille 1')],
    getId: () => id,
    getName: () => s.nom,
    getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id,
    getSheetByName: (n) => s.feuilles.find((f) => f.nom === n) || null,
    getSheets: () => s.feuilles.slice(),
    insertSheet: (n) => { const f = creerFeuille(n); s.feuilles.push(f); return f; },
    deleteSheet: (f) => { s.feuilles = s.feuilles.filter((x) => x !== f); },
    setSpreadsheetTimeZone: () => {},
    setSpreadsheetLocale: () => {}
  };
  return s;
}

/**
 * API Insee simulée. options.insee(url) → { code, texte } remplace tout ;
 * options.inseeEchecs = n : n réponses HTTP 503 ; sinon valeurs synthétiques déterministes
 * (100 + 0,25 par mois depuis 2015-01, dernier mois 2026-09 provisoire).
 */
function inseeSimule(url, options) {
  if (options.insee) { const r = options.insee(url); return { getResponseCode: () => r.code, getContentText: () => r.texte }; }
  if ((options.inseeEchecs || 0) > 0) { options.inseeEchecs--; return { getResponseCode: () => 503, getContentText: () => 'Service Unavailable' }; }
  const idbanks = url.split('SERIES_BDM/')[1].split('?')[0].split('+');
  const debut = (url.match(/startPeriod=(\d{4}-\d{2})/) || [])[1];
  const dernierN = Number((url.match(/lastNObservations=(\d+)/) || [])[1] || 0);
  const mois = [];
  for (let a = 2015; a <= 2026; a++) for (let m = 1; m <= 12; m++) { const t = `${a}-${String(m).padStart(2, '0')}`; if (t <= (options.inseeDernierMois || '2026-09')) mois.push(t); }
  let liste = debut ? mois.filter((t) => t >= debut) : mois.slice(-dernierN);
  const serie = (id) => '<Series IDBANK="' + id + '" FREQ="M" TITLE_FR="Index ' + id + '" DECIMALS="1">' + liste.slice().reverse().map((t, i) => {
    const v = (100 + 0.25 * mois.indexOf(t) + (Number(id.slice(-2)) % 7)).toFixed(1);
    const qual = i === 0 && !options.inseeToutDefinitif ? 'PROV' : 'DEF';
    return '<Obs TIME_PERIOD="' + t + '" OBS_VALUE="' + v + '" OBS_STATUS="A" OBS_QUAL="' + qual + '" OBS_TYPE="A"/>';
  }).join('') + '</Series>';
  const xml = '<?xml version="1.0"?><message:StructureSpecificData xmlns:message="m"><message:DataSet>' + idbanks.map(serie).join('') + '</message:DataSet></message:StructureSpecificData>';
  return { getResponseCode: () => 200, getContentText: () => xml };
}

function creerEnvironnement(options = {}) {
  const classeurs = {};
  const proprietes = {};
  const declencheurs = [];
  const fichiersDrive = [];
  const email = options.email || 'kompa.affaires@example.com';

  const formatDate = (d, _tz, motif) => {
    const p = (n) => String(n).padStart(2, '0');
    const jetons = { yyyy: d.getFullYear(), MM: p(d.getMonth() + 1), dd: p(d.getDate()), HH: p(d.getHours()), mm: p(d.getMinutes()) };
    return motif.replace(/yyyy|MM|dd|HH|mm/g, (j) => jetons[j]);
  };

  const gas = {
    SpreadsheetApp: {
      create: (nom) => { const s = creerClasseur(nom); classeurs[s.id] = s; return s; },
      openById: (id) => { if (!classeurs[id]) throw new Error('introuvable'); return classeurs[id]; },
      flush: () => {}
    },
    PropertiesService: {
      getUserProperties: () => ({
        getProperty: (k) => (('u:' + k) in proprietes ? proprietes['u:' + k] : null),
        setProperty: (k, v) => { proprietes['u:' + k] = String(v); }
      }),
      getScriptProperties: () => ({
        getProperty: (k) => (k in proprietes ? proprietes[k] : null),
        setProperty: (k, v) => { proprietes[k] = String(v); },
        deleteProperty: (k) => { delete proprietes[k]; }
      })
    },
    // Cache du script simulé (valeurs texte, sans expiration) ; options.sansCache : service absent
    CacheService: options.sansCache ? undefined : {
      _valeurs: {},
      getScriptCache: () => {
        const v = gas.CacheService._valeurs;
        return {
          get: (k) => (k in v ? v[k] : null),
          getAll: (cles) => { const o = {}; cles.forEach((k) => { if (k in v) o[k] = v[k]; }); return o; },
          put: (k, val) => { if (String(val).length > 100000) throw new Error('Argument too large'); v[k] = String(val); },
          putAll: (o) => { Object.keys(o).forEach((k) => { if (String(o[k]).length > 100000) throw new Error('Argument too large'); v[k] = String(o[k]); }); },
          remove: (k) => { delete v[k]; },
          removeAll: (cles) => { cles.forEach((k) => { delete v[k]; }); }
        };
      }
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
    Session: {
      getEffectiveUser: () => ({ getEmail: () => email }),
      getActiveUser: () => ({ getEmail: () => options.visiteur || email })
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(), formatDate, sleep: () => {},
      base64Decode: (t) => Array.from(Buffer.from(t, 'base64')),
      base64Encode: (o) => Buffer.from(o).toString('base64'),
      newBlob: (octets, type, nom) => ({ octets, type, nom })
    },
    MailApp: { envois: [], getRemainingDailyQuota: () => 100, sendEmail: (m) => { gas.MailApp.envois.push(m); } },
    // API BOAMP simulée : options.boamp = réponse JSON ; options.echecsHttp = nb de coupures avant succès
    UrlFetchApp: {
      appels: [],
      fetch: (url, opt) => {
        gas.UrlFetchApp.appels.push(url);
        if (/bdm\.insee\.fr/.test(url)) return inseeSimule(url, options);
        // API Qonto simulée : options.qonto = { factures: [...], cle: 'login:secret' }
        if (/thirdparty\.qonto\.com/.test(url)) {
          const q = options.qonto || { factures: [] };
          const auth = (opt && opt.headers && opt.headers.Authorization) || '';
          if (q.cle && auth !== q.cle) return { getResponseCode: () => 401, getContentText: () => '{"errors":[{"code":"unauthorized"}]}' };
          if (/\/v2\/organization/.test(url)) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ organization: { legal_name: 'KOMPA INGENIERIE' } }) };
          const page = Number((url.match(/[?&]page=(\d+)/) || [])[1] || 1);
          const lot = q.factures.slice((page - 1) * 2, page * 2); // 2 par page : la pagination est testée
          return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ client_invoices: lot, meta: { current_page: page, next_page: page * 2 < q.factures.length ? page + 1 : null } }) };
        }
        // Export .xlsx d'un Google Sheets (module Estimation)
        if (/docs\.google\.com\/spreadsheets\/d\/[^/]+\/export\?format=xlsx/.test(url)) {
          if (options.exportHttp) return { getResponseCode: () => options.exportHttp, getBlob: () => null };
          const blob = { octets: [80, 75, 3, 4], type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', nom: 'export.xlsx' };
          blob.setName = (n) => { blob.nom = n; return blob; };
          return { getResponseCode: () => 200, getBlob: () => blob };
        }
        if ((options.echecsHttp || 0) > 0) { options.echecsHttp--; throw new Error('Connection reset by peer'); }
        const offset = Number((url.match(/offset=(\d+)/) || [])[1] || 0);
        const source = options.boamp || { total_count: 0, results: [] };
        const page = { total_count: source.results.length, results: source.results.slice(offset, offset + 100) };
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(page) };
      }
    },
    // Gmail simulé : options.gmail = [{ id, sujet, de, corps, date }]
    GmailApp: {
      search: (q) => { (options.requetesGmail || (options.requetesGmail = [])).push(q); return [{
        getMessages: () => (options.gmail || []).map((m) => ({
          getId: () => m.id, getSubject: () => m.sujet, getFrom: () => m.de,
          getPlainBody: () => m.corps, getDate: () => m.date || new Date()
        }))
      }]; }
    },
    ScriptApp: {
      WeekDay: { MONDAY: 'MONDAY' },
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }),
      getOAuthToken: () => 'jeton-test',
      getProjectTriggers: () => declencheurs.slice(),
      deleteTrigger: (t) => { declencheurs.splice(declencheurs.indexOf(t), 1); },
      newTrigger: (fn) => {
        const b = {
          timeBased: () => b, onWeekDay: () => b, onMonthDay: (j) => { b.jour = j; return b; }, atHour: () => b, everyDays: () => b, inTimezone: () => b,
          create: () => { const t = { getHandlerFunction: () => fn }; declencheurs.push(t); return t; }
        };
        return b;
      }
    },
    DriveApp: {
      // Dossiers simulés : arborescence (parent), recherche par nom, URL
      createFolder: (nom, parent) => {
        const d = {
          id: 'DIR' + crypto.randomUUID().replace(/-/g, ''), nom, parent: parent || null, corbeille: false,
          getId: () => d.id, getName: () => d.nom, isTrashed: () => d.corbeille, setTrashed: (v) => { d.corbeille = v; },
          getUrl: () => 'https://drive.google.com/drive/folders/' + d.id,
          createFolder: (n) => gas.DriveApp.createFolder(n, d),
          getFoldersByName: (n) => {
            const liste = Object.values(gas.DriveApp._dossiers).filter((x) => x.parent === d && x.nom === n && !x.corbeille);
            let i = 0;
            return { hasNext: () => i < liste.length, next: () => liste[i++] };
          },
          getFiles: () => {
            const liste = fichiersDrive.filter((f) => f.dossier === d && !f.corbeille);
            let i = 0;
            return { hasNext: () => i < liste.length, next: () => liste[i++] };
          },
          getFilesByName: (n) => {
            const liste = fichiersDrive.filter((f) => f.dossier === d && !f.corbeille && f.nom === n);
            let i = 0;
            return { hasNext: () => i < liste.length, next: () => liste[i++] };
          },
          getFolders: () => {
            const liste = Object.values(gas.DriveApp._dossiers).filter((x) => x.parent === d && !x.corbeille);
            let i = 0;
            return { hasNext: () => i < liste.length, next: () => liste[i++] };
          },
          createFile: (blob) => {
            const f = {
              id: 'FIC' + fichiersDrive.length, nom: blob.nom, dossier: d, corbeille: false, octets: blob.octets, type: blob.type,
              cree: new Date(Date.now() + fichiersDrive.length * 1000),
              getId: () => f.id, getName: () => f.nom, getBlob: () => ({ getDataAsString: () => Buffer.from(f.octets).toString('utf8'), getBytes: () => f.octets.slice() }), getMimeType: () => f.type || '', getLastUpdated: () => f.cree, getUrl: () => 'https://drive.google.com/file/d/' + f.id + '/view', getSize: () => f.octets.length,
              getDateCreated: () => f.cree, setTrashed: (v) => { f.corbeille = v; }
            };
            fichiersDrive.push(f);
            return f;
          }
        };
        gas.DriveApp._dossiers[d.id] = d;
        return d;
      },
      _dossiers: {},
      getFolderById: (id) => { const d = gas.DriveApp._dossiers[id]; if (!d) throw new Error('introuvable'); return d; },
      corbeille: [],
      getFileById: (id) => ({
        getLastUpdated: () => new Date(1e12 + horloge.n),
        getName: () => (classeurs[id] ? classeurs[id].nom : ''),
        setName: (n) => { if (classeurs[id]) classeurs[id].nom = n; horloge.n++; },
        setTrashed: (v) => { if (v) gas.DriveApp.corbeille.push(id); },
        moveTo: (dossier) => { (gas.DriveApp.deplaces || (gas.DriveApp.deplaces = [])).push({ id, dossier: dossier.getName() }); },
        makeCopy: (nom, dossier) => {
          const f = {
            nom, dossier, corbeille: false, cree: new Date(Date.now() + fichiersDrive.length),
            getName: () => f.nom, getDateCreated: () => f.cree, setTrashed: (v) => { f.corbeille = v; }
          };
          fichiersDrive.push(f);
          return f;
        }
      })
    },
    HtmlService: {
      sorties: [],
      createTemplateFromFile: () => ({
        evaluate: () => {
          const o = { titre: '', favicon: '', meta: {} };
          o.setTitle = (t) => { o.titre = t; return o; };
          o.addMetaTag = (n, v) => { o.meta[n] = v; return o; };
          o.setFaviconUrl = (u) => { if (!/\.(png|ico|gif|jpe?g)$/i.test(u)) throw new Error('extension'); o.favicon = u; return o; };
          gas.HtmlService.sorties.push(o);
          return o;
        }
      }),
      createHtmlOutputFromFile: (nom) => ({
        getContent: () => fs.readFileSync(path.join(__dirname, '..', 'src', nom + '.html'), 'utf8')
      })
    },
    console
  };

  const contexte = vm.createContext(Object.assign({}, gas));
  if (options.dist) {
    // Version assemblée pour le copier-coller (dist/Code.gs)
    // Ordre de l'éditeur : Estimation.gs peut être chargé avant ou après Code.gs (options.ordre).
    const fichiers = options.ordre === 'estimation-avant' ? ['Estimation.gs', 'Code.gs'] : ['Code.gs', 'Estimation.gs'];
    fichiers.filter((n) => !(options.sansEstimation && n === 'Estimation.gs')).forEach((n) => {
      vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', n), 'utf8'), contexte, { filename: n });
    });
  } else {
    const dossierSrc = path.join(__dirname, '..', 'src');
    fs.readdirSync(dossierSrc)
      .filter((f) => f.endsWith('.js'))
      .sort()
      .forEach((f) => vm.runInContext(fs.readFileSync(path.join(dossierSrc, f), 'utf8'), contexte, { filename: f }));
  }

  return { ctx: contexte, classeurs, proprietes, declencheurs, fichiersDrive, cache: gas.CacheService, horloge, gas };
}

module.exports = { creerEnvironnement, inseeSimule };
