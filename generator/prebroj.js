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
const C = require('./citaj.js');

// ---------------------------------------------------------------- argumenti

const arg = (ime, podr) => {
  const i = process.argv.indexOf('--' + ime);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : podr;
};
const ima = (ime) => process.argv.indexOf('--' + ime) > -1;

const brojevi = (s) => String(s).split(',').map(x => parseFloat(x.trim())).filter(Number.isFinite);

const KORACI = brojevi(arg('korak', '3,1.5'));
const PROZORI = brojevi(arg('prozor', '1,3,6,12')).map(Math.round);

// ---------------------------------------------------------------- ulaz

/* CSV citanje, prepoznavanje kolona i trazenje celije stoje u citaj.js —
   deli ih sa pretvori.js, da oba vide istu tacku u istoj celiji, i da
   `--proveri` odavde pokriva i konverziju. */
const { geometrija, napraviMeru, napraviTrazioca } = C;

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

  /* Tezina po celiji: cetvrti stepen naseljenosti — promet je zgusnutiji od
     samog stanovnistva. */
  const skor = G.skorNaseljenosti(mreza);
  const tezina = new Float64Array(n);
  let zbir = 0;
  for (let k = 0; k < n; k++) { tezina[k] = Math.pow(skor[k], 4); zbir += tezina[k]; }
  const kumulativ = new Float64Array(n);
  let s = 0;
  for (let k = 0; k < n; k++) { s += tezina[k] / zbir; kumulativ[k] = s; }

  /* Prava povrsina cena, da transakcije imaju sta da nose. Konverzija se
     posle proverava time koliko dobro je iz uzorka rekonstruise. */
  const serija = G.napraviSeriju(mreza);
  const cene = new Float32Array(n * M);
  for (let i = 0; i < M; i++) {
    const r = serija.sledeciMesec(i);
    for (let k = 0; k < n; k++) cene[i * n + k] = r.cene[k];
  }

  const rand = G.mulberry32(20260831);
  const ukupno = Math.round(godisnje * M / 12);
  const out = [];
  for (let i = 0; i < ukupno; i++) {
    const u = rand();
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (kumulativ[mid] < u) lo = mid + 1; else hi = mid; }
    const t = Math.floor(rand() * M);

    /* Nasumicno unutar celije */
    const R = mreza.poluprecnikKm;
    const dxKm = (rand() - 0.5) * R, dyKm = (rand() - 0.5) * R;
    const lat = mreza.lat[lo] + dyKm / 111.13;
    const lon = mreza.lon[lo] + dxKm / (111.320 * Math.cos(lat * Math.PI / 180));

    /* Cena pojedinacne transakcije rasipa se oko nivoa celije: stanovi se
       razlikuju po povrsini, spratu, starosti i stanju. Otud i cela nevolja
       sa poredjenjem meseci — dva prometa u istoj celiji nisu ista stvar.
       Rasipanje je lognormalno, oko 18 %. */
    const g = Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
    const cena = cene[t * n + lo] * Math.exp(0.18 * g);

    out.push({ lon, lat, mesec: meseci[t], cena: Math.round(cena) });
  }
  return out;
}

/* Uzorak na disk, da ima na cemu da se isproba pretvori.js. */
function pisiUzorak(put, transakcije) {
  const KRAJ = String.fromCharCode(10);
  const delovi = ['lon;lat;datum;cena_eur_m2' + KRAJ];
  for (const t of transakcije) {
    delovi.push(t.lon.toFixed(6) + ';' + t.lat.toFixed(6) + ';' +
      t.mesec + '-15;' + (t.cena === null ? '' : t.cena) + KRAJ);
  }
  fs.writeFileSync(put, delovi.join(''));
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
    const pisi = arg('pisi', null);
    if (pisi) { pisiUzorak(pisi, transakcije); console.log('Uzorak upisan: ' + pisi); }
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
    const u = C.ucitajTransakcije(fs, ulaz, {
      kolone: { lon: arg('lon', null), lat: arg('lat', null),
                datum: arg('datum', null), cena: arg('cena', null) }
    });
    console.log('Razdvajac: ' + u.opis.razdvajac + '   kolone: lon=' + u.opis.lon +
      '  lat=' + u.opis.lat + '  datum=' + u.opis.datum +
      (u.opis.cena ? '  cena=' + u.opis.cena : '  (bez cene)'));
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
