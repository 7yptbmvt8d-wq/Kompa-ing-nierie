#!/usr/bin/env python3
"""
Chiffrage d'une offre d'AMO aux couleurs de Kartes (Excel, formules conservées).

Usage :
    python3 kartes_chiffrage.py chiffrage.json sortie.xlsx

JSON :
{
  "reference": "KI-2027-012", "indice": "A", "date": "14/11/2026",
  "acheteur": "Commune de Rousset", "objet": "Programmation du groupe scolaire",
  "prix_jour": 400,                              # défaut Kartes : 400 € HT / jour
  "taches": [                                    # une ligne par tâche, regroupées par tranche
    {"tranche": "TF", "intitule_tranche": "Étude de faisabilité",
     "tache": "Réunion de lancement", "livrable": "Compte rendu", "jours": 0.5},
    ...
  ]
}
Le montant HT de chaque tâche = jours × prix de journée (formule Excel). Synthèse par tranche
(SOMME.SI), total général, mention « TVA non applicable, art. 293 B du CGI » : montant TTC = HT.

Accord-cadre à bons de commande : remplacer « taches » par « bpu » (une ligne par prestation du BPU,
avec le n° de ligne DE L'ACHETEUR, tel qu'il figure dans son BPU : 1.1, 2.3, A4…) :
  "bpu": [
    {"numero": "1.1", "designation": "Étude de faisabilité < 1 000 m²", "unite": "forfait", "jours": 12, "quantite": 2},
    {"numero": "1.2", "designation": "Réunion (préparation, animation, compte rendu)", "unite": "réunion", "jours": 0.6, "quantite": 12},
    {"numero": "3.1", "designation": "Frais de reprographie", "unite": "forfait", "prix": 150, "quantite": 1}   # prix imposé
  ]
Prix unitaire HT = jours × prix de journée (formule), sauf « prix » donné ; montant DQE = prix × quantité ;
total du DQE = montant de l'offre.
Le script écrit aussi, à côté du .xlsx, « BPU-<référence>.tsv » (n°, désignation, unité, prix unitaire,
quantité ; prix calculés) : déposé dans 04 Offre, l'app propose « Importer le BPU du skill ».
"""
import json
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ENCRE, ARDOISE, ROUILLE, BRUME, GRIS, FILET = '0B1220', '1B263B', 'B4460E', 'EEF1F6', '4A5568', 'D5DBE5'
SANS, MONO = 'IBM Plex Sans', 'IBM Plex Mono'
FILET_BAS = Border(bottom=Side(style='thin', color=FILET))
EUROS = '#,##0.00 "€"'
JOURS = '0.0# "j"'


def f(taille=10, gras=False, couleur=ENCRE, nom=SANS, italique=False):
    return Font(name=nom, size=taille, bold=gras, color=couleur, italic=italique)


def generer_bpu(d, sortie):
    """BPU / DQE d'un accord-cadre à bons de commande (voir l'en-tête du fichier)."""
    wb = Workbook()
    ws = wb.active
    ws.title = 'BPU-DQE'
    ws.sheet_view.showGridLines = False
    for col, w in {'A': 6, 'B': 52, 'C': 14, 'D': 16, 'E': 12, 'F': 18, 'G': 12}.items():
        ws.column_dimensions[col].width = w
    ws['A1'] = 'KARTES'; ws['A1'].font = f(14, True, ARDOISE)
    ws['B1'] = 'INGÉNIERIE'; ws['B1'].font = f(9, False, GRIS)
    ws['A2'] = 'BORDEREAU DES PRIX UNITAIRES ET DÉTAIL QUANTITATIF ESTIMATIF'; ws['A2'].font = f(9, True, ROUILLE)
    ws['A3'] = d.get('objet', '[Objet de la consultation]'); ws['A3'].font = f(14, True, ARDOISE)
    ws['A4'] = d.get('acheteur', '[Acheteur]'); ws['A4'].font = f(10, False, GRIS)
    ws['A5'] = 'Réf. %s · Indice %s · %s' % (d.get('reference', '[KI-AAAA-NNN]'), d.get('indice', 'A'), d.get('date', '[date]'))
    ws['A5'].font = f(9, False, GRIS, MONO)
    ws['F7'] = d.get('prix_jour', 400); ws['F7'].font = f(10, True, ROUILLE, MONO); ws['F7'].number_format = EUROS
    ws['F7'].fill = PatternFill('solid', fgColor=BRUME)
    ws.merge_cells('C7:E7'); ws['C7'] = 'Prix de journée HT (modifiable)'; ws['C7'].font = f(9, True, ARDOISE); ws['C7'].alignment = Alignment(horizontal='right')
    ent = ['N°', 'Désignation', 'Unité', 'Prix unitaire HT', 'Qté DQE', 'Montant DQE HT', 'Jours / unité']
    r = 9
    for j, e in enumerate(ent, 1):
        c = ws.cell(r, j, e); c.font = f(9, True, ARDOISE); c.fill = PatternFill('solid', fgColor=BRUME)
        c.alignment = Alignment(horizontal='right' if j >= 4 else 'left', vertical='center'); c.border = FILET_BAS
    debut = r + 1
    lignes = d.get('bpu') or [{'designation': '[Prestation du BPU]', 'unite': '[unité]', 'jours': 1, 'quantite': 1}]
    for i, l in enumerate(lignes, 1):
        r += 1
        ws.cell(r, 1, str(l.get('numero') or i)).font = f(10, False, ARDOISE, MONO)
        ws.cell(r, 2, l.get('designation', '')).font = f(10)
        ws.cell(r, 2).alignment = Alignment(wrap_text=True, vertical='top')
        ws.cell(r, 3, l.get('unite', '')).font = f(10)
        if l.get('prix') is not None:
            c = ws.cell(r, 4, l['prix'])
        else:
            ws.cell(r, 7, l.get('jours', 0)).number_format = JOURS
            ws.cell(r, 7).font = f(9, False, GRIS, MONO)
            c = ws.cell(r, 4, '=G%d*$F$7' % r)
        c.number_format = EUROS; c.font = f(10, False, ARDOISE, MONO)
        ws.cell(r, 5, l.get('quantite', 0)).font = f(10, False, ARDOISE, MONO)
        c = ws.cell(r, 6, '=D%d*E%d' % (r, r)); c.number_format = EUROS; c.font = f(10, False, ARDOISE, MONO)
        for j in range(1, 8):
            ws.cell(r, j).border = FILET_BAS
            if j >= 4:
                ws.cell(r, j).alignment = Alignment(horizontal='right', vertical='top')
    fin = r
    r += 1
    ws.cell(r, 2, 'Montant du DQE (montant de l\'offre)').font = f(10, True, ARDOISE)
    c = ws.cell(r, 6, '=SUM(F%d:F%d)' % (debut, fin)); c.number_format = EUROS; c.font = f(11, True, ARDOISE, MONO)
    for j in range(1, 8):
        ws.cell(r, j).border = Border(top=Side(style='medium', color=ARDOISE))
    total = r
    r += 2
    for libelle, formule in (('Total HT', '=F%d' % total), ('TVA', 'TVA non applicable, art. 293 B du CGI'), ('Total TTC', '=F%d' % total)):
        ws.cell(r, 5, libelle).font = f(10, True, ARDOISE)
        ws.cell(r, 5).alignment = Alignment(horizontal='right')
        c = ws.cell(r, 6, formule)
        if formule.startswith('='):
            c.number_format = EUROS; c.font = f(11, True, ARDOISE, MONO)
        else:
            c.font = f(9, False, GRIS, italique=True)
        c.alignment = Alignment(horizontal='right')
        r += 1
    r += 1
    ws.cell(r, 1, 'À reporter dans l\'app Kartes Affaires : Offre › Type de marché « Accord-cadre à bons de commande », puis « Importer le BPU du skill » (fichier BPU-….tsv déposé dans 04 Offre), ou copier les colonnes A à E dans « Coller depuis le BPU ».').font = f(9, False, GRIS, italique=True)
    r += 1
    ws.cell(r, 1, 'Kartes Ingénierie — Sébastien De Raedt EI · SIRET 493 567 796 00021 · TVA non applicable, art. 293 B du CGI').font = f(8, False, GRIS, MONO)
    ws.page_setup.orientation = 'landscape'
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.oddFooter.left.text = 'Réf. %s · Indice %s' % (d.get('reference', '[KI-AAAA-NNN]'), d.get('indice', 'A'))
    ws.oddFooter.right.text = 'page &P / &N'
    ws.freeze_panes = 'A10'
    wb.save(sortie)
    # Fichier texte pour l'import dans l'app (prix calculés, n° de l'acheteur conservés)
    import os
    pj = float(d.get('prix_jour', 400))
    tsv = os.path.join(os.path.dirname(os.path.abspath(sortie)), 'BPU-%s.tsv' % d.get('reference', 'affaire'))
    with open(tsv, 'w', encoding='utf-8') as fh:
        for i, l in enumerate(lignes, 1):
            prix = l['prix'] if l.get('prix') is not None else round(float(l.get('jours', 0)) * pj, 2)
            vals = [str(l.get('numero') or i), str(l.get('designation', '')), str(l.get('unite', '')),
                    ('%.2f' % float(prix)).replace('.', ','), str(l.get('quantite', 0)).replace('.', ',')]
            fh.write('\t'.join(v.replace('\t', ' ').replace('\n', ' ') for v in vals) + '\n')
    print('BPU pour l\'app : ' + tsv)
    return sortie


def generer(d, sortie):
    if d.get('bpu'):
        return generer_bpu(d, sortie)
    wb = Workbook()
    ws = wb.active
    ws.title = 'Chiffrage'
    ws.sheet_view.showGridLines = False
    largeurs = {'A': 10, 'B': 30, 'C': 42, 'D': 30, 'E': 10, 'F': 16}
    for col, w in largeurs.items():
        ws.column_dimensions[col].width = w

    ws['A1'] = 'KARTES'; ws['A1'].font = f(14, True, ARDOISE)
    ws['B1'] = 'INGÉNIERIE'; ws['B1'].font = f(9, False, GRIS)
    ws['A2'] = 'CHIFFRAGE DE L\'OFFRE'; ws['A2'].font = f(9, True, ROUILLE)
    ws['A3'] = d.get('objet', '[Objet de la consultation]'); ws['A3'].font = f(14, True, ARDOISE)
    ws['A4'] = d.get('acheteur', '[Acheteur]'); ws['A4'].font = f(10, False, GRIS)
    ws['A5'] = 'Réf. %s · Indice %s · %s' % (d.get('reference', '[KI-AAAA-NNN]'), d.get('indice', 'A'), d.get('date', '[date]'))
    ws['A5'].font = f(9, False, GRIS, MONO)

    ws['F7'] = d.get('prix_jour', 400); ws['F7'].font = f(10, True, ROUILLE, MONO); ws['F7'].number_format = EUROS
    ws['F7'].fill = PatternFill('solid', fgColor=BRUME)
    ws.merge_cells('C7:E7'); ws['C7'] = 'Prix de journée HT (modifiable)'; ws['C7'].font = f(9, True, ARDOISE); ws['C7'].alignment = Alignment(horizontal='right')

    ent = ['Tranche', 'Intitulé de la tranche', 'Tâche', 'Livrable', 'Jours', 'Montant HT']
    r = 9
    for j, e in enumerate(ent, 1):
        c = ws.cell(r, j, e); c.font = f(9, True, ARDOISE); c.fill = PatternFill('solid', fgColor=BRUME)
        c.alignment = Alignment(horizontal='right' if j >= 5 else 'left', vertical='center'); c.border = FILET_BAS
    debut = r + 1
    taches = d.get('taches') or [{'tranche': '[TF]', 'intitule_tranche': '[Intitulé]', 'tache': '[Tâche]', 'livrable': '[Livrable]', 'jours': 0}]
    for t in taches:
        r += 1
        vals = [t.get('tranche', ''), t.get('intitule_tranche', ''), t.get('tache', ''), t.get('livrable', ''), t.get('jours', 0)]
        for j, v in enumerate(vals, 1):
            c = ws.cell(r, j, v); c.border = FILET_BAS
            c.font = f(10, False, ARDOISE, MONO) if j in (1, 5) else f(10)
            c.alignment = Alignment(wrap_text=True, vertical='top', horizontal='right' if j == 5 else 'left')
        ws.cell(r, 5).number_format = JOURS
        c = ws.cell(r, 6, '=E%d*$F$7' % r); c.number_format = EUROS; c.font = f(10, False, ARDOISE, MONO); c.border = FILET_BAS
        c.alignment = Alignment(horizontal='right', vertical='top')
    fin = r
    r += 1
    ws.cell(r, 3, 'Total').font = f(10, True, ARDOISE)
    c = ws.cell(r, 5, '=SUM(E%d:E%d)' % (debut, fin)); c.number_format = JOURS; c.font = f(10, True, ARDOISE, MONO)
    c = ws.cell(r, 6, '=SUM(F%d:F%d)' % (debut, fin)); c.number_format = EUROS; c.font = f(10, True, ARDOISE, MONO)
    for j in range(1, 7):
        ws.cell(r, j).border = Border(top=Side(style='medium', color=ARDOISE))
    ligne_total = r

    # Synthèse par tranche
    r += 3
    ws.cell(r, 1, 'SYNTHÈSE PAR TRANCHE').font = f(9, True, ROUILLE)
    r += 1
    for j, e in ((1, 'Tranche'), (2, 'Intitulé'), (5, 'Jours'), (6, 'Montant HT')):
        c = ws.cell(r, j, e); c.font = f(9, True, ARDOISE); c.fill = PatternFill('solid', fgColor=BRUME)
        c.alignment = Alignment(horizontal='right' if j >= 5 else 'left')
    for j in (3, 4):
        ws.cell(r, j).fill = PatternFill('solid', fgColor=BRUME)
    vues = []
    for t in taches:
        if t.get('tranche') not in [v[0] for v in vues]:
            vues.append((t.get('tranche'), t.get('intitule_tranche', '')))
    for code, intitule in vues:
        r += 1
        ws.cell(r, 1, code).font = f(10, False, ARDOISE, MONO)
        ws.cell(r, 2, intitule).font = f(10)
        c = ws.cell(r, 5, '=SUMIF($A$%d:$A$%d,A%d,$E$%d:$E$%d)' % (debut, fin, r, debut, fin)); c.number_format = JOURS; c.font = f(10, False, ARDOISE, MONO)
        c = ws.cell(r, 6, '=SUMIF($A$%d:$A$%d,A%d,$F$%d:$F$%d)' % (debut, fin, r, debut, fin)); c.number_format = EUROS; c.font = f(10, False, ARDOISE, MONO)
        for j in range(1, 7):
            ws.cell(r, j).border = FILET_BAS
    r += 2
    for libelle, formule in (('Total HT', '=F%d' % ligne_total), ('TVA', 'TVA non applicable, art. 293 B du CGI'), ('Total TTC', '=F%d' % ligne_total)):
        ws.cell(r, 4, libelle).font = f(10, True, ARDOISE)
        ws.cell(r, 4).alignment = Alignment(horizontal='right')
        c = ws.cell(r, 6, formule)
        if formule.startswith('='):
            c.number_format = EUROS; c.font = f(11, True, ARDOISE, MONO)
        else:
            c.font = f(9, False, GRIS, italique=True)
        c.alignment = Alignment(horizontal='right')
        r += 1
    r += 1
    ws.cell(r, 1, 'À reporter dans l\'app Kartes Affaires, onglet Offre : tranches, jours par tranche, prix par jour, montant HT.').font = f(9, False, GRIS, italique=True)
    r += 1
    ws.cell(r, 1, 'Kartes Ingénierie — Sébastien De Raedt EI · SIRET 493 567 796 00021 · TVA non applicable, art. 293 B du CGI').font = f(8, False, GRIS, MONO)

    ws.print_title_rows = '9:9'
    ws.page_setup.orientation = 'landscape'
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.oddFooter.left.text = 'Réf. %s · Indice %s' % (d.get('reference', '[KI-AAAA-NNN]'), d.get('indice', 'A'))
    ws.oddFooter.right.text = 'page &P / &N'
    ws.freeze_panes = 'A10'
    wb.save(sortie)
    return sortie


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__); sys.exit(1)
    with open(sys.argv[1], encoding='utf-8') as fh:
        generer(json.load(fh), sys.argv[2])
    print('Chiffrage créé : ' + sys.argv[2])
