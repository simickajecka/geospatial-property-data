/*
 * citaj.js — sirove transakcije iz CSV-a, i njihovo smestanje u celije mreze.
 *
 * Deli ga prebroj.js (koji ih broji) i pretvori.js (koji ih sazima u cene po
 * celiji i mesecu). Drzi se na jednom mestu namerno: ova dva posla moraju da
 * vide ISTU tacku u ISTOJ celiji, inace izvestaj o retkosti opisuje jedan
 * skup a prikaz crta drugi.
 *
 * Zato i `prebroj.js --proveri` pokriva oba: proverava trazioca odavde.
 */

// ---------------------------------------------------------------- CSV

/*
 * Razdvajac se ODREDJUJE iz zaglavlja, ne pogadja u hodu.
 *
 * Ovde je lako pogresiti: nasi izvodi su po pravilu tackazapeta-razdvojeni, a
 * decimale pisu zapetom (20,457100). Ako se deli i po zapeti i po tackazapeti,
 * svaka koordinata se raspadne na dva polja i ceo red se pomeri — a greska se
 * ne prijavi kao greska nego kao "nema datuma", jer datum tada padne u pogresnu
 * kolonu. Zato: prebroji kandidate u zaglavlju i uzmi samo jednog.
 */
function nadjiRazdvajac(zaglavlje) {
  const kandidati = [';', '\t', ','];
  let najbolji = ',', najvise = 0;
  for (const c of kandidati) {
    const n = zaglavlje.split(c).length - 1;
    if (n > najvise) { najvise = n; najbolji = c; }
  }
  return najbolji;
}

/* Deli red na polja postujuci navodnike — adresa sme da sadrzi razdvajac.
   Nije pun CSV parser, ali pokriva navodnike i udvojene navodnike. */
function podeliRed(red, razdvajac) {
  const out = [];
  let polje = '', uNavodnicima = false;
  for (let i = 0; i < red.length; i++) {
    const c = red[i];
    if (uNavodnicima) {
      if (c === '"') {
        if (red[i + 1] === '"') { polje += '"'; i++; }
        else uNavodnicima = false;
      } else polje += c;
    } else if (c === '"') uNavodnicima = true;
    else if (c === razdvajac) { out.push(polje); polje = ''; }
    else polje += c;
  }
  out.push(polje);
  return out.map(s => s.trim());
}

/* Broj iz polja: prihvata i 1234.5 i 1234,5, i razmake kao razdelnik hiljada. */
function broj(polje) {
  if (polje === undefined || polje === null) return NaN;
  let s = String(polje).trim().replace(/\s/g, '');
  if (!s) return NaN;
  /* Ako ima i tacku i zapetu, poslednja je decimalna. */
  const zadnjaTacka = s.lastIndexOf('.'), zadnjaZapeta = s.lastIndexOf(',');
  if (zadnjaTacka > -1 && zadnjaZapeta > -1) {
    s = zadnjaZapeta > zadnjaTacka
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (zadnjaZapeta > -1) {
    s = s.replace(',', '.');
  }
  return parseFloat(s);
}

const SINONIMI = {
  lon:      ['lon', 'longitude', 'lng', 'x', 'e', 'gk_e', 'duzina', 'geo_duzina'],
  lat:      ['lat', 'latitude', 'y', 'n', 'gk_n', 'sirina', 'geo_sirina'],
  datum:    ['datum', 'date', 'datum_prometa', 'mesec', 'month', 'datum_ugovora'],
  cena:     ['cena', 'price', 'cena_eur_m2', 'cena_po_m2', 'jedinicna_cena'],
  ukupno:   ['ukupna_cena', 'ugovorena_cena', 'iznos', 'vrednost', 'total'],
  povrsina: ['povrsina', 'kvadratura', 'p_m2', 'area', 'povrsina_m2']
};

function nadjiKolonu(zaglavlje, ime, zadato) {
  if (zadato) {
    const i = zaglavlje.indexOf(zadato);
    if (i < 0) throw new Error('Nema kolone "' + zadato + '". Ima: ' + zaglavlje.join(', '));
    return i;
  }
  for (const kandidat of (SINONIMI[ime] || [])) {
    const i = zaglavlje.findIndex(h => h.toLowerCase() === kandidat);
    if (i > -1) return i;
  }
  return -1;
}

/* Datum -> "YYYY-MM", ili null ako se ne prepozna. */
function uMesec(s) {
  s = String(s).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})/)))             return m[1] + '-' + String(+m[2]).padStart(2, '0');
  if ((m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/)))
                                                       return m[3] + '-' + String(+m[2]).padStart(2, '0');
  if ((m = s.match(/^(\d{4})(\d{2})/)))                return m[1] + '-' + m[2];
  return null;
}

/*
 * Cita transakcije. Opcije (sve neobavezne):
 *
 *   kolone   {lon, lat, datum, cena, ukupno, povrsina}  — rucno imenovanje
 *   kurs     delilac cene (npr. 117.5 da se iz RSD dobiju evri)
 *   samo     "kolona=vrednost" — zadrzava samo redove koji se poklapaju
 *   trebaCena  true ako cena mora da postoji (pretvori.js), false (prebroj.js)
 *
 * Cena po m2 se uzima iz jedne kolone, ili se racuna iz ukupne cene i povrsine.
 * Ako se moze i jedno i drugo, prednost ima kolona koja je vec po m2.
 */
function ucitajTransakcije(fs, put, opcije) {
  const o = opcije || {};
  const kolone = o.kolone || {};
  const tekst = fs.readFileSync(put, 'utf8');
  const redovi = tekst.split(/\r?\n/).filter(r => r.trim());
  if (redovi.length < 2) throw new Error('CSV je prazan ili ima samo zaglavlje: ' + put);

  const razdvajac = nadjiRazdvajac(redovi[0]);
  const zaglavlje = podeliRed(redovi[0], razdvajac);

  const iLon = nadjiKolonu(zaglavlje, 'lon', kolone.lon);
  const iLat = nadjiKolonu(zaglavlje, 'lat', kolone.lat);
  const iDat = nadjiKolonu(zaglavlje, 'datum', kolone.datum);
  const iCen = nadjiKolonu(zaglavlje, 'cena', kolone.cena);
  const iUku = nadjiKolonu(zaglavlje, 'ukupno', kolone.ukupno);
  const iPov = nadjiKolonu(zaglavlje, 'povrsina', kolone.povrsina);

  for (const [ime, i] of [['lon', iLon], ['lat', iLat], ['datum', iDat]]) {
    if (i < 0) {
      throw new Error('Ne nalazim kolonu za "' + ime + '". Zadajte je sa --' + ime +
        '.\nZaglavlje: ' + zaglavlje.join(', '));
    }
  }
  const imaCenu = iCen > -1 || (iUku > -1 && iPov > -1);
  if (o.trebaCena && !imaCenu) {
    throw new Error('Nema cene. Zadajte --cena <kolona po m2>, ili --ukupno i --povrsina.' +
      '\nZaglavlje: ' + zaglavlje.join(', '));
  }

  /* Filter tipa "VRSTA=stan" — stvarni izvod nosi i garaze i placeve. */
  let iFilter = -1, vrednostFiltera = null;
  if (o.samo) {
    const znak = String(o.samo).indexOf('=');
    if (znak < 0) throw new Error('--samo ocekuje oblik kolona=vrednost');
    const imeK = o.samo.slice(0, znak).trim();
    vrednostFiltera = o.samo.slice(znak + 1).trim().toLowerCase();
    iFilter = zaglavlje.findIndex(h => h.toLowerCase() === imeK.toLowerCase());
    if (iFilter < 0) throw new Error('--samo: nema kolone "' + imeK + '"');
  }

  const kurs = Number.isFinite(o.kurs) && o.kurs > 0 ? o.kurs : 1;
  const out = [];
  const lose = { koordinata: 0, datum: 0, cena: 0, filter: 0 };

  for (let r = 1; r < redovi.length; r++) {
    const c = podeliRed(redovi[r], razdvajac);

    if (iFilter > -1 && String(c[iFilter] || '').trim().toLowerCase() !== vrednostFiltera) {
      lose.filter++; continue;
    }
    const lon = broj(c[iLon]), lat = broj(c[iLat]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) { lose.koordinata++; continue; }
    const mesec = uMesec(c[iDat]);
    if (!mesec) { lose.datum++; continue; }

    let cena = NaN;
    if (iCen > -1) cena = broj(c[iCen]);
    if (!Number.isFinite(cena) && iUku > -1 && iPov > -1) {
      const u = broj(c[iUku]), p = broj(c[iPov]);
      if (Number.isFinite(u) && Number.isFinite(p) && p > 0) cena = u / p;
    }
    if (Number.isFinite(cena) && kurs !== 1) cena /= kurs;
    if (o.trebaCena && !(Number.isFinite(cena) && cena > 0)) { lose.cena++; continue; }

    out.push({ lon, lat, mesec, cena: Number.isFinite(cena) && cena > 0 ? cena : null });
  }

  return {
    transakcije: out, lose, zaglavlje, razdvajac,
    opis: {
      razdvajac: { ';': 'tackazapeta', '\t': 'tabulator', ',': 'zapeta' }[razdvajac],
      lon: zaglavlje[iLon], lat: zaglavlje[iLat], datum: zaglavlje[iDat],
      cena: iCen > -1 ? zaglavlje[iCen]
            : (iUku > -1 && iPov > -1 ? zaglavlje[iUku] + ' / ' + zaglavlje[iPov] : null),
      kurs: kurs !== 1 ? kurs : null,
      samo: o.samo || null
    }
  };
}

// ---------------------------------------------------------------- resetka

/*
 * Mera rastojanja, zajednicka i brzom putu i gruboj sili.
 *
 * Mora da bude JEDNA: "najbliza celija" nema smisla ako dva puta racunaju
 * rastojanje malo drugacije. Prva verzija je u brzom putu skalirala duzinu
 * po paraleli VRSTE a u gruboj sili po paraleli TACKE; razlika je bila oko
 * metra, ali na tacki tacno izmedju dve celije to je obaralo odluku na
 * suprotnu stranu i provera je prijavljivala neslaganje.
 */
function napraviMeru(mreza, kmPoStepenuLat, C) {
  return function (tLon, tLat, k) {
    const cos = Math.cos(tLat * Math.PI / 180);
    const dx = (tLon - mreza.lon[k]) * C * cos;
    const dy = (tLat - mreza.lat[k]) * kmPoStepenuLat;
    return dx * dx + dy * dy;
  };
}

/* Geometrija se cita iz mreze, ne prepisuje iz generatora — ako se formula
   tamo promeni, ovo je prati samo od sebe. */
function geometrija(mreza) {
  const { minLon, minLat, lon, lat, gx, gy, n } = mreza;
  if (!n) throw new Error('Prazna mreza');
  const dLat = (lat[0] - minLat) / (gy[0] + 0.5);
  const kmPoStepenuLat = (1.5 * mreza.poluprecnikKm) / dLat;
  const dxKm = Math.sqrt(3) * mreza.poluprecnikKm;
  const pomak0 = (gy[0] & 1) ? 0.5 : 0;
  const dLon0 = (lon[0] - minLon) / (gx[0] + 0.5 + pomak0);
  const C = dxKm / (dLon0 * Math.cos(lat[0] * Math.PI / 180));
  return { dLat, kmPoStepenuLat, dxKm, C };
}

/*
 * Trazi celiju za datu tacku, bez prolaska kroz svih n celija.
 * Vraca indeks celije ili -1 ako tacka nije ni u jednoj (najcesce: van granice).
 */
function napraviTrazioca(mreza) {
  const { minLon, minLat, gx, gy, n } = mreza;
  const { dLat, kmPoStepenuLat, dxKm, C } = geometrija(mreza);
  const rastojanje = napraviMeru(mreza, kmPoStepenuLat, C);

  const dLonZaVrstu = (j) => {
    const la = minLat + (j + 0.5) * dLat;
    return dxKm / (C * Math.cos(la * Math.PI / 180));
  };

  const karta = new Map();
  const KLJUC = (i, j) => j * 100000 + i;
  for (let k = 0; k < n; k++) karta.set(KLJUC(gx[k], gy[k]), k);

  return function (tLon, tLat) {
    const jSredina = (tLat - minLat) / dLat - 0.5;
    let najbolji = -1, najblize = Infinity;
    /* Sestougaona resetka: najblize srediste moze biti u susednoj vrsti. */
    for (let j = Math.floor(jSredina) - 1; j <= Math.floor(jSredina) + 2; j++) {
      if (j < 0) continue;
      const dLon = dLonZaVrstu(j);
      const pomak = (j & 1) ? 0.5 : 0;
      const iSredina = (tLon - minLon) / dLon - 0.5 - pomak;
      for (let i = Math.floor(iSredina) - 1; i <= Math.floor(iSredina) + 2; i++) {
        if (i < 0) continue;
        const k = karta.get(KLJUC(i, j));
        if (k === undefined) continue;
        const d = rastojanje(tLon, tLat, k);
        if (d < najblize) { najblize = d; najbolji = k; }
      }
    }
    if (najbolji < 0) return -1;
    return najblize <= mreza.poluprecnikKm * mreza.poluprecnikKm ? najbolji : -1;
  };
}

module.exports = {
  nadjiRazdvajac, podeliRed, broj, nadjiKolonu, uMesec, SINONIMI,
  ucitajTransakcije, napraviMeru, geometrija, napraviTrazioca
};
