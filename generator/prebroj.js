/*
 * prebroj.js — koliko je stvarni izvod redak, po celiji i po mesecu.
 *
 *   node prebroj.js --ulaz transakcije.csv
 *   node prebroj.js --ulaz transakcije.csv --korak 3,1.5,0.5 --prozor 1,3,6,12
 *   node prebroj.js --primer --godisnje 120000        (sinteticki uzorak, za probu)
 *
 * ==================================================================
 * ZASTO OVAJ SKRIPT POSTOJI
 * ==================================================================
 * Generator pravi POTPUNU tablu: svaka celija ima cenu u svakom mesecu.
 * Stvarni promet nema to svojstvo ni priblizno. Transakcija je dogadjaj -
 * u jednoj celiji, u jednom mesecu, moze ih biti nula, a najcesce i jeste.
 *
 * Da bi mreza od 1,5 km imala bar jednu transakciju po celiji mesecno,
 * trebalo bi oko 472.000 prometa godisnje (39.303 celije x 12). Na 3 km
 * je granica oko 118.000. Stvarni godisnji broj je poznat RGZ-u; ovaj
 * skript kaze sta iz njega sledi.
 *
 * Gustina mreze se zato NE bira unapred nego se izmeri. Skript za svaki
 * ponudjeni korak ispisuje koliko se table zaista popuni, sa pomeranjem
 * prozora (1, 3, 6, 12 meseci) i bez njega.
 *
 * ==================================================================
 * STA SKRIPT NE RADI
 * ==================================================================
 * Ne racuna nikakav indeks i ne poredi cene kroz vreme. Dve transakcije
 * u istoj celiji u dva meseca NISU ista nepokretnost - razlikuju se po
 * povrsini, spratu, starosti i stanju. Razlika izmedju ta dva broja meri
 * i kretanje cene i promenu strukture onoga sto se prodalo, a razdvojiti
 * ih trazi hedonisticki model ili indeks ponovljene prodaje. Ovde se samo
 * BROJI, jer je to prvo pitanje: ima li uopste dovoljno podataka.
 *
 * ==================================================================
 * ULAZ
 * ==================================================================
 * CSV sa jednim redom po transakciji. Nazivi kolona se pogadjaju, a mogu
 * se i zadati:
 *
 *   --lon lon        geografska duzina   (ili: longitude, x, e, gk_e)
 *   --lat lat        geografska sirina   (ili: latitude, y, n, gk_n)
 *   --datum datum    datum prometa       (ili: date, datum_prometa, mesec)
 *   --cena cena      cena po m2          (neobavezno; bez nje idu samo brojevi)
 *
 * Datum se prima kao 2024-06-15, 2024-06, 15.06.2024. ili 15/06/2024.
 * Uzima se samo godina i mesec.
 */

const fs = require('fs');
const path = require('path');
const G = require('./generator.js');

// ---------------------------------------------------------------- argumenti

const arg = (ime, podr) => {
  const i = process.argv.indexOf('--' + ime);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : podr;
};
const ima = (ime) => process.argv.indexOf('--' + ime) > -1;

const brojevi = (s) => String(s).split(',').map(x => parseFloat(x.trim())).filter(Number.isFinite);

const KORACI = brojevi(arg('korak', '3,1.5'));
const PROZORI = brojevi(arg('prozor', '1,3,6,12')).map(Math.round);

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

/* Deli red na polja postujuci navodnike - adresa sme da sadrzi razdvajac.
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
  lon: ['lon', 'longitude', 'lng', 'x', 'e', 'gk_e', 'duzina', 'geo_duzina'],
  lat: ['lat', 'latitude', 'y', 'n', 'gk_n', 'sirina', 'geo_sirina'],
  datum: ['datum', 'date', 'datum_prometa', 'mesec', 'month', 'datum_ugovora'],
  cena: ['cena', 'price', 'cena_eur_m2', 'cena_po_m2', 'jedinicna_cena']
};

function nadjiKolonu(zaglavlje, ime, zadato) {
  if (zadato) {
    const i = zaglavlje.indexOf(zadato);
    if (i < 0) throw new Error('Nema kolone "' + zadato + '". Ima: ' + zaglavlje.join(', '));
    return i;
  }
  for (const kandidat of SINONIMI[ime]) {
    const i = zaglavlje.findIndex(h => h.toLowerCase() === kandidat);
    if (i > -1) return i;
  }
  return -1;
}

/* Datum -> "YYYY-MM", ili null ako se ne prepozna. */
function uMesec(s) {
  s = String(s).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})/)))            return m[1] + '-' + String(+m[2]).padStart(2, '0');
  if ((m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/)))
                                                      return m[3] + '-' + String(+m[2]).padStart(2, '0');
  if ((m = s.match(/^(\d{4})(\d{2})/)))               return m[1] + '-' + m[2];
  return null;
}

function ucitaj(put) {
  const tekst = fs.readFileSync(put, 'utf8');
  const redovi = tekst.split(/\r?\n/).filter(r => r.trim());
  if (redovi.length < 2) throw new Error('CSV je prazan ili ima samo zaglavlje: ' + put);

  const razdvajac = nadjiRazdvajac(redovi[0]);
  const zaglavlje = podeliRed(redovi[0], razdvajac);
  const imeRazdvajaca = { ';': 'tackazapeta', '\t': 'tabulator', ',': 'zapeta' }[razdvajac];
  console.log('Razdvajac: ' + imeRazdvajaca + '   kolona: ' + zaglavlje.length);
  const iLon = nadjiKolonu(zaglavlje, 'lon', arg('lon', null));
  const iLat = nadjiKolonu(zaglavlje, 'lat', arg('lat', null));
  const iDat = nadjiKolonu(zaglavlje, 'datum', arg('datum', null));
  const iCen = nadjiKolonu(zaglavlje, 'cena', arg('cena', null));

  for (const [ime, i] of [['lon', iLon], ['lat', iLat], ['datum', iDat]]) {
    if (i < 0) throw new Error('Ne nalazim kolonu za "' + ime + '". Zadajte je sa --' + ime +
      '. Zaglavlje: ' + zaglavlje.join(', '));
  }
  console.log('Kolone: lon=' + zaglavlje[iLon] + '  lat=' + zaglavlje[iLat] +
    '  datum=' + zaglavlje[iDat] + (iCen > -1 ? '  cena=' + zaglavlje[iCen] : '  (bez cene)'));

  const out = [];
  const lose = { koordinata: 0, datum: 0 };
  for (let r = 1; r < redovi.length; r++) {
    const c = podeliRed(redovi[r], razdvajac);
    const lon = broj(c[iLon]);
    const lat = broj(c[iLat]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) { lose.koordinata++; continue; }
    const mesec = uMesec(c[iDat]);
    if (!mesec) { lose.datum++; continue; }
    const cena = iCen > -1 ? broj(c[iCen]) : NaN;
    out.push({ lon, lat, mesec, cena: Number.isFinite(cena) ? cena : null });
  }
  return { transakcije: out, lose };
}

// ---------------------------------------------------------------- resetka

/*
 * Trazi celiju za datu tacku, bez prolaska kroz svih n celija.
 *
 * Geometrija se ne prepisuje iz generatora nego se CITA iz same mreze koju
 * je on napravio: iz (gx, gy, lon, lat) se vrate korak po sirini, korak po
 * duzini za svaku paralelu i pomak neparnih vrsta. Ako se formula u
 * generatoru promeni, ovo je prati samo od sebe.
 */
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

/* Geometrija se cita iz mreze, ne prepisuje iz generatora. */
function geometrija(mreza) {
  const { minLon, minLat, lon, lat, gx, gy, n } = mreza;
  if (!n) throw new Error('Prazna mreza');
  /* korak po sirini: lat = minLat + (j + 0.5) * dLat */
  const dLat = (lat[0] - minLat) / (gy[0] + 0.5);
  /* km po stepenu sirine, izvedeno iz odnosa koraka vrste i R */
  const kmPoStepenuLat = (1.5 * mreza.poluprecnikKm) / dLat;
  /* km po stepenu duzine na ekvatoru:  dLon = dxKm/(C*cos(lat)) => C = ... */
  const dxKm = Math.sqrt(3) * mreza.poluprecnikKm;
  const pomak0 = (gy[0] & 1) ? 0.5 : 0;
  const dLon0 = (lon[0] - minLon) / (gx[0] + 0.5 + pomak0);
  const C = dxKm / (dLon0 * Math.cos(lat[0] * Math.PI / 180));
  return { dLat, kmPoStepenuLat, dxKm, C };
}

function napraviTrazioca(mreza) {
  const { minLon, minLat, gx, gy, n } = mreza;
  const { dLat, kmPoStepenuLat, dxKm, C } = geometrija(mreza);
  const rastojanje = napraviMeru(mreza, kmPoStepenuLat, C);

  const dLonZaVrstu = (j) => {
    const la = minLat + (j + 0.5) * dLat;
    return dxKm / (C * Math.cos(la * Math.PI / 180));
  };

  /* (vrsta, kolona) -> indeks celije */
  const karta = new Map();
  const KLJUC = (i, j) => j * 100000 + i;
  for (let k = 0; k < n; k++) karta.set(KLJUC(gx[k], gy[k]), k);

  return function (tLon, tLat) {
    const jSredina = (tLat - minLat) / dLat - 0.5;
    let najbolji = -1, najblize = Infinity;
    /* Sestougaona resetka: najblize srediste moze biti u susednoj vrsti,
       pa se gleda po jedna vrsta gore i dole, i po jedna kolona levo/desno. */
    for (let j = Math.floor(jSredina) - 1; j <= Math.floor(jSredina) + 2; j++) {
      if (j < 0) continue;
      const la = minLat + (j + 0.5) * dLat;
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
    /* Ako je najblize srediste dalje od poluprecnika opisanog kruga, tacka
       nije ni u jednoj celiji — najcesce znaci da je van granice. */
    if (najbolji < 0) return -1;
    return najblize <= mreza.poluprecnikKm * mreza.poluprecnikKm ? najbolji : -1;
  };
}

// ---------------------------------------------------------------- analiza

const sr = (x) => Number(x).toLocaleString('sr-RS');
const pct = (a, b) => b ? (100 * a / b).toFixed(1).replace('.', ',') + ' %' : '—';

function analiziraj(korakKm, transakcije, meseci) {
  const mreza = G.napraviMrezu(korakKm);
  const n = mreza.n, M = meseci.length;
  const indeksMeseca = new Map(meseci.map((m, i) => [m, i]));
  const trazi = napraviTrazioca(mreza);

  /* Broj transakcija po celiji i mesecu, samo za celije koje ih uopste imaju. */
  const poCeliji = new Map();
  let unutra = 0, van = 0, vanPerioda = 0;

  for (const t of transakcije) {
    const mi = indeksMeseca.get(t.mesec);
    if (mi === undefined) { vanPerioda++; continue; }
    const k = trazi(t.lon, t.lat);
    if (k < 0) { van++; continue; }
    let niz = poCeliji.get(k);
    if (!niz) { niz = new Uint16Array(M); poCeliji.set(k, niz); }
    if (niz[mi] < 65535) niz[mi]++;
    unutra++;
  }

  /* Popunjenost table, sa pomeranjem prozora. */
  const popunjenost = PROZORI.map(w => {
    let popunjenih = 0;
    for (const niz of poCeliji.values()) {
      let uProzoru = 0;
      for (let t = 0; t < M; t++) {
        uProzoru += niz[t];
        if (t >= w) uProzoru -= niz[t - w];
        if (uProzoru > 0) popunjenih++;
      }
    }
    return { w, popunjenih, odSvih: popunjenih / (n * M), odAktivnih: popunjenih / (poCeliji.size * M || 1) };
  });

  /* Koncentracija: koliki deo prometa padne na najprometnije celije. */
  const poCelijiUkupno = [...poCeliji.values()].map(niz => {
    let s = 0; for (let i = 0; i < M; i++) s += niz[i]; return s;
  }).sort((a, b) => b - a);
  const udeoNajvecih = (deo) => {
    const koliko = Math.max(1, Math.round(n * deo));
    let s = 0;
    for (let i = 0; i < Math.min(koliko, poCelijiUkupno.length); i++) s += poCelijiUkupno[i];
    return unutra ? s / unutra : 0;
  };

  /* Raspodela broja transakcija po nepraznom celija-mesecu. */
  const raspodela = { 1: 0, 2: 0, '3-5': 0, '6-10': 0, '>10': 0 };
  for (const niz of poCeliji.values()) {
    for (let t = 0; t < M; t++) {
      const c = niz[t];
      if (!c) continue;
      if (c === 1) raspodela['1']++;
      else if (c === 2) raspodela['2']++;
      else if (c <= 5) raspodela['3-5']++;
      else if (c <= 10) raspodela['6-10']++;
      else raspodela['>10']++;
    }
  }

  return {
    korakKm, n, M, celijaMeseci: n * M,
    poluprecnikM: Math.round(mreza.poluprecnikKm * 1000),
    unutra, van, vanPerioda,
    aktivnih: poCeliji.size,
    popunjenost, raspodela,
    koncentracija: { p1: udeoNajvecih(0.01), p5: udeoNajvecih(0.05), p10: udeoNajvecih(0.10) },
    pragZaPunu: n * 12
  };
}

// ---------------------------------------------------------------- izvestaj

function ispisi(r) {
  const L = [];
  L.push('');
  L.push('MREZA ' + String(r.korakKm).replace('.', ',') + ' km — ' + sr(r.n) +
    ' celija (poluprecnik ' + r.poluprecnikM + ' m), ' + r.M + ' meseci');
  L.push('  celija-meseci u tabli        ' + sr(r.celijaMeseci).padStart(12));
  L.push('  transakcija u granici        ' + sr(r.unutra).padStart(12));
  if (r.van)        L.push('  van granice (preskoceno)     ' + sr(r.van).padStart(12));
  if (r.vanPerioda) L.push('  van perioda (preskoceno)     ' + sr(r.vanPerioda).padStart(12));
  L.push('  celija sa bar jednom         ' + sr(r.aktivnih).padStart(12) +
    '   ' + pct(r.aktivnih, r.n) + ' mreze');
  L.push('');
  L.push('  POPUNJENOST TABLE');
  L.push('  prozor        popunjeno celija-meseci     od cele mreze   od aktivnih celija');
  for (const p of r.popunjenost) {
    L.push('  ' + (p.w + (p.w === 1 ? ' mesec' : ' meseca')).padEnd(12) +
      sr(p.popunjenih).padStart(14) + '       ' +
      pct(p.popunjenih, r.celijaMeseci).padStart(8) + '        ' +
      pct(p.popunjenih, r.aktivnih * r.M).padStart(8));
  }
  L.push('');
  L.push('  KOLIKO IH JE U NEPRAZNOM CELIJA-MESECU (bez prozora)');
  for (const [k, v] of Object.entries(r.raspodela)) {
    L.push('  ' + k.padEnd(12) + sr(v).padStart(14));
  }
  L.push('');
  L.push('  KONCENTRACIJA');
  L.push('  najprometniji 1 %  celija nosi ' + pct(r.koncentracija.p1, 1));
  L.push('  najprometnijih 5 % celija nosi ' + pct(r.koncentracija.p5, 1));
  L.push('  najprometnijih 10 % celija nosi ' + pct(r.koncentracija.p10, 1));
  L.push('');
  L.push('  Da svaka celija dobije bar jednu transakciju mesecno, trebalo bi');
  L.push('  oko ' + sr(r.pragZaPunu) + ' prometa godisnje. Ovde ih je ' +
    sr(Math.round(r.unutra / (r.M / 12))) + ' godisnje.');
  return L.join('\n');
}

// ---------------------------------------------------------------- provera

/*
 * Trazenje celije je jedino mesto gde skript moze da bude TIHO pogresan:
 * ako inverzija resetke promasi, svi brojevi ispadnu uredni a netacni.
 * Zato --proveri: nasumicne tacke se dodele i brzim putem i grubom silom
 * (najblize od svih n sredista) pa se rezultati uporede.
 *
 * Pokrenuti posle svake izmene geometrije u generator.js.
 */
function proveri(korakKm, kolikoTacaka) {
  const mreza = G.napraviMrezu(korakKm);
  const trazi = napraviTrazioca(mreza);
  const n = mreza.n;
  const rand = G.mulberry32(12345);

  /* Ista mera kao u brzom putu — proverava se PRETRAGA, ne merenje. */
  const { kmPoStepenuLat, C } = geometrija(mreza);
  const rastojanje = napraviMeru(mreza, kmPoStepenuLat, C);
  const grubo = (tLon, tLat) => {
    let naj = -1, d0 = Infinity;
    for (let k = 0; k < n; k++) {
      const d = rastojanje(tLon, tLat, k);
      if (d < d0) { d0 = d; naj = k; }
    }
    return d0 <= mreza.poluprecnikKm * mreza.poluprecnikKm ? naj : -1;
  };

  let slaganje = 0, neslaganje = 0, obaVan = 0;
  const primeri = [];
  for (let i = 0; i < kolikoTacaka; i++) {
    const lon = mreza.minLon + rand() * (mreza.maxLon - mreza.minLon);
    const lat = mreza.minLat + rand() * (mreza.maxLat - mreza.minLat);
    const a = trazi(lon, lat), b = grubo(lon, lat);
    if (a === b) { if (a < 0) obaVan++; else slaganje++; }
    else {
      neslaganje++;
      if (primeri.length < 5) primeri.push({ lon: +lon.toFixed(5), lat: +lat.toFixed(5), brzo: a, grubo: b });
    }
  }
  return { korakKm, n, slaganje, neslaganje, obaVan, primeri };
}

// ---------------------------------------------------------------- primer

/*
 * Sinteticki uzorak transakcija, samo da se skript moze isprobati pre nego
 * sto stigne stvarni izvod.
 *
 * PAZNJA: ovo NISU podaci o prometu. Broj transakcija po celiji je izvucen
 * iz iste mere blizine gradova koju koristi prikaz, pa slika koncentracije
 * lici na stvarnu samo utoliko sto je promet i u stvarnosti zgusnut oko
 * gradova. Sve brojke koje iz ovoga izadju sluze da se vidi KAKO izvestaj
 * izgleda, ne KOLIKO ce podataka zaista biti.
 */
function napraviPrimer(godisnje, meseci) {
  const mreza = G.napraviMrezu(1.5);
  const n = mreza.n, M = meseci.length;
  const sumSela = G.napraviSum(4242, 3, 40);

  const tezina = new Float64Array(n);
  let zbir = 0;
  for (let k = 0; k < n; k++) {
    const [x, y] = G.lonLatUKm(mreza.lon[k], mreza.lat[k]);
    let grad = 0;
    for (const red of G.GRADOVI) {
      const [cx, cy] = G.lonLatUKm(red[1], red[2]);
      grad = Math.max(grad, red[3] * Math.exp(-Math.hypot(x - cx, y - cy) / (red[4] * 0.5)));
    }
    /* Cetvrti stepen: promet je zgusnutiji od same naseljenosti. */
    const v = Math.pow(grad + 0.35 * Math.pow(sumSela(x, y), 3), 4);
    tezina[k] = v; zbir += v;
  }
  const kumulativ = new Float64Array(n);
  let s = 0;
  for (let k = 0; k < n; k++) { s += tezina[k] / zbir; kumulativ[k] = s; }

  const rand = G.mulberry32(20260831);
  const ukupno = Math.round(godisnje * M / 12);
  const out = [];
  for (let i = 0; i < ukupno; i++) {
    /* celija po tezini */
    const u = rand();
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (kumulativ[mid] < u) lo = mid + 1; else hi = mid; }
    /* nasumicno unutar celije, grubo: pomeraj do pola poluprecnika */
    const R = mreza.poluprecnikKm;
    const dxKm = (rand() - 0.5) * R, dyKm = (rand() - 0.5) * R;
    const lat = mreza.lat[lo] + dyKm / 111.13;
    const lon = mreza.lon[lo] + dxKm / (111.320 * Math.cos(lat * Math.PI / 180));
    out.push({ lon, lat, mesec: meseci[Math.floor(rand() * M)], cena: null });
  }
  return out;
}

// ---------------------------------------------------------------- glavno

function glavno() {
  const meseci = G.oznakeMeseci();
  let transakcije, izvor;

  if (ima('proveri')) {
    const koliko = parseInt(arg('tacaka', '3000'), 10);
    console.log('PROVERA trazenja celije — brzi put protiv grube sile, ' +
      sr(koliko) + ' nasumicnih tacaka po mrezi.\n');
    let sveDobro = true;
    for (const korak of KORACI) {
      const r = proveri(korak, koliko);
      const ok = r.neslaganje === 0;
      if (!ok) sveDobro = false;
      console.log('  ' + String(r.korakKm).replace('.', ',') + ' km  (' + sr(r.n) + ' celija)   ' +
        'u celiji: ' + sr(r.slaganje) + '   van mreze: ' + sr(r.obaVan) +
        '   NESLAGANJA: ' + r.neslaganje + (ok ? '   OK' : '   <<< GRESKA'));
      for (const p of r.primeri) console.log('      ' + JSON.stringify(p));
    }
    console.log(sveDobro
      ? '\nInverzija resetke se slaze sa grubom silom na svim tackama.'
      : '\nInverzija resetke NE odgovara. Ne verovati brojkama dok se ne popravi.');
    process.exit(sveDobro ? 0 : 1);
  }

  if (ima('primer')) {
    const godisnje = parseInt(arg('godisnje', '120000'), 10);
    console.log('SINTETICKI UZORAK — ' + sr(godisnje) + ' prometa godisnje.');
    console.log('Ovo nisu podaci o prometu; sluze samo da se vidi kako izvestaj izgleda.\n');
    transakcije = napraviPrimer(godisnje, meseci);
    izvor = 'sinteticki uzorak, ' + sr(godisnje) + ' godisnje';
  } else {
    const ulaz = arg('ulaz', null);
    if (!ulaz) {
      console.log('Upotreba:');
      console.log('  node prebroj.js --ulaz transakcije.csv [--korak 3,1.5] [--prozor 1,3,6,12]');
      console.log('  node prebroj.js --primer [--godisnje 120000]');
      console.log('');
      console.log('Kolone se pogadjaju iz zaglavlja; mogu se zadati sa --lon --lat --datum --cena.');
      process.exit(1);
    }
    if (!fs.existsSync(ulaz)) throw new Error('Nema fajla: ' + ulaz);
    const u = ucitaj(ulaz);
    transakcije = u.transakcije;
    izvor = path.basename(ulaz);
    console.log('Ucitano: ' + sr(transakcije.length) + ' transakcija' +
      (u.lose.koordinata ? '   bez koordinate: ' + sr(u.lose.koordinata) : '') +
      (u.lose.datum ? '   bez datuma: ' + sr(u.lose.datum) : ''));
  }

  const delovi = [];
  for (const korak of KORACI) {
    const r = analiziraj(korak, transakcije, meseci);
    const tekst = ispisi(r);
    console.log(tekst);
    delovi.push(tekst);
  }

  const izlaz = arg('izlaz', null);
  if (izlaz) {
    fs.writeFileSync(izlaz,
      '# Gustina prometa po celiji i mesecu\n\nIzvor: ' + izvor + '\n\n```' +
      delovi.join('\n') + '\n```\n');
    console.log('\nIzvestaj upisan: ' + izlaz);
  }

  console.log('\nBrojevi gore kazu koliko podataka ima, ne koliko su pouzdani.');
  console.log('Dve transakcije u istoj celiji nisu ista nepokretnost — za kretanje');
  console.log('cene treba hedonisticki model ili indeks ponovljene prodaje.');
}

try {
  glavno();
} catch (e) {
  console.error('\nGRESKA: ' + e.message);
  process.exit(1);
}
