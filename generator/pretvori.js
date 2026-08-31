/*
 * pretvori.js — iz sirovog izvoda o prometu u ulaz za prikaz.
 *
 *   node pretvori.js --ulaz promet.csv --korak 3 --izlaz ./podaci_rgz
 *
 * ==================================================================
 * KARIKA KOJA JE NEDOSTAJALA
 * ==================================================================
 * napravi-hex.js --podaci ocekuje tri fajla u formatu koji generisi.js pise:
 * tacke.csv, cene.bin i meta.json. Generator ih pravi iz izmisljenih cena.
 * Ovaj skript ih pravi iz STVARNIH transakcija, pa ostatak lanca — pakovanje,
 * ugradnja, prikaz — ostaje nepromenjen i vec isproban.
 *
 * Citanje CSV-a i trazenje celije dolaze iz citaj.js, isti kod koji koristi
 * prebroj.js. To nije stednja nego uslov: izvestaj o retkosti mora da opisuje
 * bas onaj skup celija koji prikaz crta.
 *
 * ==================================================================
 * TRI ODLUKE KOJE SE OVDE DONOSE
 * ==================================================================
 * Do sada su bile precutne. Sada su prekidaci, i svaka se upisuje u meta.json
 * da se posle zna sta je tacno racunato.
 *
 * 1. KAKO SE VISE TRANSAKCIJA SAZIMA U JEDNU CENU CELIJE  (--sazmi)
 *    Podrazumevano medijana. Raspodela cena je desno zakosena, pa bi prosek
 *    vukla jedna skupa prodaja. Isti razlog zbog kog i prikaz uzima medijanu
 *    za nivo meseca.
 *
 * 2. KOLIKO TRANSAKCIJA TREBA DA BI CELIJA-MESEC UOPSTE VAZIO  (--najmanje)
 *    Podrazumevano 1. Celija-mesec koji stoji na jednoj transakciji je vrlo
 *    nesigurna procena, a na prikazu izgleda isto kao onaj sa dvadeset.
 *    Podizanjem praga slabi mesta postaju praznine — one koje prikaz vec ume
 *    da ne crta.
 *
 * 3. DA LI SE TANKE CELIJE POPUNJAVAJU POMERENIM PROZOROM  (--prozor)
 *    Podrazumevano 1, znaci bez popunjavanja. --prozor 12 dozvoljava celiji da
 *    posudi poslednjih dvanaest meseci kad tekuci nema dovoljno. Vise
 *    pokrivenosti, po cenu kasnjenja: cena iz proslog leta prikazuje se kao
 *    ovogodisnja. `prebroj.js` unapred kaze sta koji prozor donosi.
 *
 * ==================================================================
 * STA OVAJ SKRIPT NE RESAVA
 * ==================================================================
 * Dve transakcije u istoj celiji nisu ista nepokretnost. Razlikuju se po
 * povrsini, spratu, starosti i stanju, pa razlika izmedju dva meseca meri i
 * kretanje cene i promenu strukture onoga sto se prodalo. Medijana to ublazava
 * ali ne razdvaja; za to treba hedonisticki model ili indeks ponovljene
 * prodaje. Dok se to ne uradi, visina na prikazu (indeks) je gruba mera.
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

const ulaz = arg('ulaz', null);
const izlaz = arg('izlaz', './podaci_izvod');
const korak = parseFloat(arg('korak', '3'));
const sazmi = String(arg('sazmi', 'medijana')).toLowerCase();
const najmanje = Math.max(1, parseInt(arg('najmanje', '1'), 10));
const prozor = Math.max(1, parseInt(arg('prozor', '1'), 10));
const odMeseca = arg('od', null);
const doMeseca = arg('do', null);

if (!ulaz) {
  console.log('Upotreba:');
  console.log('  node pretvori.js --ulaz promet.csv --korak 3 --izlaz ./podaci_rgz');
  console.log('');
  console.log('  --cena K            kolona sa cenom po m2');
  console.log('  --ukupno K --povrsina K   ako cene po m2 nema, racuna se');
  console.log('  --kurs N            delilac (npr. 117.5 da se iz RSD dobiju evri)');
  console.log('  --samo K=V          zadrzi samo redove gde kolona K ima vrednost V');
  console.log('  --lon --lat --datum imena kolona, ako se ne pogode sama');
  console.log('');
  console.log('  --sazmi medijana|prosek     kako se vise transakcija svodi na jednu cenu');
  console.log('  --najmanje N        koliko transakcija treba da celija-mesec vazi (1)');
  console.log('  --prozor N          pomereni prozor u mesecima za popunjavanje (1 = bez)');
  console.log('  --od YYYY-MM --do YYYY-MM   period (podrazumevano: iz podataka)');
  console.log('  --napomena "..."    tekst koji prikaz ispisuje u ploci');
  process.exit(1);
}
if (!fs.existsSync(ulaz)) { console.error('Nema fajla: ' + ulaz); process.exit(1); }
if (sazmi !== 'medijana' && sazmi !== 'prosek') {
  console.error('--sazmi prima "medijana" ili "prosek"'); process.exit(1);
}

const sr = (x) => Number(x).toLocaleString('sr-RS');

// ---------------------------------------------------------------- ulaz

console.log('Citam ' + ulaz + ' …');
const u = C.ucitajTransakcije(fs, ulaz, {
  trebaCena: true,
  kurs: parseFloat(arg('kurs', '1')),
  samo: arg('samo', null),
  kolone: {
    lon: arg('lon', null), lat: arg('lat', null), datum: arg('datum', null),
    cena: arg('cena', null), ukupno: arg('ukupno', null), povrsina: arg('povrsina', null)
  }
});
console.log('  razdvajac ' + u.opis.razdvajac + ',  lon=' + u.opis.lon + '  lat=' + u.opis.lat +
  '  datum=' + u.opis.datum + '  cena=' + u.opis.cena +
  (u.opis.kurs ? '  / ' + u.opis.kurs : '') + (u.opis.samo ? '  samo ' + u.opis.samo : ''));
console.log('  upotrebljivih transakcija: ' + sr(u.transakcije.length) +
  '   odbaceno: koordinata ' + sr(u.lose.koordinata) + ', datum ' + sr(u.lose.datum) +
  ', cena ' + sr(u.lose.cena) + ', filter ' + sr(u.lose.filter));
if (!u.transakcije.length) { console.error('Nema nijedne upotrebljive transakcije.'); process.exit(1); }

/* Period: iz zadatog opsega ili iz samih podataka. */
function meseciIzmedju(od, do_) {
  const [g1, m1] = od.split('-').map(Number), [g2, m2] = do_.split('-').map(Number);
  const out = [];
  for (let g = g1, m = m1; g < g2 || (g === g2 && m <= m2); m++) {
    if (m > 12) { m = 1; g++; if (g > g2) break; }
    out.push(g + '-' + String(m).padStart(2, '0'));
  }
  return out;
}
let od = odMeseca, do_ = doMeseca;
if (!od || !do_) {
  let a = '9999-99', b = '0000-00';
  for (const t of u.transakcije) { if (t.mesec < a) a = t.mesec; if (t.mesec > b) b = t.mesec; }
  od = od || a; do_ = do_ || b;
}
const MESECI = meseciIzmedju(od, do_);
const M = MESECI.length;
if (!M) { console.error('Prazan period: ' + od + ' .. ' + do_); process.exit(1); }
console.log('  period: ' + od + ' .. ' + do_ + '  (' + M + ' meseci)');

// ---------------------------------------------------------------- mreza

const mreza = G.napraviMrezu(korak);
const n = mreza.n;
console.log('Mreza ' + korak + ' km: ' + sr(n) + ' celija, poluprecnik ' +
  Math.round(mreza.poluprecnikKm * 1000) + ' m');

const trazi = C.napraviTrazioca(mreza);
const indeksMeseca = new Map(MESECI.map((m, i) => [m, i]));

/* Cene se skupljaju u niz po celiji-mesecu. Drzi se retko (Map), jer je
   vecina kombinacija prazna — na 3 km i 120.000 prometa godisnje popuni se
   oko 16 %. */
const kante = new Map();
let unutra = 0, vanGranice = 0, vanPerioda = 0;
for (const t of u.transakcije) {
  const mi = indeksMeseca.get(t.mesec);
  if (mi === undefined) { vanPerioda++; continue; }
  const k = trazi(t.lon, t.lat);
  if (k < 0) { vanGranice++; continue; }
  const kljuc = mi * n + k;
  let niz = kante.get(kljuc);
  if (!niz) { niz = []; kante.set(kljuc, niz); }
  niz.push(t.cena);
  unutra++;
}
console.log('  u granici i periodu: ' + sr(unutra) +
  '   van granice: ' + sr(vanGranice) + '   van perioda: ' + sr(vanPerioda));
if (!unutra) { console.error('Nijedna transakcija ne pada u mrezu i period.'); process.exit(1); }

// ---------------------------------------------------------------- sazimanje

function medijana(niz) {
  niz.sort((a, b) => a - b);
  const p = niz.length >> 1;
  return niz.length % 2 ? niz[p] : (niz[p - 1] + niz[p]) / 2;
}
function prosek(niz) {
  let s = 0; for (const v of niz) s += v; return s / niz.length;
}
const svedi = sazmi === 'prosek' ? prosek : medijana;

/* Sirova tabla: cena po celiji-mesecu tamo gde ima dovoljno transakcija.
   0 znaci "nema podatka" — isti dogovor koji prikaz razume. */
const sirovo = new Float64Array(n * M);
const brojTransakcija = new Uint16Array(n * M);
let popunjenoPreProzora = 0, odbaceno_malo = 0;
for (const [kljuc, niz] of kante) {
  brojTransakcija[kljuc] = Math.min(65535, niz.length);
  if (niz.length < najmanje) { odbaceno_malo++; continue; }
  sirovo[kljuc] = svedi(niz);
  popunjenoPreProzora++;
}

/* Pomereni prozor: kad tekuci mesec nema dovoljno, uzmi poslednjih `prozor`
   meseci zajedno. Radi se nad SIROVIM transakcijama, ne nad vec svedenim
   cenama — prosek proseka nije prosek. */
const cene = new Uint16Array(n * M);
let popunjeno = 0;
if (prozor <= 1) {
  for (let i = 0; i < n * M; i++) cene[i] = Math.round(sirovo[i]);
  popunjeno = popunjenoPreProzora;
} else {
  for (let mi = 0; mi < M; mi++) {
    for (let k = 0; k < n; k++) {
      const kljuc = mi * n + k;
      if (sirovo[kljuc] > 0) { cene[kljuc] = Math.round(sirovo[kljuc]); popunjeno++; continue; }
      /* skupi transakcije iz prozora koji se zavrsava ovim mesecem */
      let skup = null;
      for (let d = 0; d < prozor; d++) {
        const j = mi - d;
        if (j < 0) break;
        const niz = kante.get(j * n + k);
        if (niz) { if (!skup) skup = []; for (const v of niz) skup.push(v); }
      }
      if (skup && skup.length >= najmanje) {
        cene[kljuc] = Math.round(svedi(skup));
        popunjeno++;
      }
    }
  }
}

/* Opsezi — samo preko popunjenih. */
let cmin = Infinity, cmax = 0, aktivnih = 0;
const imaCelija = new Uint8Array(n);
for (let mi = 0; mi < M; mi++) {
  for (let k = 0; k < n; k++) {
    const v = cene[mi * n + k];
    if (!v) continue;
    if (v < cmin) cmin = v;
    if (v > cmax) cmax = v;
    if (!imaCelija[k]) { imaCelija[k] = 1; aktivnih++; }
  }
}
if (cmin === Infinity) { console.error('Nijedan celija-mesec nije prosao pragove.'); process.exit(1); }
if (cmax > 65535) {
  console.error('Cena prelazi 65535 EUR/m2, a format je uint16. Proverite --kurs.');
  process.exit(1);
}

console.log('Sazimanje: ' + sazmi + ',  najmanje ' + najmanje +
  ' transakcija,  prozor ' + prozor + (prozor > 1 ? ' meseci' : ' (bez popunjavanja)'));
console.log('  popunjeno celija-meseci: ' + sr(popunjeno) + ' od ' + sr(n * M) +
  '   (' + (100 * popunjeno / (n * M)).toFixed(1) + ' %)');
if (prozor > 1) console.log('    od toga bez prozora: ' + sr(popunjenoPreProzora));
if (odbaceno_malo) console.log('  celija-meseci ispod praga --najmanje: ' + sr(odbaceno_malo));
console.log('  celija sa bar jednim mesecem: ' + sr(aktivnih) + ' od ' + sr(n) +
  '   (' + (100 * aktivnih / n).toFixed(1) + ' %)');
console.log('  cene: ' + cmin + ' – ' + cmax + ' EUR/m2');

// ---------------------------------------------------------------- izlaz

fs.mkdirSync(izlaz, { recursive: true });

/* tacke.csv — id, lon, lat, pa koliko je celija ukupno imala transakcija.
   Poslednja kolona nije obavezna za prikaz, ali cuva trag koliko je koja
   celija zaista nosila. */
{
  const ukupnoPoCeliji = new Uint32Array(n);
  for (let mi = 0; mi < M; mi++)
    for (let k = 0; k < n; k++) ukupnoPoCeliji[k] += brojTransakcija[mi * n + k];
  const KRAJ = String.fromCharCode(10);
  const delovi = ['id,lon,lat,transakcija_ukupno' + KRAJ];
  for (let k = 0; k < n; k++) {
    delovi.push(k + ',' + mreza.lon[k].toFixed(6) + ',' + mreza.lat[k].toFixed(6) +
      ',' + ukupnoPoCeliji[k] + KRAJ);
    if (delovi.length > 20000) { fs.appendFileSync(path.join(izlaz, 'tacke.csv'), delovi.join('')); delovi.length = 0; }
  }
  if (delovi.length) {
    if (fs.existsSync(path.join(izlaz, 'tacke.csv')) && delovi.length !== 1)
      fs.appendFileSync(path.join(izlaz, 'tacke.csv'), delovi.join(''));
    else fs.writeFileSync(path.join(izlaz, 'tacke.csv'), delovi.join(''));
  }
}

/* cene.bin — uint16 LE, mesec-major, 0 = nema podatka */
{
  const buf = Buffer.allocUnsafe(n * M * 2);
  for (let i = 0; i < n * M; i++) buf.writeUInt16LE(cene[i], i * 2);
  fs.writeFileSync(path.join(izlaz, 'cene.bin'), buf);
}

const napomena = arg('napomena',
  'Izvedeno iz ' + path.basename(ulaz) + ' — ' + sr(unutra) + ' transakcija, ' +
  sazmi + ' po celiji i mesecu.');

const meta = {
  napomena: napomena,
  izvor: {
    fajl: path.basename(ulaz),
    transakcija_upotrebljeno: unutra,
    van_granice: vanGranice,
    van_perioda: vanPerioda,
    odbaceno: u.lose,
    kolone: u.opis
  },
  korak_km: korak,
  celija: {
    oblik: 'sestougao',
    poluprecnik_m: Math.round(mreza.poluprecnikKm * 1000),
    razmak_vrsta_m: Math.round(1.5 * mreza.poluprecnikKm * 1000),
    razmak_kolona_m: Math.round(Math.sqrt(3) * mreza.poluprecnikKm * 1000),
    ugao: 30,
    napomena: 'teme nagore (deck.gl ColumnLayer, angle 30); svaka vrsta lezi ' +
              'na jednoj paraleli, razmak kolona se racuna za tu paralelu'
  },
  sazimanje: {
    kako: sazmi,
    najmanje_transakcija: najmanje,
    prozor_meseci: prozor,
    napomena: 'Dve transakcije u istoj celiji nisu ista nepokretnost; za ' +
              'razdvajanje kretanja cene od promene strukture treba hedonisticki ' +
              'model ili indeks ponovljene prodaje.'
  },
  broj_tacaka: n,
  broj_meseci: M,
  prvi_mesec: MESECI[0],
  poslednji_mesec: MESECI[M - 1],
  meseci: MESECI,
  okvir: {
    min_lon: mreza.minLon, max_lon: mreza.maxLon,
    min_lat: mreza.minLat, max_lat: mreza.maxLat
  },
  cene_bin: {
    tip: 'uint16 little-endian',
    raspored: 'mesec-major: [mesec0: sve tacke][mesec1: sve tacke]...',
    duzina_bajtova: n * M * 2,
    opseg_vrednosti: [cmin, cmax],
    nula_znaci: 'nema podatka za tu celiju u tom mesecu'
  },
  pokrivenost: {
    pokriveno_celija_meseci: popunjeno,
    od_ukupno: n * M,
    udeo: Number((popunjeno / (n * M)).toFixed(4)),
    celija_sa_podatkom: aktivnih,
    napomena: 'praznine su stvarne — celija-mesec bez dovoljno transakcija'
  },
  granica: 'Natural Earth 1:10m Admin 0 (SRB + KOS), uproscena na ~220 m; za ' +
           'stvarnu upotrebu ide zvanicna granica iz GeoSrbije'
};
fs.writeFileSync(path.join(izlaz, 'meta.json'), JSON.stringify(meta, null, 2));

const mb = (f) => (fs.statSync(path.join(izlaz, f)).size / 1e6).toFixed(1) + ' MB';
console.log('');
console.log('Upisano u ' + izlaz);
console.log('  tacke.csv   ' + mb('tacke.csv'));
console.log('  cene.bin    ' + mb('cene.bin'));
console.log('  meta.json   ' + mb('meta.json'));
console.log('');
console.log('Dalje:  node ../prototip/napravi-hex.js --podaci ' + izlaz + ' --deck …');
console.log('');
console.log('Dve transakcije u istoj celiji nisu ista nepokretnost — visina na');
console.log('prikazu (indeks) je zato gruba mera dok se ne uradi hedonisticki model.');
