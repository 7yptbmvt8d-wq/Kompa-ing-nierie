/**
 * Simulation minimale des services Google Apps Script utilisés par le socle,
 * pour exécuter le code de src/ sous Node (tests et aperçu local).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

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
    deleteRow: (r) => { f.lignes.splice(r - 1, 1); },
    setFrozenRows: () => f,
    getRange: (r, c, nr = 1, nc = 1) => creerPlage(f, r, c, nr, nc)
  };
  return f;
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
      return plage;
    },
    setNumberFormat: (fmt) => { for (let j = 0; j < nc; j++) f.formats[c + j] = fmt; return plage; }
  };
  // Méthodes de mise en forme (setFontWeight, setBackground…) : sans effet, chaînables.
  const proxy = new Proxy(plage, {
    get: (cible, prop) => (prop in cible ? cible[prop] : () => proxy)
  });
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
      getScriptProperties: () => ({
        getProperty: (k) => (k in proprietes ? proprietes[k] : null),
        setProperty: (k, v) => { proprietes[k] = String(v); }
      })
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
    Session: {
      getEffectiveUser: () => ({ getEmail: () => email }),
      getActiveUser: () => ({ getEmail: () => options.visiteur || email })
    },
    Utilities: { getUuid: () => crypto.randomUUID(), formatDate, sleep: () => {} },
    MailApp: { envois: [], getRemainingDailyQuota: () => 100, sendEmail: (m) => { gas.MailApp.envois.push(m); } },
    // API BOAMP simulée : options.boamp = réponse JSON ; options.echecsHttp = nb de coupures avant succès
    UrlFetchApp: {
      appels: [],
      fetch: (url) => {
        gas.UrlFetchApp.appels.push(url);
        if ((options.echecsHttp || 0) > 0) { options.echecsHttp--; throw new Error('Connection reset by peer'); }
        const offset = Number((url.match(/offset=(\d+)/) || [])[1] || 0);
        const source = options.boamp || { total_count: 0, results: [] };
        const page = { total_count: source.results.length, results: source.results.slice(offset, offset + 100) };
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(page) };
      }
    },
    // Gmail simulé : options.gmail = [{ id, sujet, de, corps, date }]
    GmailApp: {
      search: () => [{
        getMessages: () => (options.gmail || []).map((m) => ({
          getId: () => m.id, getSubject: () => m.sujet, getFrom: () => m.de,
          getPlainBody: () => m.corps, getDate: () => m.date || new Date()
        }))
      }]
    },
    ScriptApp: {
      WeekDay: { MONDAY: 'MONDAY' },
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }),
      getProjectTriggers: () => declencheurs.slice(),
      deleteTrigger: (t) => { declencheurs.splice(declencheurs.indexOf(t), 1); },
      newTrigger: (fn) => {
        const b = {
          timeBased: () => b, onWeekDay: () => b, atHour: () => b, everyDays: () => b, inTimezone: () => b,
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
          }
        };
        gas.DriveApp._dossiers[d.id] = d;
        return d;
      },
      _dossiers: {},
      getFolderById: (id) => { const d = gas.DriveApp._dossiers[id]; if (!d) throw new Error('introuvable'); return d; },
      getFileById: (id) => ({
        makeCopy: (nom, dossier) => {
          const f = {
            nom, dossier, corbeille: false, cree: new Date(Date.now() + fichiersDrive.length),
            getDateCreated: () => f.cree, setTrashed: (v) => { f.corbeille = v; }
          };
          fichiersDrive.push(f);
          return f;
        }
      })
    },
    HtmlService: {
      createHtmlOutputFromFile: (nom) => ({
        getContent: () => fs.readFileSync(path.join(__dirname, '..', 'src', nom + '.html'), 'utf8')
      })
    },
    console
  };

  const contexte = vm.createContext(Object.assign({}, gas));
  if (options.dist) {
    // Version assemblée pour le copier-coller (dist/Code.gs)
    const f = path.join(__dirname, '..', 'dist', 'Code.gs');
    vm.runInContext(fs.readFileSync(f, 'utf8'), contexte, { filename: 'Code.gs' });
  } else {
    const dossierSrc = path.join(__dirname, '..', 'src');
    fs.readdirSync(dossierSrc)
      .filter((f) => f.endsWith('.js'))
      .sort()
      .forEach((f) => vm.runInContext(fs.readFileSync(path.join(dossierSrc, f), 'utf8'), contexte, { filename: f }));
  }

  return { ctx: contexte, classeurs, proprietes, declencheurs, fichiersDrive };
}

module.exports = { creerEnvironnement };
