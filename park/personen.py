"""Valideer profielen voordat ze op de kopieerpagina worden gepubliceerd."""
import re


def valideer_personen(data):
    if not isinstance(data, dict) or not isinstance(data.get('personen'), list):
        raise ValueError('Personenbestand moet een personenlijst bevatten.')
    gezien, resultaat = set(), []
    for persoon in data['personen']:
        if not isinstance(persoon, dict):
            raise ValueError('Ongeldig persoonsprofiel.')
        ident = persoon.get('id', '')
        if not isinstance(ident, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{8,80}', ident) or ident in gezien:
            raise ValueError('Elk persoon moet een uniek, geldig id hebben.')
        gezien.add(ident)
        profiel = {'id': ident}
        for veld, limiet, verplicht in [('naam', 100, True), ('functie', 140, True), ('telefoon', 40, False)]:
            waarde = persoon.get(veld, '')
            if not isinstance(waarde, str) or len(waarde) > limiet or (verplicht and not waarde.strip()):
                raise ValueError(f'Ongeldige {veld} voor persoon {ident}.')
            if any(ord(c) < 32 for c in waarde):
                raise ValueError(f'{veld} mag geen besturingstekens bevatten.')
            profiel[veld] = waarde.strip()
        if profiel['telefoon'] and not re.fullmatch(r'[+0-9 ()/.-]+', profiel['telefoon']):
            raise ValueError('Gebruik een geldig telefoonnummer.')
        resultaat.append(profiel)
    return {'personen': resultaat}
