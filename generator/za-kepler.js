/*
 * za-kepler.js — pravi CSV koji se moze prevuci direktno u kepler.gl.
 *
 *   node za-kepler.js --korak 3 --izlaz ./kepler_3km.csv
 *
 * Kolone: lat, lon, vreme, cena_eur_m2, indeks, godina
 *   vreme  — ISO datum, kepler.gl ga prepoznaje i sam ponudi vremenski filter
 *   indeks — odnos prema 01/2019, za prikaz rasta umesto nivoa
 *
 * kepler.gl radi u pregledacu, podaci ne odlaze na server.
 * Ogranicenje fajla u Chrome-u je 250 MB.
 */

const fs = require('fs');
const G = require('./generator.js');

const arg = (ime, podr) => {
  const i = process.argv.indexOf('--' + ime);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : podr;
};

const korak = parseFloat(arg('korak', '3'));
const izlaz = arg('izlaz', './kepler_' + korak + 'km.csv');
const svakiNti = parseInt(arg('mesec-korak', '1'), 10);   // 3 = kvartalno

const mreza = G.napraviMrezu(korak);
const serija = G.napraviSeriju(mreza);
const M = serija.brojMeseci;

const redova = mreza.n * Math.ceil(M / svakiNti);
console.log('Korak: ' + korak + ' km  ·  tacaka: ' + mreza.n.toLocaleString('sr-RS'));
console.log('Meseci: ' + Math.ceil(M / svakiNti) + ' od ' + M +
            (svakiNti > 1 ? '  (svaki ' + svakiNti + '. mesec)' : ''));
console.log('Redova u CSV-u: ' + redova.toLocaleString('sr-RS'));

const tok = fs.createWriteStream(izlaz);
tok.write('lat,lon,vreme,cena_eur_m2,indeks,godina\n');

let bafer = [];
for (let t = 0; t < M; t++) {
  const { cene, indeks, oznaka } = serija.sledeciMesec(t);
  if (t % svakiNti !== 0) continue;
  const datum = oznaka + '-01';
  const godina = oznaka.slice(0, 4);
  for (let k = 0; k < mreza.n; k++) {
    bafer.push(
      mreza.lat[k].toFixed(4) + ',' + mreza.lon[k].toFixed(4) + ',' +
      datum + ',' + Math.round(cene[k]) + ',' + indeks[k].toFixed(3) + ',' + godina + '\n'
    );
    if (bafer.length >= 50000) { tok.write(bafer.join('')); bafer = []; }
  }
}
if (bafer.length) tok.write(bafer.join(''));
tok.end();

tok.on('close', () => {
  const mb = fs.statSync(izlaz).size / 1048576;
  console.log('\n' + izlaz + '  ' + mb.toFixed(1) + ' MB');
  console.log(mb > 250
    ? '  UPOZORENJE: preko 250 MB — kepler.gl u Chrome-u ovo nece ucitati.'
    : '  Staje u ogranicenje kepler.gl-a (250 MB u Chrome-u).');
  console.log('\nU kepler.gl: prevuci fajl, dodaj Point layer (lat/lon),');
  console.log('boju veži za cena_eur_m2 ili indeks, pa dodaj filter na kolonu "vreme".');
});
