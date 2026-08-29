/*
 * generator.js — sinteticke cene stana od 50 m2 na mrezi tacaka nad Srbijom,
 * mesecno od januara 2019. do decembra 2026.
 *
 * Isti fajl se koristi i iz Node-a (generisi.js) i ugradjen u web prikaz,
 * da se logika ne bi razisla na dva mesta.
 *
 * VAZNO: podaci su sinteticki. Ne koriste se ni za kakvu procenu vrednosti.
 */

// ---------------------------------------------------------------- PRNG

// mulberry32 — determinisan, brz, dovoljno dobar za sintetiku
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// normalna raspodela preko Box-Muller
function gauss(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ------------------------------------------------------- projekcija

// Ekvidistantna cilindricna projekcija oko lat0 — mreza je pravilna u km.
// Izoblicenje preko Srbije je oko 3.5%, sto je za sinteticki prikaz prihvatljivo.
// Za stvarne podatke koristiti zvanicni CRS (UTM 34N).
const LAT0 = 44.0;
const KM_PO_STEPENU_LAT = 111.13;
const KM_PO_STEPENU_LON = 111.320 * Math.cos(LAT0 * Math.PI / 180);

function lonLatUKm(lon, lat) {
  return [lon * KM_PO_STEPENU_LON, lat * KM_PO_STEPENU_LAT];
}
function kmULonLat(x, y) {
  return [x / KM_PO_STEPENU_LON, y / KM_PO_STEPENU_LAT];
}

// ------------------------------------------------------- granica

// PRIBLIZNA kontura, iskljucivo za demonstraciju rasporeda tacaka.
// Zameniti zvanicnom granicom iz GeoSrbije pre bilo kakve stvarne upotrebe.
const GRANICA_PRIBLIZNA = [
  [20.15, 46.18], [20.60, 46.14], [20.78, 45.75], [21.10, 45.55],
  [21.52, 45.20], [21.44, 44.87], [21.72, 44.68], [22.30, 44.63],
  [22.70, 44.55], [22.45, 44.20], [22.68, 43.85], [22.98, 43.72],
  [22.62, 43.42], [22.98, 43.18], [22.55, 42.88], [22.34, 42.35],
  [21.90, 42.32], [21.58, 42.25], [21.30, 42.14], [20.75, 41.86],
  [20.52, 42.22], [20.35, 42.85], [19.98, 43.10], [19.65, 43.22],
  [19.20, 43.55], [19.42, 44.06], [19.10, 44.32], [19.38, 44.88],
  [19.00, 45.14], [19.12, 45.52], [18.85, 45.90], [19.06, 45.96],
  [19.42, 46.14]
];

function uPoligonu(lon, lat, poly) {
  let unutra = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const sece = (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (sece) unutra = !unutra;
  }
  return unutra;
}

// ------------------------------------------------------- gradovi

// lon, lat, tezina (koliko podize cenu), domet u km
const GRADOVI = [
  ['Beograd',      20.457, 44.787, 1.00, 26],
  ['Novi Sad',     19.833, 45.267, 0.78, 17],
  ['Nis',          21.896, 43.321, 0.58, 14],
  ['Kragujevac',   20.917, 44.017, 0.50, 12],
  ['Subotica',     19.665, 46.100, 0.42, 11],
  ['Zlatibor',     19.700, 43.730, 0.62,  9],   // turisticka premija
  ['Kopaonik',     20.800, 43.280, 0.60,  7],   // turisticka premija
  ['Cacak',        20.350, 43.891, 0.40, 10],
  ['Kraljevo',     20.690, 43.723, 0.38, 10],
  ['Novi Pazar',   20.515, 43.137, 0.36, 10],
  ['Pancevo',      20.640, 44.870, 0.40,  9],
  ['Zrenjanin',    20.390, 45.383, 0.36, 10],
  ['Sabac',        19.690, 44.754, 0.36,  9],
  ['Uzice',        19.849, 43.858, 0.38, 10],
  ['Valjevo',      19.890, 44.270, 0.35,  9],
  ['Smederevo',    20.930, 44.663, 0.35,  9],
  ['Leskovac',     21.946, 42.998, 0.32, 10],
  ['Vranje',       21.900, 42.551, 0.30,  9],
  ['Sombor',       19.114, 45.774, 0.30,  9],
  ['Sremska Mitrovica', 19.612, 44.977, 0.32, 8]
];

// ------------------------------------------------------- sum

// Visestruko-oktavni value noise na pravilnoj resetki, bilinearno uzorkovan.
function napraviSum(seed, oktave, osnovnaCelija) {
  const slojevi = [];
  for (let o = 0; o < oktave; o++) {
    slojevi.push({
      korak: osnovnaCelija / Math.pow(2, o),   // u km
      seme: (seed + o * 7919) | 0,
      kes: new Map(),
      amp: Math.pow(0.5, o)
    });
  }
  function vrednostResetke(sloj, i, j) {
    const kljuc = i * 100000 + j;
    let v = sloj.kes.get(kljuc);
    if (v === undefined) {
      // deterministicki po (i, j, sloj), nezavisno od redosleda poziva
      v = mulberry32(((i * 73856093) ^ (j * 19349663) ^ sloj.seme) | 0)();
      sloj.kes.set(kljuc, v);
    }
    return v;
  }
  return function (x, y) {
    let zbir = 0, ukupnaAmp = 0;
    for (const sloj of slojevi) {
      const gx = x / sloj.korak, gy = y / sloj.korak;
      const i = Math.floor(gx), j = Math.floor(gy);
      const fx = gx - i, fy = gy - j;
      const sx = fx * fx * (3 - 2 * fx);   // smoothstep
      const sy = fy * fy * (3 - 2 * fy);
      const v00 = vrednostResetke(sloj, i, j);
      const v10 = vrednostResetke(sloj, i + 1, j);
      const v01 = vrednostResetke(sloj, i, j + 1);
      const v11 = vrednostResetke(sloj, i + 1, j + 1);
      const gore = v00 + (v10 - v00) * sx;
      const dole = v01 + (v11 - v01) * sx;
      zbir += (gore + (dole - gore) * sy) * sloj.amp;
      ukupnaAmp += sloj.amp;
    }
    return zbir / ukupnaAmp;   // 0..1
  };
}

// ------------------------------------------------------- mreza

/*
 * Sestougaona resetka, a ne kvadratna.
 *
 * ZASTO. Prikaz crta jednu celiju po tacki, ColumnLayer-om sa sest strana.
 * Sestouglovi popunjavaju ravan bez preklopa i bez rupa samo ako su centri
 * na sestougaonoj resetki; na kvadratnoj bi ostajali procepi. Ranije je
 * mreza bila kvadratna, pa je HexagonLayer u pregledacu ponovo delio vec
 * podeljene podatke: na koraku od 3 km je svaki sestougao dobijao tacno
 * jednu tacku, a na 1,5 km su susedni dobijali dve ili tri, pa je prosek
 * bio racunat nad razlicito velikim uzorcima. Odatle su dolazile pravilne
 * pruge po povrsini. Geometrija celije se sada odredjuje jednom, ovde.
 *
 * MERA. `korakKm` i dalje znaci isto: stranu kvadrata te povrsine. Iz nje
 * se racuna poluprecnik sestougla, jer je povrsina sestougla (3*sqrt(3)/2)*R^2,
 * pa je R = korak / sqrt(3*sqrt(3)/2). Broj tacaka time ostaje uporediv sa
 * ranijim kvadratnim mrezama istog koraka.
 *
 * RASPORED. deck.gl-ov ColumnLayer pri `angle: 0` crta sestougao sa temenima
 * na istoku i zapadu i ravnim ivicama gore i dole. Takav se slaze ovako:
 *   razmak kolona   1.5 * R
 *   razmak vrsta    sqrt(3) * R
 *   svaka druga kolona pomerena za pola vrste
 * Svih sest suseda je tada na rastojanju sqrt(3)*R.
 *
 * IZOBLICENJE. Resetka je pravilna u ovdasnjoj ekvidistantnoj projekciji,
 * a prikaz crta celije u metrima na tlu. Preko Srbije se to razilazi za oko
 * 3.5% po duzini (isto izoblicenje koje je vec opisano uz LAT0), pa se pri
 * punoj popunjenosti celije na severu neznatno preklapaju, a na jugu ostave
 * tanku fugu. Pravo resenje je zvanicni CRS (UTM 34N), isto kao i za sve
 * ostalo u ovom fajlu.
 */

const R_PO_KORAKU = 1 / Math.sqrt(3 * Math.sqrt(3) / 2);   // 0.6204...

function napraviMrezu(korakKm, granica) {
  const poly = granica || GRANICA_PRIBLIZNA;
  let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
  for (const [lo, la] of poly) {
    if (lo < minLon) minLon = lo;
    if (lo > maxLon) maxLon = lo;
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
  }
  const [x0, y0] = lonLatUKm(minLon, minLat);
  const [x1, y1] = lonLatUKm(maxLon, maxLat);

  const R = korakKm * R_PO_KORAKU;
  const dx = 1.5 * R;                 // razmak kolona
  const dy = Math.sqrt(3) * R;        // razmak vrsta
  const nx = Math.ceil((x1 - x0) / dx);
  const ny = Math.ceil((y1 - y0) / dy);

  const lon = [], lat = [], gx = [], gy = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * dx;
      // svaka druga kolona pomerena za pola vrste — bez toga se ne slazu
      const y = y0 + (j + 0.5) * dy + (i & 1 ? dy / 2 : 0);
      const [lo, la] = kmULonLat(x, y);
      if (!uPoligonu(lo, la, poly)) continue;
      lon.push(lo); lat.push(la); gx.push(i); gy.push(j);
    }
  }
  return {
    korakKm, poluprecnikKm: R, nx, ny, x0, y0,
    minLon, maxLon, minLat, maxLat,
    n: lon.length,
    lon: Float64Array.from(lon),
    lat: Float64Array.from(lat),
    gx: Int32Array.from(gx),
    gy: Int32Array.from(gy)
  };
}

// ------------------------------------------------------- osnovna cena

function osnovnaCena(mreza, opcije) {
  const o = Object.assign({ min: 1000, max: 1850, seed: 20260826 }, opcije);
  const sum = napraviSum(o.seed, 4, 90);
  const sirovo = new Float32Array(mreza.n);
  let vmin = Infinity, vmax = -Infinity;

  for (let k = 0; k < mreza.n; k++) {
    const [x, y] = lonLatUKm(mreza.lon[k], mreza.lat[k]);
    let gradSkor = 0;
    for (const [, glon, glat, tezina, domet] of GRADOVI) {
      const [cx, cy] = lonLatUKm(glon, glat);
      const d = Math.hypot(x - cx, y - cy);
      gradSkor += tezina * Math.exp(-d / domet);
    }
    // spajanje gradskog uticaja i teksture terena
    const v = 0.68 * Math.min(gradSkor, 1.35) / 1.35 + 0.32 * sum(x, y);
    sirovo[k] = v;
    if (v < vmin) vmin = v;
    if (v > vmax) vmax = v;
  }

  const cena = new Float32Array(mreza.n);
  const raspon = vmax - vmin || 1;
  for (let k = 0; k < mreza.n; k++) {
    // vmin/vmax su racunati iz float64 vrednosti, a sirovo[] je float32 —
    // razlika u zaokruzivanju moze dati mali minus, a Math.pow(minus, 1.45) je NaN.
    const t = Math.max(0, Math.min(1, (sirovo[k] - vmin) / raspon));
    cena[k] = o.min + (o.max - o.min) * Math.pow(t, 1.45);   // gamma: malo skupih zona
  }
  return cena;
}

// ------------------------------------------------------- vreme

const GODINE = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
// prosecan godisnji rast na nivou drzave
const GODISNJI_RAST = {
  2019: 0.050, 2020: 0.030, 2021: 0.090, 2022: 0.140,
  2023: 0.105, 2024: 0.060, 2025: 0.045, 2026: 0.040
};
const BROJ_MESECI = GODINE.length * 12;   // 96

function oznakeMeseci() {
  const out = [];
  for (const g of GODINE) {
    for (let m = 1; m <= 12; m++) {
      out.push(g + '-' + String(m).padStart(2, '0'));
    }
  }
  return out;
}

/*
 * Indeks kretanja cene po celiji: index[celija][mesec], index = 1.0 u 01/2019.
 * Rast se prostorno razlikuje (negde brze, negde sporije), pa mapa trenda
 * ne izgleda isto kao mapa nivoa cena — to je i poenta.
 */
function faktorRasta(mreza, opcije) {
  const o = Object.assign({ seed: 777001 }, opcije);
  const sum = napraviSum(o.seed, 3, 120);
  const f = new Float32Array(mreza.n);
  for (let k = 0; k < mreza.n; k++) {
    const [x, y] = lonLatUKm(mreza.lon[k], mreza.lat[k]);
    f[k] = 0.45 + 1.15 * sum(x, y);   // mnozilac nacionalnog rasta: 0.45 .. 1.60
  }
  return f;
}

// sezonska komponenta — ne akumulira se, samo talasa oko trenda
function sezona(mesecUGodini) {
  return 1 + 0.008 * Math.sin((mesecUGodini - 3) / 12 * 2 * Math.PI);
}

/*
 * Racuna ceo niz cena. Vraca funkciju koja za dati mesec vraca Float32Array
 * cena po celiji — da se ne bi drzalo svih 34 miliona vrednosti u memoriji.
 */
function napraviSeriju(mreza, opcije) {
  const o = Object.assign({
    min: 1000, max: 3000, seed: 20260826,
    // 'opseg'  — ceo niz 2019-2026 staje u [min, max] (doslovno po specifikaciji)
    // 'realno' — bazna 01/2019 zauzima [min, max], rast ide preko toga
    rezim: 'opseg'
  }, opcije);

  const rast = faktorRasta(mreza, { seed: o.seed + 991 });
  const meseci = oznakeMeseci();

  // Deterministicki najveci indeks na kraju perioda (bez suma), da bazna
  // skala bude tako postavljena da se kasnije nista ne odseca.
  let maxRast = 0;
  for (let k = 0; k < mreza.n; k++) if (rast[k] > maxRast) maxRast = rast[k];
  let maxIndeks = 1;
  for (let t = 1; t < meseci.length; t++) {
    const g = GODINE[Math.floor(t / 12)];
    maxIndeks *= (1 + (Math.pow(1 + GODISNJI_RAST[g], 1 / 12) - 1) * maxRast);
  }
  const baznaMax = o.rezim === 'realno'
    ? o.max
    : o.min + (o.max / (maxIndeks * 1.03) - o.min);   // 3% rezerve za AR(1) sum

  const baza = osnovnaCena(mreza, { min: o.min, max: baznaMax, seed: o.seed });
  const gornjaGranica = o.rezim === 'realno' ? Infinity : o.max;

  // AR(1) sum po celiji, determinisan po celiji
  const sumStanje = new Float32Array(mreza.n);
  const randPoCeliji = [];
  for (let k = 0; k < mreza.n; k++) randPoCeliji.push(mulberry32(o.seed + 13 * k + 5));

  const indeks = new Float32Array(mreza.n).fill(1.0);   // 01/2019 = 1.0

  let odsecenih = 0;

  return {
    baza, rast, meseci, brojMeseci: meseci.length, baznaMax, rezim: o.rezim,
    get brojOdsecenih() { return odsecenih; },
    /* Poziva se redom, mesec po mesec, od indeksa 0. */
    sledeciMesec(t) {
      const godina = GODINE[Math.floor(t / 12)];
      const uGodini = (t % 12) + 1;
      const nacionalniMesecni = Math.pow(1 + GODISNJI_RAST[godina], 1 / 12) - 1;

      const cene = new Float32Array(mreza.n);
      const indeksKopija = new Float32Array(mreza.n);
      for (let k = 0; k < mreza.n; k++) {
        if (t > 0) {
          sumStanje[k] = 0.6 * sumStanje[k] + 0.4 * gauss(randPoCeliji[k]) * 0.006;
          indeks[k] *= (1 + nacionalniMesecni * rast[k]);
        }
        const v = baza[k] * indeks[k] * sezona(uGodini) * (1 + sumStanje[k]);
        if (v > gornjaGranica || v < o.min) odsecenih++;
        cene[k] = Math.max(o.min, Math.min(gornjaGranica, v));
        indeksKopija[k] = indeks[k];
      }
      return { cene, indeks: indeksKopija, oznaka: meseci[t] };
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    mulberry32, napraviMrezu, osnovnaCena, faktorRasta, napraviSeriju,
    oznakeMeseci, BROJ_MESECI, GODINE, GRADOVI, GRANICA_PRIBLIZNA,
    lonLatUKm, kmULonLat, uPoligonu, napraviSum
  };
}
