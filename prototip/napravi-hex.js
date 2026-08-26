/*
 * napravi-hex.js — sastavlja samostalan hexagon-layer.html.
 *
 *   node napravi-hex.js --deck <putanja/do/dist.min.js>
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
      '/* Napomene o licencama ugradjenih biblioteka: vidi deck.gl-LICENSES.txt */' +
      deckKod.slice(i1 + 2);
    fs.writeFileSync(path.join(koren, 'deck.gl-LICENSES.txt'),
      'deck.gl ' + (JSON.parse(fs.readFileSync(
        path.join(path.dirname(deckPut), 'package.json'), 'utf8').toString()).version || '') +
      ' — MIT (Copyright OpenJS Foundation and contributors)\n' +
      'https://github.com/visgl/deck.gl/blob/master/LICENSE\n\n' +
      'Napomene ugradjenih biblioteka, izdvojene iz dist.min.js:\n\n' + licence + '\n');
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

const telo = sablon
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

const mb = (s) => (Buffer.byteLength(s) / 1048576).toFixed(2) + ' MB';
console.log('deck.gl bandl : ' + deckPut);
console.log('  deck.gl     ' + mb(deckKod));
console.log('  generator   ' + mb(generatorZaWeb));
console.log('  aplikacija  ' + mb(app));
console.log('  ------------------------');
console.log('  ukupno      ' + mb(izlaz) + '   -> ' + putIzlaza);
console.log('  CDN verzija ' + mb(izlazCdn) + '   -> ' + putCdn);
if (Buffer.byteLength(izlaz) > 16 * 1048576) {
  console.log('\n  UPOZORENJE: preko 16 MB, Artifact to nece primiti.');
}
