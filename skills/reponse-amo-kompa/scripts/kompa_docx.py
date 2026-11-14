#!/usr/bin/env python3
"""
Générateur de documents Word aux couleurs de Kompa Ingénierie (charte Kompa, § 4 à 6).

Usage :
    python3 kompa_docx.py contenu.json sortie.docx

Le fichier JSON décrit le document :
{
  "reference": "KA-2026-012",            # n° d'affaire de l'app Kompa Affaires
  "indice": "A",
  "date": "14/11/2026",
  "redacteur": "Sébastien De Raedt",
  "couverture": {                        # facultatif : page de garde ardoise
    "surtitre": "NOTE MÉTHODOLOGIQUE · OFFRE",
    "titre": "Programmation du groupe scolaire",
    "acheteur": "Commune de Rousset",
    "consultation": "Réf. acheteur 2026-SERV-012"
  },
  "entete_titre": "Note méthodologique",  # rappelé en tête de la 1re page sans couverture
  "blocs": [
    {"h1": "Compréhension du besoin"},   # titres numérotés automatiquement 1 / 1.1 / 1.1.1
    {"h2": "Contexte"},
    {"h3": "..."},
    {"p": "Texte. **gras** et [à compléter] autorisés."},
    {"puces": ["point 1", "point 2"]},
    {"numeros": ["étape 1", "étape 2"]},
    {"table": {"entetes": ["Tâche", "Livrable", "Jours"], "lignes": [["...", "...", "2"]],
               "largeurs_mm": [80, 60, 30], "droite": [2], "mono": [2], "total": ["Total", "", "12"]}},
    {"cases": ["Pièce 1", "Pièce 2"]},   # liste à cocher (☐)
    {"consigne": "Texte d'aide en gris italique (à supprimer avant envoi)"},
    {"legende": "Légende sous un tableau"},
    {"encadre": "Texte important dans un aplat brume"},
    {"saut": true}
  ]
}
Les informations inconnues s'écrivent entre crochets : [téléphone], [SIRET]. Ne rien inventer.
"""
import json
import os
import re
import sys

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ROW_HEIGHT_RULE
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor

ICI = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(ICI, '..', 'assets')

# Couleurs de la charte (tokens.css)
ENCRE = '0B1220'
ARDOISE = '1B263B'
ROUILLE = 'B4460E'
ROUILLE_CLAIR = 'E2733A'
BRUME = 'EEF1F6'
GRIS = '4A5568'
FILET = 'D5DBE5'
TEXTE_INVERSE = 'EEF2F8'
TEXTE_INVERSE_2 = 'A3B0C4'

SANS = 'IBM Plex Sans'
MONO = 'IBM Plex Mono'

MENTIONS = 'Kompa Ingénierie — Sébastien De Raedt EI · SIRET [n°] · TVA non applicable, art. 293 B du CGI'


def rgb(h):
    return RGBColor.from_string(h)


def police(run, nom=SANS, taille=None, gras=None, couleur=None, italique=None, espacement=None, capitales=None):
    run.font.name = nom
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts')
        rpr.insert(0, rfonts)
    for a in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
        rfonts.set(qn(a), nom)
    if taille:
        run.font.size = Pt(taille)
    if gras is not None:
        run.font.bold = gras
    if italique is not None:
        run.font.italic = italique
    if couleur:
        run.font.color.rgb = rgb(couleur)
    if capitales:
        run.font.all_caps = True
    if espacement is not None:  # interlettrage en points
        sp = OxmlElement('w:spacing')
        sp.set(qn('w:val'), str(int(espacement * 20)))
        rpr.append(sp)
    return run


def ombrer(cellule, couleur):
    tcpr = cellule._element.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), couleur)
    tcpr.append(shd)


def marges_cellule(cellule, haut=0, bas=0, gauche=0, droite=0):
    tcpr = cellule._element.get_or_add_tcPr()
    mar = OxmlElement('w:tcMar')
    for cote, v in (('top', haut), ('bottom', bas), ('start', gauche), ('end', droite), ('left', gauche), ('right', droite)):
        e = OxmlElement('w:' + cote)
        e.set(qn('w:w'), str(int(v * 56.7)))  # mm → twips
        e.set(qn('w:type'), 'dxa')
        mar.append(e)
    tcpr.append(mar)


def bordures_table(table, horizontales=True, couleur=FILET, taille=4, exterieures=True):
    tblpr = table._element.tblPr
    b = OxmlElement('w:tblBorders')
    for cote in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        e = OxmlElement('w:' + cote)
        visible = horizontales and cote in ('insideH',) or (exterieures and horizontales and cote in ('top', 'bottom'))
        e.set(qn('w:val'), 'single' if visible else 'nil')
        if visible:
            e.set(qn('w:sz'), str(taille))
            e.set(qn('w:color'), couleur)
        b.append(e)
    tblpr.append(b)


def largeur_table(table, largeurs_mm, retrait_mm=0):
    tblpr = table._element.tblPr
    lay = OxmlElement('w:tblLayout')
    lay.set(qn('w:type'), 'fixed')
    tblpr.append(lay)
    if retrait_mm:
        ind = OxmlElement('w:tblInd')
        ind.set(qn('w:w'), str(int(retrait_mm * 56.7)))
        ind.set(qn('w:type'), 'dxa')
        tblpr.append(ind)
    for ligne in table.rows:
        for i, c in enumerate(ligne.cells):
            c.width = Mm(largeurs_mm[i])
    grid = table._element.tblGrid
    for i, g in enumerate(grid.findall(qn('w:gridCol'))):
        g.set(qn('w:w'), str(int(largeurs_mm[i] * 56.7)))


def interligne(par, avant=0, apres=4, ligne=1.3):
    pf = par.paragraph_format
    pf.space_before = Pt(avant)
    pf.space_after = Pt(apres)
    pf.line_spacing = ligne


def champ(par, code, nom=MONO, taille=8, couleur=GRIS):
    r = par.add_run()
    police(r, nom, taille, couleur=couleur)
    d = OxmlElement('w:fldChar'); d.set(qn('w:fldCharType'), 'begin'); r._element.append(d)
    r2 = par.add_run(); police(r2, nom, taille, couleur=couleur)
    t = OxmlElement('w:instrText'); t.set(qn('xml:space'), 'preserve'); t.text = ' %s ' % code; r2._element.append(t)
    r3 = par.add_run(); police(r3, nom, taille, couleur=couleur)
    s = OxmlElement('w:fldChar'); s.set(qn('w:fldCharType'), 'separate'); r3._element.append(s)
    r4 = par.add_run('1'); police(r4, nom, taille, couleur=couleur)
    r5 = par.add_run(); police(r5, nom, taille, couleur=couleur)
    f = OxmlElement('w:fldChar'); f.set(qn('w:fldCharType'), 'end'); r5._element.append(f)


def texte_riche(par, texte, taille=10, couleur=ENCRE, italique=False, nom=SANS):
    """**gras** ; les [crochets] (informations à compléter) passent en rouille pour être repérés."""
    for morceau in re.split(r'(\*\*[^*]+\*\*|\[[^\]]+\])', texte):
        if not morceau:
            continue
        if morceau.startswith('**') and morceau.endswith('**'):
            police(par.add_run(morceau[2:-2]), nom, taille, gras=True, couleur=couleur, italique=italique)
        elif morceau.startswith('[') and morceau.endswith(']'):
            police(par.add_run(morceau), nom, taille, couleur=ROUILLE, italique=italique)
        else:
            police(par.add_run(morceau), nom, taille, couleur=couleur, italique=italique)


class DocKompa:
    def __init__(self, meta):
        self.meta = meta
        self.doc = Document()
        self.num = [0, 0, 0]
        self._styles()

    # ——— Styles et mise en page ———
    def _styles(self):
        st = self.doc.styles['Normal']
        st.font.name = SANS
        st.font.size = Pt(10)
        st.font.color.rgb = rgb(ENCRE)
        rpr = st.element.get_or_add_rPr()
        rf = rpr.find(qn('w:rFonts'))
        if rf is None:
            rf = OxmlElement('w:rFonts'); rpr.insert(0, rf)
        for a in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
            rf.set(qn(a), SANS)
        st.paragraph_format.line_spacing = 1.3
        st.paragraph_format.space_after = Pt(4)
        for nom, taille, couleur in (('Heading 1', 16, ARDOISE), ('Heading 2', 13, ARDOISE), ('Heading 3', 11, ENCRE)):
            h = self.doc.styles[nom]
            h.font.name = SANS
            h.font.size = Pt(taille)
            h.font.bold = True
            h.font.color.rgb = rgb(couleur)
            hr = h.element.get_or_add_rPr()
            hf = hr.find(qn('w:rFonts'))
            if hf is None:
                hf = OxmlElement('w:rFonts'); hr.insert(0, hf)
            for a in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
                hf.set(qn(a), SANS)
            for a in ('w:asciiTheme', 'w:hAnsiTheme', 'w:cstheme', 'w:eastAsiaTheme'):
                if hf.get(qn(a)) is not None:
                    del hf.attrib[qn(a)]
            h.paragraph_format.space_before = Pt(14 if nom == 'Heading 1' else 10)
            h.paragraph_format.space_after = Pt(4)
            h.paragraph_format.keep_with_next = True

    def _section_courante(self, sec):
        sec.page_width, sec.page_height = Mm(210), Mm(297)
        sec.left_margin = sec.right_margin = Mm(20)
        sec.top_margin, sec.bottom_margin = Mm(22), Mm(20)
        sec.header_distance, sec.footer_distance = Mm(10), Mm(10)
        sec.header.is_linked_to_previous = False
        sec.footer.is_linked_to_previous = False
        # En-tête : symbole 8 mm + KOMPA INGÉNIERIE
        h = sec.header.paragraphs[0]
        h.text = ''
        h.add_run().add_picture(os.path.join(ASSETS, 'kompa-symbole-512.png'), width=Mm(6))
        police(h.add_run('  KOMPA'), SANS, 9, gras=True, couleur=ARDOISE, espacement=0.8)
        police(h.add_run('  INGÉNIERIE'), SANS, 8, couleur=GRIS, espacement=2.5)
        # Pied : référence et indice à gauche, page X / Y à droite
        f = sec.footer.paragraphs[0]
        f.text = ''
        ts = f.paragraph_format.tab_stops
        ts.add_tab_stop(Mm(82.55), WD_TAB_ALIGNMENT.CLEAR)   # tabulations du style « Pied de page »
        ts.add_tab_stop(Mm(165.1), WD_TAB_ALIGNMENT.CLEAR)
        ts.add_tab_stop(Mm(170), WD_TAB_ALIGNMENT.RIGHT)
        pbdr = OxmlElement('w:pBdr'); top = OxmlElement('w:top')
        for k, v in (('w:val', 'single'), ('w:sz', '4'), ('w:space', '6'), ('w:color', FILET)):
            top.set(qn(k), v)
        pbdr.append(top); f._p.get_or_add_pPr().append(pbdr)
        m = self.meta
        ref = 'Réf. %s · Indice %s · %s' % (m.get('reference', '[KA-AAAA-NNN]'), m.get('indice', 'A'), m.get('date', '[date]'))
        police(f.add_run(ref), MONO, 7.5, couleur=GRIS)
        police(f.add_run('\tpage '), MONO, 7.5, couleur=GRIS)
        champ(f, 'PAGE', taille=7.5)
        police(f.add_run(' / '), MONO, 7.5, couleur=GRIS)
        champ(f, 'NUMPAGES', taille=7.5)
        f2 = sec.footer.add_paragraph()
        police(f2.add_run(MENTIONS), MONO, 6.5, couleur=GRIS)
        f2.paragraph_format.space_before = Pt(2)

    def couverture(self, c):
        sec = self.doc.sections[0]
        sec.page_width, sec.page_height = Mm(210), Mm(297)
        sec.left_margin = sec.right_margin = Mm(0)
        sec.top_margin, sec.bottom_margin = Mm(0), Mm(10)
        sec.header_distance = sec.footer_distance = Mm(0)
        t = self.doc.add_table(rows=1, cols=1)
        t.alignment = WD_TABLE_ALIGNMENT.LEFT
        bordures_table(t, horizontales=False)
        largeur_table(t, [210])
        row = t.rows[0]
        row.height = Mm(178)
        row.height_rule = WD_ROW_HEIGHT_RULE.EXACTLY
        cel = row.cells[0]
        ombrer(cel, ARDOISE)
        marges_cellule(cel, haut=22, gauche=20, droite=20)
        p = cel.paragraphs[0]
        p.add_run().add_picture(os.path.join(ASSETS, 'kompa-logo-negatif-1600.png'), width=Mm(48))
        interligne(p, apres=0)
        esp = cel.add_paragraph(); interligne(esp, avant=0, apres=0); esp.paragraph_format.space_before = Mm(62)
        s = cel.add_paragraph(); interligne(s, apres=8)
        police(s.add_run(c.get('surtitre', '')), MONO, 9, gras=True, couleur=ROUILLE_CLAIR, espacement=1.2, capitales=True)
        ti = cel.add_paragraph(); interligne(ti, apres=10, ligne=1.1)
        police(ti.add_run(c.get('titre', '[Titre de l\'opération]')), SANS, 26, gras=True, couleur=TEXTE_INVERSE, espacement=-0.3)
        for k in ('acheteur', 'consultation'):
            if c.get(k):
                a = cel.add_paragraph(); interligne(a, apres=2)
                police(a.add_run(c[k]), SANS, 12 if k == 'acheteur' else 10, couleur=TEXTE_INVERSE_2, gras=(k == 'acheteur'))
        # Bande rouille 5 px
        b = self.doc.add_table(rows=1, cols=1)
        bordures_table(b, horizontales=False)
        largeur_table(b, [210])
        b.rows[0].height = Mm(1.4); b.rows[0].height_rule = WD_ROW_HEIGHT_RULE.EXACTLY
        ombrer(b.rows[0].cells[0], ROUILLE)
        bp = b.rows[0].cells[0].paragraphs[0]; interligne(bp, apres=0, ligne=0.1)
        for r in bp.runs:
            r.font.size = Pt(1)
        sp = self.doc.add_paragraph(); interligne(sp, avant=0, apres=0); sp.paragraph_format.space_before = Mm(14)
        # Cartouche
        m = self.meta
        lignes = [('Référence', m.get('reference', '[KA-AAAA-NNN]')), ('Indice', m.get('indice', 'A')),
                  ('Date', m.get('date', '[date]')), ('Rédacteur', m.get('redacteur', 'Sébastien De Raedt'))]
        ca = self.doc.add_table(rows=len(lignes), cols=2)
        bordures_table(ca, horizontales=True)
        largeur_table(ca, [40, 130], retrait_mm=20)
        for i, (k, v) in enumerate(lignes):
            police(ca.rows[i].cells[0].paragraphs[0].add_run(k.upper()), MONO, 8, couleur=GRIS, espacement=0.6)
            police(ca.rows[i].cells[1].paragraphs[0].add_run(v), MONO, 9.5, gras=True, couleur=ARDOISE)
            for c2 in ca.rows[i].cells:
                interligne(c2.paragraphs[0], avant=3, apres=3)
        fin = self.doc.add_paragraph(); fin.paragraph_format.left_indent = Mm(20); interligne(fin, avant=10)
        police(fin.add_run(MENTIONS), MONO, 7, couleur=GRIS)
        nouvelle = self.doc.add_section(WD_SECTION.NEW_PAGE)
        self._section_courante(nouvelle)

    def sans_couverture(self, titre):
        self._section_courante(self.doc.sections[0])
        s = self.doc.add_paragraph(); interligne(s, apres=2)
        police(s.add_run(self.meta.get('surtitre', 'COLLECTIVITÉS · ÉTABLISSEMENTS PUBLICS')), SANS, 9, gras=True, couleur=ROUILLE, espacement=1.2, capitales=True)
        t = self.doc.add_paragraph(); interligne(t, apres=2, ligne=1.1)
        police(t.add_run(titre), SANS, 20, gras=True, couleur=ARDOISE)
        if self.meta.get('sous_titre'):
            st = self.doc.add_paragraph(); interligne(st, apres=6)
            police(st.add_run(self.meta['sous_titre']), SANS, 10.5, couleur=GRIS)
        # Repère : trait rouille 36 × 3 px
        r = self.doc.add_paragraph(); interligne(r, apres=10)
        pbdr = OxmlElement('w:pBdr'); bas = OxmlElement('w:bottom')
        for k, v in (('w:val', 'single'), ('w:sz', '18'), ('w:space', '1'), ('w:color', ROUILLE)):
            bas.set(qn(k), v)
        pbdr.append(bas); r._p.get_or_add_pPr().append(pbdr)
        r.paragraph_format.right_indent = Mm(160)

    # ——— Blocs de contenu ———
    def titre(self, niveau, texte):
        self.num[niveau - 1] += 1
        for i in range(niveau, 3):
            self.num[i] = 0
        numero = '.'.join(str(n) for n in self.num[:niveau])
        p = self.doc.add_paragraph(style='Heading %d' % niveau)
        police(p.add_run(numero + '  '), MONO, {1: 14, 2: 11.5, 3: 10}[niveau], gras=True, couleur=ROUILLE if niveau == 1 else GRIS)
        police(p.add_run(texte), SANS, {1: 16, 2: 13, 3: 11}[niveau], gras=True, couleur=ARDOISE if niveau < 3 else ENCRE)
        if niveau == 1:
            pbdr = OxmlElement('w:pBdr'); top = OxmlElement('w:top')
            for k, v in (('w:val', 'single'), ('w:sz', '12'), ('w:space', '6'), ('w:color', ARDOISE)):
                top.set(qn(k), v)
            pbdr.append(top); p._p.get_or_add_pPr().append(pbdr)

    def paragraphe(self, texte):
        p = self.doc.add_paragraph()
        texte_riche(p, texte)

    def liste(self, items, symbole='–', numeros=False):
        for i, it in enumerate(items):
            p = self.doc.add_paragraph()
            p.paragraph_format.left_indent = Mm(7)
            p.paragraph_format.first_line_indent = Mm(-5)
            interligne(p, apres=2)
            marque = ('%d.' % (i + 1)) if numeros else symbole
            police(p.add_run(marque + '\t'), MONO if numeros else SANS, 9.5 if numeros else 10, gras=numeros, couleur=ROUILLE)
            p.paragraph_format.tab_stops.add_tab_stop(Mm(7))
            texte_riche(p, it)

    def consigne(self, texte):
        p = self.doc.add_paragraph()
        p.paragraph_format.left_indent = Mm(4)
        pbdr = OxmlElement('w:pBdr'); g = OxmlElement('w:left')
        for k, v in (('w:val', 'single'), ('w:sz', '12'), ('w:space', '6'), ('w:color', FILET)):
            g.set(qn(k), v)
        pbdr.append(g); p._p.get_or_add_pPr().append(pbdr)
        police(p.add_run('Consigne — '), SANS, 8.5, gras=True, couleur=GRIS, italique=True)
        texte_riche(p, texte, taille=8.5, couleur=GRIS, italique=True)

    def legende(self, texte):
        p = self.doc.add_paragraph(); interligne(p, avant=2, apres=8)
        police(p.add_run(texte), SANS, 8.5, couleur=GRIS)

    def encadre(self, texte):
        t = self.doc.add_table(rows=1, cols=1)
        bordures_table(t, horizontales=False)
        largeur_table(t, [170])
        c = t.rows[0].cells[0]
        ombrer(c, BRUME)
        marges_cellule(c, haut=3, bas=3, gauche=4, droite=4)
        texte_riche(c.paragraphs[0], texte)
        self.doc.add_paragraph().paragraph_format.space_after = Pt(2)

    def tableau(self, spec):
        entetes = spec.get('entetes', [])
        lignes = spec.get('lignes', [])
        total = spec.get('total')
        n = len(entetes) or len(lignes[0])
        largeurs = spec.get('largeurs_mm') or [170.0 / n] * n
        droite = set(spec.get('droite', []))
        mono = set(spec.get('mono', []))
        t = self.doc.add_table(rows=(1 if entetes else 0) + len(lignes) + (1 if total else 0), cols=n)
        bordures_table(t, horizontales=True)
        largeur_table(t, largeurs)
        r0 = 0
        if entetes:
            for j, e in enumerate(entetes):
                c = t.rows[0].cells[j]
                ombrer(c, BRUME)
                p = c.paragraphs[0]; interligne(p, avant=2, apres=2, ligne=1.15)
                police(p.add_run(e), SANS, 9, gras=True, couleur=ARDOISE)
                if j in droite:
                    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            # En-tête répété à chaque page
            trpr = t.rows[0]._tr.get_or_add_trPr()
            th = OxmlElement('w:tblHeader'); th.set(qn('w:val'), 'true'); trpr.append(th)
            r0 = 1
        for i, l in enumerate(lignes + ([total] if total else [])):
            est_total = total is not None and i == len(lignes)
            for j in range(n):
                v = str(l[j]) if j < len(l) else ''
                c = t.rows[r0 + i].cells[j]
                p = c.paragraphs[0]; interligne(p, avant=2, apres=2, ligne=1.15)
                if j in droite:
                    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                if j in mono and not v.startswith('['):
                    police(p.add_run(v), MONO, 9, gras=est_total, couleur=ARDOISE)
                else:
                    texte_riche(p, ('**%s**' % v) if est_total and v else v, taille=9.5)
        self.doc.add_paragraph().paragraph_format.space_after = Pt(2)

    def cases(self, items):
        for it in items:
            p = self.doc.add_paragraph(); interligne(p, apres=2)
            p.paragraph_format.left_indent = Mm(7)
            p.paragraph_format.first_line_indent = Mm(-6)
            p.paragraph_format.tab_stops.add_tab_stop(Mm(7))
            police(p.add_run('☐\t'), SANS, 11, couleur=ARDOISE)
            texte_riche(p, it)

    def saut(self):
        self.doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    def construire(self, blocs):
        for b in blocs:
            if 'h1' in b: self.titre(1, b['h1'])
            elif 'h2' in b: self.titre(2, b['h2'])
            elif 'h3' in b: self.titre(3, b['h3'])
            elif 'p' in b: self.paragraphe(b['p'])
            elif 'puces' in b: self.liste(b['puces'])
            elif 'numeros' in b: self.liste(b['numeros'], numeros=True)
            elif 'table' in b: self.tableau(b['table'])
            elif 'cases' in b: self.cases(b['cases'])
            elif 'consigne' in b: self.consigne(b['consigne'])
            elif 'legende' in b: self.legende(b['legende'])
            elif 'encadre' in b: self.encadre(b['encadre'])
            elif b.get('saut'): self.saut()
            else:
                raise ValueError('Bloc inconnu : %s' % json.dumps(b, ensure_ascii=False))


def generer(contenu, sortie):
    d = DocKompa(contenu)
    d.doc.core_properties.author = 'Kompa Ingénierie — Sébastien De Raedt EI'
    d.doc.core_properties.title = (contenu.get('couverture') or {}).get('titre') or contenu.get('entete_titre', '')
    if contenu.get('couverture'):
        d.couverture(contenu['couverture'])
    else:
        d.sans_couverture(contenu.get('entete_titre', ''))
    d.construire(contenu.get('blocs', []))
    d.doc.save(sortie)
    return sortie


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    with open(sys.argv[1], encoding='utf-8') as f:
        generer(json.load(f), sys.argv[2])
    print('Document créé : ' + sys.argv[2])
