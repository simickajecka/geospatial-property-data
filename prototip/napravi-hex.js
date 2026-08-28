/*
 * napravi-hex.js — sastavlja samostalan hexagon-layer.html.
 *
 *   node napravi-hex.js --deck <putanja/do/dist.min.js>
 *                       [--maplibre maplibre-gl.js] [--maplibre-css maplibre-gl.css]
 *                       [--podaci <folder sa tacke.csv, cene.bin, meta.json>]
 *
 * Uz obe varijante puni i ../isporuka — folder koji se salje dalje.
 *
 * Objavljena stranica ne sme da povlaci skripte sa CDN-a, pa se deck.gl
 * bandl ugradjuje u sam fajl. Generator se preuzima iz generator/generator.js
 * da se logika ne bi duplirala.
 */

const fs = require('fs');
const path = require('path');

const arg = (ime, podr) => {
  const i = process.argv.indexOf('--' + ime);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : podr;
};

const koren = __dirname;

/* --- pronadji deck.gl bandl --- */
function nadjiDeck() {
  const rucno = arg('deck', null);
  if (rucno) {
    if (!fs.existsSync(rucno)) throw new Error('Nema fajla: ' + rucno);
    return rucno;
  }
  const kandidati = [];
  const baze = [
    path.join(koren, 'node_modules', 'deck.gl'),
    path.join(koren, '..', 'node_modules', 'deck.gl'),
    arg('node-modules', '') && path.join(arg('node-modules', ''), 'deck.gl')
  ].filter(Boolean);

  for (const b of baze) {
    if (!fs.existsSync(b)) continue;
    for (const rel of ['dist.min.js', 'dist/dist.min.js', 'dist.js',
                       'dist/dist.js', 'dist/dist.dev.js']) {
      const p = path.join(b, rel);
      if (fs.existsSync(p)) kandidati.push(p);
    }
  }
  if (!kandidati.length) {
    throw new Error(
      'Nije nadjen deck.gl bandl.\n' +
      'Instalirati sa:  npm install deck.gl\n' +
      'pa pokrenuti:    node napravi-hex.js --deck <putanja>/deck.gl/dist.min.js');
  }
  return kandidati[0];
}

const deckPut = nadjiDeck();
let deckKod = fs.readFileSync(deckPut, 'utf8');

/*
 * Bandl na kraju nosi blok sa licencama ugradjenih biblioteka. Blok sadrzi
 * i URL-ove, na koje validator objavljivanja reaguje. Izdvajamo ga u zaseban
 * fajl — isto sto radi webpack sa extractComments — pa napomene ostaju
 * sacuvane i dostupne, kako licence i traze.
 */
const POCETAK = '/*! Bundled license information:';
let licence = null;
const i0 = deckKod.indexOf(POCETAK);
if (i0 > -1) {
  const i1 = deckKod.indexOf('*/', i0);
  if (i1 > -1) {
    licence = deckKod.slice(i0, i1 + 2);
    deckKod = deckKod.slice(0, i0) +
      '/* Napomene o licencama ugradjenih biblioteka: vidi LICENSES.txt */' +
      deckKod.slice(i1 + 2);
    /* Sam tekst se pise nize, kad se zna i da li je maplibre ugradjen. */
  }
}
const generator = fs.readFileSync(path.join(koren, '..', 'generator', 'generator.js'), 'utf8');
const app = fs.readFileSync(path.join(koren, 'hex-app.js'), 'utf8');
const sablon = fs.readFileSync(path.join(koren, 'hex-sablon.html'), 'utf8');

/* generator.js je pisan i za Node — u pregledacu ga izlazemo kao globalni G */
const generatorZaWeb =
  '(function(){\n' +
  'var module = { exports: {} };\n' +
  generator + '\n' +
  'window.G = module.exports;\n' +
  '})();';

/* Подлога: maplibre-gl + CARTO dark-matter, исто што користи deck.gl пример.
   Тражи мрежу, па иде само у CDN варијанту. */
const MAPLIBRE_TAGOVI = [
  '<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">',
  '<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"><\/script>'
].join('\n');

/*
 * maplibre-gl se ugradjuje kad je dostupan lokalno (--maplibre), da bi glavni
 * fajl sa mreze trazio samo tajlove podloge, a ne i biblioteke. Ako ga nema,
 * fajl radi bez podloge — prikaz se sam prilagodi.
 */
const mlJs = arg('maplibre', null);
const mlCss = arg('maplibre-css', null);
let ugradjenMaplibre = '<!-- maplibre-gl nije ugradjen: prikaz radi bez podloge karte -->';
if (mlJs && fs.existsSync(mlJs)) {
  const css = mlCss && fs.existsSync(mlCss) ? fs.readFileSync(mlCss, 'utf8') : '';
  ugradjenMaplibre =
    (css ? '<style>' + css + '</style>\n' : '') +
    '<script>' + fs.readFileSync(mlJs, 'utf8') + '<' + '/script>';
}

/* ==================================================================
 * Ugradjivanje stvarnih podataka   --podaci <folder>
 * ==================================================================
 * Bez ove opcije se nista ne menja: fajl racuna mrezu i seriju sam, u
 * pregledacu, generatorom sa fiksnim semenom. Zato jedan HTML radi bilo
 * gde — nema sta da se ucita.
 *
 * Sa ovom opcijom se u fajl ugradjuje stvarna serija, a generator ostaje
 * samo kao rezerva. Fajl i dalje ostaje jedan i dalje se otvara duplim
 * klikom — to je i cela poenta.
 *
 * ULAZ je folder u formatu koji generator/generisi.js vec pise:
 *
 *   tacke.csv   id,lon,lat,...          — citaju se prve tri kolone
 *   cene.bin    uint16 LE, mesec-major  — [mesec0: sve tacke][mesec1: ...]
 *   meta.json   broj_tacaka, broj_meseci, meseci[], napomena
 *
 * >>> OVDE SE PRIKLJUCUJE STVARNI IZVOD IZ RGZ-a <<<
 * Njihov izvod se ne cita ovde. Dovede se u ova tri fajla jednom skriptom
 * za konverziju, a ceo ostatak lanca ostaje nepromenjen — isti format koji
 * generisi.js proizvodi i na kome je sve vec isprobano.
 *
 * PAKOVANJE — jedan bafer, pa base64:
 *
 *   "RGZ1"       4 B     potpis, da se pokvaren blok odmah prepozna
 *   n            4 B     uint32 LE   broj tacaka
 *   M            4 B     uint32 LE   broj meseci
 *   lon[n]       4n B    int32 LE    stepeni x 1e6 (oko 11 cm tacnosti)
 *   lat[n]       4n B    int32 LE
 *   cene[n*M]    2nM B   uint16 LE   mesec-major, isto kao cene.bin
 *
 * Indeks se NE pakuje — racuna se u pregledacu kao odnos prema prvom
 * mesecu, pa se ista stvar ne drzi u fajlu dvaput.
 *
 * MERA: base64 je 33% veci od binarnog, ali je jedini nacin da blok
 * prezivi u HTML-u bez zasebnog fajla.
 *
 *   korak    tacaka     binarno   base64   ukupan HTML
 *   3 km      10.150     1,9 MB   2,6 MB    5,0 MB   udobno   <- izmereno
 *   1,5 km    40.568     7,7 MB  10,3 MB   12,8 MB   tesko ali radi
 *   0,5 km   365.017    69,6 MB  92,8 MB       —     trazi server
 * ================================================================== */

function spakujPodatke(folder) {
  const uz = (f) => path.join(folder, f);
  for (const f of ['meta.json', 'tacke.csv', 'cene.bin']) {
    if (!fs.existsSync(uz(f))) {
      throw new Error('--podaci: u folderu nedostaje ' + f + ':  ' + uz(f));
    }
  }

  const meta = JSON.parse(fs.readFileSync(uz('meta.json'), 'utf8'));
  const n = meta.broj_tacaka, M = meta.broj_meseci;
  if (!n || !M) throw new Error('--podaci: meta.json nema broj_tacaka / broj_meseci');
  if (!Array.isArray(meta.meseci) || meta.meseci.length !== M) {
    throw new Error('--podaci: meta.json nema spisak meseci duzine ' + M);
  }

  /* tacke.csv — id,lon,lat,...  Uzimaju se druga i treca kolona. */
  const lon = new Int32Array(n), lat = new Int32Array(n);
  {
    const redovi = fs.readFileSync(uz('tacke.csv'), 'utf8').split('\n');
    let k = 0;
    for (let i = 1; i < redovi.length && k < n; i++) {
      const red = redovi[i].trim();
      if (!red) continue;
      const c = red.split(',');
      const a = parseFloat(c[1]), b = parseFloat(c[2]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        throw new Error('--podaci: tacke.csv, red ' + (i + 1) + ' nema lon/lat');
      }
      lon[k] = Math.round(a * 1e6);
      lat[k] = Math.round(b * 1e6);
      k++;
    }
    if (k !== n) {
      throw new Error('--podaci: tacke.csv ima ' + k + ' tacaka, meta.json kaze ' + n);
    }
  }

  /* cene.bin — uint16 LE, mesec-major; preuzima se bajt u bajt. */
  const cene = fs.readFileSync(uz('cene.bin'));
  if (cene.length !== n * M * 2) {
    throw new Error('--podaci: cene.bin ima ' + cene.length + ' B, ocekivano ' + (n * M * 2));
  }

  const buf = Buffer.allocUnsafe(12 + n * 8 + n * M * 2);
  buf.write('RGZ1', 0, 'latin1');
  buf.writeUInt32LE(n, 4);
  buf.writeUInt32LE(M, 8);
  let o = 12;
  for (let i = 0; i < n; i++) { buf.writeInt32LE(lon[i], o); o += 4; }
  for (let i = 0; i < n; i++) { buf.writeInt32LE(lat[i], o); o += 4; }
  cene.copy(buf, o);

  /* Napomena putuje uz podatke: sto meta.json kaze o sebi, to prikaz ispise
     u ploci. Fajl tako nikad ne tvrdi nesto drugo nego sto zaista nosi. */
  const napomena = meta.napomena || '';

  const dekoder = [
    '(function () {',
    '  var B64 = "' + buf.toString('base64') + '";',
    '  var sirovo = atob(B64);',
    '  var bajti = new Uint8Array(sirovo.length);',
    '  for (var i = 0; i < sirovo.length; i++) bajti[i] = sirovo.charCodeAt(i);',
    '  var dv = new DataView(bajti.buffer);',
    '  if (String.fromCharCode(bajti[0], bajti[1], bajti[2], bajti[3]) !== "RGZ1") {',
    '    throw new Error("Ugradjeni podaci nisu u ocekivanom formatu");',
    '  }',
    '  var n = dv.getUint32(4, true), M = dv.getUint32(8, true);',
    '  var lon = new Float64Array(n), lat = new Float64Array(n), o = 12, k;',
    '  for (k = 0; k < n; k++) { lon[k] = dv.getInt32(o, true) / 1e6; o += 4; }',
    '  for (k = 0; k < n; k++) { lat[k] = dv.getInt32(o, true) / 1e6; o += 4; }',
    '  /* Cene se citaju pogledom na isti bafer, bez kopije. Pogled uzima',
    '     redosled bajtova procesora; svi danasnji pregledaci su little-endian,',
    '     a grana za obrnuti redosled stoji reda radi. Pomeraj 12 + 8n je uvek',
    '     paran, sto Uint16Array pogled i trazi. */',
    '  var LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1, cene;',
    '  if (LE) { cene = new Uint16Array(bajti.buffer, o, n * M); }',
    '  else {',
    '    cene = new Uint16Array(n * M);',
    '    for (k = 0; k < n * M; k++) cene[k] = dv.getUint16(o + k * 2, true);',
    '  }',
    '  window.PODACI = { n: n, M: M, lon: lon, lat: lat, cene: cene,',
    '    meseci: ' + JSON.stringify(meta.meseci) + ',',
    '    napomena: ' + JSON.stringify(napomena) + ' };',
    '})();'
  ].join('\n');

  return { kod: dekoder, n: n, M: M, napomena: napomena };
}

const podaciFolder = arg('podaci', null);
let podaciTag = '<!-- podaci se racunaju u pregledacu, generatorom (vidi --podaci) -->';
let podaciOpis = null;
if (podaciFolder) {
  podaciOpis = spakujPodatke(podaciFolder);
  podaciTag = '<script>' + podaciOpis.kod + '<' + '/script>';
}

/* ------------------------------------------------------------------
 * LICENSES.txt — napomene svih biblioteka koje putuju u fajlu.
 * ------------------------------------------------------------------
 * I MIT (deck.gl) i BSD-3-Clause (maplibre-gl) traze da uz raspodelu ide
 * i tekst licence sa nosiocem prava. Minifikovani bandli svoje zaglavlje
 * nose u sebi, ali se ono u 2,5 MB HTML-a ne moze naci, pa uz isporuku
 * ide i ovaj fajl. Treba da putuje zajedno sa prikazom.
 *
 * Nosilac prava se cita iz samog LICENSE fajla u paketu, a ne prepisuje
 * rukom — prepisan podatak zastari i pogresi (deck.gl nije OpenJS
 * Foundation nego Vis.gl contributors).
 */
{
  const deckVerzija = JSON.parse(fs.readFileSync(
    path.join(path.dirname(deckPut), 'package.json'), 'utf8')).version || '';

  let deckNosilac = 'Vis.gl contributors';
  const licencaPaketa = path.join(path.dirname(deckPut), 'LICENSE');
  if (fs.existsSync(licencaPaketa)) {
    const prva = fs.readFileSync(licencaPaketa, 'utf8').split('\n')[0].trim();
    if (prva) deckNosilac = prva.replace(/^Copyright\s*/i, '').replace(/\.$/, '');
  }

  const delovi = [
    'Napomene o licencama biblioteka ugradjenih u ovaj prikaz.',
    'Ovaj fajl treba da putuje zajedno sa HTML prikazom.',
    '',
    '--------------------------------------------------------------',
    'deck.gl ' + deckVerzija + ' — MIT',
    'Copyright ' + deckNosilac,
    'https://github.com/visgl/deck.gl/blob/master/LICENSE',
    ''
  ];

  if (mlJs && fs.existsSync(mlJs)) {
    delovi.push(
      '--------------------------------------------------------------',
      'maplibre-gl 4.7.1 — BSD-3-Clause',
      'Copyright (c) 2023, MapLibre contributors',
      'https://github.com/maplibre/maplibre-gl-js/blob/v4.7.1/LICENSE.txt',
      '');
  }

  if (licence) {
    delovi.push(
      '--------------------------------------------------------------',
      'Napomene biblioteka ugradjenih u deck.gl bandl,',
      'izdvojene iz dist.min.js:',
      '',
      licence,
      '');
  }

  delovi.push(
    '--------------------------------------------------------------',
    'Podloga karte nije ugradjena u fajl — stize sa CARTO servisa',
    '(basemaps.cartocdn.com, stil dark-matter). Nju ne pokriva nijedna',
    'licenca odavde: koristi se pod uslovima CARTO-a, koji traze da na',
    'karti ostanu vidljivi potpisi CARTO i OpenStreetMap.',
    'https://docs.carto.com/faqs/carto-basemaps',
    '');

  fs.writeFileSync(path.join(koren, 'LICENSES.txt'), delovi.join('\n'));
}

const telo = sablon
  .replace('<script>/*__PODACI__*/</script>', () => podaciTag)
  .replace('<!--__MAPLIBRE__-->', () => ugradjenMaplibre)
  .replace('/*__GENERATOR__*/', () => generatorZaWeb)
  .replace('/*__DECKGL__*/', () => deckKod)
  .replace('/*__APP__*/', () => app);

/* Samostalan dokument — bez deklaracije kodiranja cirilica se lomi kad se
   fajl otvori lokalno ili posluzi sa servera koji ne salje charset. */
const izlaz =
  '<!DOCTYPE html>\n<html lang="sr">\n<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  telo +
  '\n</html>\n';

const putIzlaza = path.join(koren, 'hexagon-layer.html');
fs.writeFileSync(putIzlaza, izlaz);

/*
 * Druga varijanta: deck.gl se povlaci sa unpkg-a umesto da se ugradjuje,
 * isto kako to rade zvanicni deck.gl "scripting" primeri. Fajl je oko 30 KB
 * i lakse se poredi sa primerom na deck.gl sajtu, ali trazi internet.
 */
const verzija = JSON.parse(
  fs.readFileSync(path.join(path.dirname(deckPut), 'package.json'), 'utf8')).version;

const teloCdn = sablon
  .replace('<script>/*__PODACI__*/</script>', () => podaciTag)
  .replace('<!--__MAPLIBRE__-->', () => MAPLIBRE_TAGOVI)
  .replace('<script>/*__GENERATOR__*/</script>', () => '<script>' + generatorZaWeb + '</script>')
  .replace('<script>/*__DECKGL__*/</script>',
    () => '<script src="https://unpkg.com/deck.gl@' + verzija + '/dist.min.js"></script>')
  .replace('<script>/*__APP__*/</script>', () => '<script>' + app + '</script>');

const izlazCdn =
  '<!DOCTYPE html>\n<html lang="sr">\n<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  teloCdn +
  '\n</html>\n';

const putCdn = path.join(koren, 'hexagon-layer-cdn.html');
fs.writeFileSync(putCdn, izlazCdn);

/* ==================================================================
 * Folder za predaju:  ../isporuka
 * ==================================================================
 * Ono sto se nekome salje. Samo gotovi HTML fajlovi i licence — bez
 * skripti, bez sablona, bez generatorskih CSV-ova. Svaki se otvara duplim
 * klikom i ne trazi nista pored sebe.
 *
 * Pise ga build, a ne ruka, da kopija nikad ne ostane starija od izvora.
 * CEO folder je izveden i ne cuva se u git-u — slobodno se brise. Izvor
 * pisanog teksta je prototip/procitaj-isporuka.md, koji se ovde prepisuje
 * kao PROCITAJ.md.
 */
const isporuka = path.join(koren, '..', 'isporuka');
fs.mkdirSync(isporuka, { recursive: true });

const uIsporuku = [
  ['hexagon-layer.html', 'cenovna-povrsina-3d.html'],
  /* Ova strana se drzi samo lokalno i nije u repozitorijumu; ako je nema,
     petlja je preskace i isporuka se napuni bez nje. */
  ['cenovna-povrsina.html', 'poredjenje-prikaza.html'],
  ['LICENSES.txt', 'LICENSES.txt'],
  ['procitaj-isporuka.md', 'PROCITAJ.md']
];
for (const [odakle, dokle] of uIsporuku) {
  const izvor = path.join(koren, odakle);
  if (!fs.existsSync(izvor)) continue;
  fs.copyFileSync(izvor, path.join(isporuka, dokle));
}

const mb = (s) => (Buffer.byteLength(s) / 1048576).toFixed(2) + ' MB';
console.log('deck.gl bandl : ' + deckPut);
console.log('  deck.gl     ' + mb(deckKod));
console.log('  generator   ' + mb(generatorZaWeb));
if (podaciOpis) {
  console.log('  podaci      ' + mb(podaciTag) +
    '   (' + podaciOpis.n.toLocaleString('sr-RS') + ' tacaka x ' +
    podaciOpis.M + ' meseci)');
  console.log('  napomena    ' + (podaciOpis.napomena || '(nema)'));
}
console.log('  aplikacija  ' + mb(app));
console.log('  ------------------------');
console.log('  ukupno      ' + mb(izlaz) + '   -> ' + putIzlaza);
console.log('  CDN verzija ' + mb(izlazCdn) + '   -> ' + putCdn);
console.log('  isporuka    ' + isporuka);
if (Buffer.byteLength(izlaz) > 16 * 1048576) {
  console.log('\n  UPOZORENJE: preko 16 MB, Artifact to nece primiti.');
}
