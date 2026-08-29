/*
 * generisi.js — CLI: pravi mrezu tacaka nad Srbijom i mesecne cene 2019-2026.
 *
 *   node generisi.js --korak 0.5 --izlaz ./podaci
 *
 * Izlaz:
 *   tacke.csv        id, lon, lat, bazna_cena, faktor_rasta
 *   cene.bin         uint16, redosled: mesec po mesec, unutar meseca po id
 *   meta.json        opis formata, dimenzije, opsezi
 *   uzorak_long.csv  prvih nekoliko hiljada redova u long formatu (shema)
 */

const fs = require('fs');
const path = require('path');
const G = require('./generator.js');

const arg = (ime, podr) => {
  const i = process.argv.indexOf('--' + ime);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : podr;
};

const korak = parseFloat(arg('korak', '0.5'));
const izlaz = arg('izlaz', './podaci');
const maxLong = parseInt(arg('uzorak', '5000'), 10);
const rezim = arg('rezim', 'opseg');   // 'opseg' | 'realno'

fs.mkdirSync(izlaz, { recursive: true });

console.log('Korak mreze: ' + korak + ' km');
let t0 = Date.now();

const mreza = G.napraviMrezu(korak);
console.log('Tacaka u granici: ' + mreza.n.toLocaleString('sr-RS') +
  '  (okvir ' + mreza.nx + ' x ' + mreza.ny + ')  ' + (Date.now() - t0) + ' ms');

t0 = Date.now();
const serija = G.napraviSeriju(mreza, { rezim });
console.log('Rezim: ' + rezim + '  (bazna skala 01/2019: 1000 - ' + Math.round(serija.baznaMax) + ' EUR/m2)');
const M = serija.brojMeseci;
console.log('Meseci: ' + M + '  (' + serija.meseci[0] + ' .. ' + serija.meseci[M - 1] + ')');

// ---- tacke.csv ----
{
  fs.writeFileSync(path.join(izlaz, 'tacke.csv'), '');   // prepisi ako vec postoji
  const delovi = ['id,lon,lat,bazna_cena_eur_m2,faktor_rasta\n'];
  for (let k = 0; k < mreza.n; k++) {
    delovi.push(k + ',' + mreza.lon[k].toFixed(6) + ',' + mreza.lat[k].toFixed(6) +
      ',' + serija.baza[k].toFixed(1) + ',' + serija.rast[k].toFixed(4) + '\n');
    if (delovi.length > 20000) {
      fs.appendFileSync(path.join(izlaz, 'tacke.csv'), delovi.join(''));
      delovi.length = 0;
    }
  }
  if (delovi.length) fs.appendFileSync(path.join(izlaz, 'tacke.csv'), delovi.join(''));
}

// ---- cene.bin (uint16, mesec-major) + uzorak u long formatu ----
const tok = fs.createWriteStream(path.join(izlaz, 'cene.bin'));
const longRedovi = ['id,mesec,cena_eur_m2,indeks\n'];
let globalMin = Infinity, globalMax = -Infinity;
let indeksMin = Infinity, indeksMax = -Infinity;

t0 = Date.now();
for (let t = 0; t < M; t++) {
  const { cene, indeks, oznaka } = serija.sledeciMesec(t);
  const buf = Buffer.allocUnsafe(mreza.n * 2);
  for (let k = 0; k < mreza.n; k++) {
    const v = Math.round(cene[k]);
    buf.writeUInt16LE(v, k * 2);
    if (v < globalMin) globalMin = v;
    if (v > globalMax) globalMax = v;
    if (t === M - 1) {
      if (indeks[k] < indeksMin) indeksMin = indeks[k];
      if (indeks[k] > indeksMax) indeksMax = indeks[k];
    }
  }
  tok.write(buf);
  if (longRedovi.length < maxLong) {
    for (let k = 0; k < mreza.n && longRedovi.length < maxLong; k++) {
      longRedovi.push(k + ',' + oznaka + ',' + Math.round(cene[k]) + ',' + indeks[k].toFixed(4) + '\n');
    }
  }
  if ((t + 1) % 24 === 0) console.log('  ...' + (t + 1) + '/' + M + ' meseci');
}
tok.end();

tok.on('close', () => {
  fs.writeFileSync(path.join(izlaz, 'uzorak_long.csv'), longRedovi.join(''));

  const meta = {
    napomena: 'SINTETICKI PODACI - ne koristiti za procenu vrednosti.',
    korak_km: korak,
    /* Geometrija celije. Tacke leze na sestougaonoj resetki, pa prikaz crta
       jednu celiju po tacki i ne mora nista da preracunava. Poluprecnik je
       rastojanje od sredista do temena; celije se slazu bez rupa. */
    celija: {
      oblik: 'sestougao',
      poluprecnik_m: Math.round(mreza.poluprecnikKm * 1000),
      razmak_vrsta_m: Math.round(1.5 * mreza.poluprecnikKm * 1000),
      razmak_kolona_m: Math.round(Math.sqrt(3) * mreza.poluprecnikKm * 1000),
      ugao: 30,
      napomena: 'teme nagore (deck.gl ColumnLayer, angle 30); svaka vrsta lezi ' +
                'na jednoj paraleli, razmak kolona se racuna za tu paralelu'
    },
    broj_tacaka: mreza.n,
    broj_meseci: M,
    prvi_mesec: serija.meseci[0],
    poslednji_mesec: serija.meseci[M - 1],
    meseci: serija.meseci,
    okvir: {
      min_lon: mreza.minLon, max_lon: mreza.maxLon,
      min_lat: mreza.minLat, max_lat: mreza.maxLat
    },
    cene_bin: {
      tip: 'uint16 little-endian',
      raspored: 'mesec-major: [mesec0: sve tacke][mesec1: sve tacke]...',
      duzina_bajtova: mreza.n * M * 2,
      opseg_vrednosti: [globalMin, globalMax]
    },
    indeks: {
      objasnjenje: 'indeks = 1.0 u ' + serija.meseci[0],
      opseg_na_kraju: [Number(indeksMin.toFixed(3)), Number(indeksMax.toFixed(3))]
    },
    granica: 'Natural Earth 1:10m Admin 0 (SRB + KOS), uproscena na ~220 m; za stvarnu upotrebu ide zvanicna granica iz GeoSrbije'
  };
  fs.writeFileSync(path.join(izlaz, 'meta.json'), JSON.stringify(meta, null, 2));

  const mb = (b) => (b / 1e6).toFixed(1) + ' MB';
  const vel = (f) => fs.statSync(path.join(izlaz, f)).size;
  console.log('\nGotovo za ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  console.log('  tacke.csv       ' + mb(vel('tacke.csv')));
  console.log('  cene.bin        ' + mb(vel('cene.bin')) +
    '   (' + (mreza.n * M).toLocaleString('sr-RS') + ' vrednosti)');
  console.log('  uzorak_long.csv ' + mb(vel('uzorak_long.csv')));
  console.log('  cene: ' + globalMin + ' - ' + globalMax + ' EUR/m2');
  console.log('  indeks u ' + serija.meseci[M - 1] + ': ' + indeksMin.toFixed(2) + ' - ' + indeksMax.toFixed(2));
  const pct = (100 * serija.brojOdsecenih / (mreza.n * M)).toFixed(2);
  console.log('  odseceno na granicu opsega: ' + serija.brojOdsecenih.toLocaleString('sr-RS') + ' (' + pct + '%)');
  console.log('\n  CEO long CSV bi imao ~' +
    ((mreza.n * M * 26) / 1e6).toFixed(0) + ' MB');
});
