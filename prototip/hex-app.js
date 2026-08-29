/* deck.gl HexagonLayer над синтетичком ценовном површином Србије.
   Висина шестоугла = индекс (01/2019 = 1), боја = цена по m².

   Палета, материјал, светло и угао камере преузети су из званичног
   deck.gl примера 3d-heatmap (deck.gl/examples/hexagon-layer), да би
   приказ изгледао исто. Генератор долази из generator/generator.js. */
"use strict";

/* ---------- видљиво пријављивање грешака ----------
   Без овога свака грешка нестане у конзоли и страница само „не ради“.
   Сваки квар се исписује преко екрана, да се одмах види шта је. */

let brojGresaka = 0;

function prijavi(sta, greska, mesto) {
  const p = document.getElementById("greska");
  if (!p) return;
  if (++brojGresaka > 8) return;          // не затрпавај екран истом грешком

  const poruka = greska && greska.message ? greska.message : String(greska);
  const stek = greska && greska.stack
    ? String(greska.stack).split("\n").slice(1, 3).join("\n")
    : (mesto || "");

  const bezbedno = (s) => String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  p.style.display = "block";
  p.innerHTML +=
    "<b>" + bezbedno(sta) + "</b><br>" + bezbedno(poruka) +
    (stek ? '<br><span style="opacity:.7;font-size:11px">' +
            bezbedno(stek) + "</span>" : "") + "<br><br>";

  const u = document.getElementById("ucitavanje");
  if (u) u.remove();
}

window.addEventListener("error", e =>
  prijavi("Грешка у скрипти", e.error || e.message,
          e.filename ? e.filename + ":" + e.lineno + ":" + e.colno : ""));
window.addEventListener("unhandledrejection", e => prijavi("Неухваћена грешка", e.reason));

if (typeof deck === "undefined") {
  prijavi("deck.gl није учитан",
    "Библиотека није доступна. Ако сте отворили CDN варијанту, " +
    "мрежа вероватно не пропушта unpkg.com. Отворите hexagon-layer.html, " +
    "у њој је deck.gl уграђен у сам фајл.");
  throw new Error("deck.gl nije ucitan");
}

const { DeckGL, HexagonLayer, PathLayer,
        LightingEffect, AmbientLight, PointLight } = deck;

const KORAK_KM = 1.5;

/* Стварни подаци, ако су уграђени у фајл (napravi-hex.js --podaci).
   Кад их нема — а подразумевано их нема — мрежа и серија се рачунају
   генератором, тачно као досад.

   Уграђени блок носи само податак: спискове месеци и напомену одмах, а
   координате и цене спаковане у base64. Распакивање је ниже, у raspakuj(). */
const PAKET = (typeof window !== "undefined" && window.PODACI_PAKET) || null;
let PODACI = null;

const MESECI = PAKET ? PAKET.meseci : G.oznakeMeseci();
const M = MESECI.length;

const CENA_MIN = 1000, CENA_MAX = 2700;
const IND_MIN = 1.0,  IND_MAX = 2.2;

/* Иста палета као у deck.gl примеру */
const PALETA = [
  [  1, 152, 189],
  [ 73, 227, 206],
  [216, 254, 181],
  [254, 237, 177],
  [254, 173,  84],
  [209,  55,  78]
];

/* Исти материјал као у примеру */
const MATERIJAL = {
  ambient: 0.64,
  diffuse: 0.6,
  shininess: 32,
  specularColor: [51, 51, 51]
};

let D = null, tacke = null, vidljive = null, t = M - 1, animacija = null;

/* Удео мреже који се приказује, по мери насељености.
   На 100% приказ је потпуно попуњен — јер је мрежа правилна и свака
   ћелија унутар границе има вредност. Стварни подаци о становима
   постоје само тамо где има зграда, па имају празнине. Овај клизач
   служи да се види како ће приказ изгледати кад дође прави податак. */
let naseljenoUdeo = 100;
let poredak = null;
let poluprecnik = 2000, pokrivenost = 0.7, percentil = 100;

/* Дијагностика (?dijagnostika=1). Подразумевано искључена и тада не мења
   ниједну вредност — приказ ради тачно као да је нема. */
let dijagnostika = false;
let pikovanje = true;          // pickable на слоју шестоуглова
let visinaOpseg = 3000;        // горња граница elevationRange
let prelazi = true;            // transitions.elevationScale

/* Почињемо спљоштено па подижемо — тако се шестоуглови сваки пут „израсту“.
   transitions.elevationScale анимира само промену вредности, па ако одмах
   цртамо са коначном висином ефекта нема. Исто ради и deck.gl пример:
   elevationScale: data && data.length ? 50 : 0 */
let VISINA_ZADATA = 50;
let visinaSkala = 0;

/* ---------- подешавања из адресе ----------
   Адреса може да носи подешавања, па се дели готов поглед:
     hexagon-layer.html?naseljeno=10&mesec=2024-06&precnik=4000
   Ради и кад се фајл отвори двокликом, преко file:// адресе. */

function procitajParametre() {
  let p;
  try { p = new URLSearchParams(location.search); } catch (e) { return; }
  if (![...p.keys()].length) return;

  const broj = (ime, najmanje, najvise) => {
    if (!p.has(ime)) return null;
    const v = parseFloat(p.get(ime).replace(",", "."));
    return Number.isFinite(v) ? Math.min(najvise, Math.max(najmanje, v)) : null;
  };
  const postavi = (id, v, ispis) => {
    const el = document.getElementById(id);
    if (el) el.value = v;
    const iz = document.getElementById(id + "-v");
    if (iz) iz.textContent = ispis;
  };

  let v;
  if ((v = broj("naseljeno", 3, 100)) !== null) { naseljenoUdeo = v; postavi("naseljeno", v, v + " %"); }
  if ((v = broj("precnik", 500, 20000)) !== null) { poluprecnik = v; postavi("radijus", v, v); }
  if ((v = broj("pokrivenost", 0, 1)) !== null) { pokrivenost = v; postavi("pokrivenost", v, v.toFixed(2).replace(".", ",")); }
  if ((v = broj("percentil", 80, 100)) !== null) { percentil = v; postavi("percentil", v, v); }
  if ((v = broj("visina", 5, 220)) !== null) { VISINA_ZADATA = v; }

  if (p.get("dijagnostika") === "1") dijagnostika = true;

  if (p.has("mesec")) {
    const m = p.get("mesec");
    const i = MESECI.indexOf(m);
    t = i > -1 ? i : Math.min(M - 1, Math.max(0, parseInt(m, 10) || M - 1));
  }
}

/* ---------- подаци ---------- */

/* Мрежа и серија из генератора — подразумевани пут. Не тражи ниједан улаз. */
function izGeneratora() {
  const mreza = G.napraviMrezu(KORAK_KM);
  const serija = G.napraviSeriju(mreza);
  const n = mreza.n;
  const cene = new Uint16Array(n * M);
  const indeks = new Float32Array(n * M);
  for (let i = 0; i < M; i++) {
    const r = serija.sledeciMesec(i);
    for (let k = 0; k < n; k++) {
      cene[i * n + k] = Math.round(r.cene[k]);
      indeks[i * n + k] = r.indeks[k];
    }
  }
  return { mreza, cene, indeks };
}

/* ---------- распакивање уграђеног блока ----------
   Облик записа описан је у napravi-hex.js, изнад spakujPodatke — тамо се и
   пише. Гзип скида DecompressionStream, који прегледач већ има, па за ово
   не треба ниједна спољна библиотека.

   Цео посао је двоструко јефтинији него што изгледа: блок је спакован
   тако да се цене после првог месеца чувају као разлика према претходном,
   а разлика од неколико евра стаје у један бајт уместо у два. */

async function raspakuj(paket) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "Прегледач нема DecompressionStream, па уграђени подаци не могу да се " +
      "распакују. Треба Chrome или Edge 80+, Firefox 113+, Safari 16.4+.");
  }

  const tekst = atob(paket.b64);
  const spakovano = new Uint8Array(tekst.length);
  for (let i = 0; i < tekst.length; i++) spakovano[i] = tekst.charCodeAt(i);

  const tok = new Blob([spakovano]).stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const bajti = new Uint8Array(await new Response(tok).arrayBuffer());

  const dv = new DataView(bajti.buffer, bajti.byteOffset, bajti.byteLength);
  const potpis = String.fromCharCode(bajti[0], bajti[1], bajti[2], bajti[3]);
  if (potpis !== "RGZ2") {
    throw new Error("Уграђени подаци нису у очекиваном облику (потпис „" + potpis + "“)");
  }

  const n = dv.getUint32(4, true);
  const brMeseci = dv.getUint32(8, true);
  const kod = dv.getUint8(12);

  const lon = new Float64Array(n), lat = new Float64Array(n);
  let o = 16, k;
  for (k = 0; k < n; k++) { lon[k] = dv.getInt32(o, true) / 1e6; o += 4; }
  for (k = 0; k < n; k++) { lat[k] = dv.getInt32(o, true) / 1e6; o += 4; }

  /* Померај 16 + 8n је увек паран, што Uint16Array поглед и тражи. Редослед
     бајтова се проверава реда ради — сви данашњи прегледачи су little-endian. */
  const LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  let cene;

  if (kod === 0) {
    if (LE) {
      cene = new Uint16Array(bajti.buffer, bajti.byteOffset + o, n * brMeseci);
    } else {
      cene = new Uint16Array(n * brMeseci);
      for (let i = 0; i < n * brMeseci; i++) cene[i] = dv.getUint16(o + i * 2, true);
    }
  } else if (kod === 1) {
    cene = new Uint16Array(n * brMeseci);
    for (k = 0; k < n; k++) { cene[k] = dv.getUint16(o, true); o += 2; }
    for (let i = 1; i < brMeseci; i++) {
      const preth = (i - 1) * n, tek = i * n;
      for (k = 0; k < n; k++) cene[tek + k] = (cene[preth + k] + dv.getInt8(o++)) & 0xffff;
    }
  } else {
    throw new Error("Непознат код паковања у уграђеним подацима: " + kod);
  }

  if (brMeseci !== paket.meseci.length) {
    throw new Error("Уграђени подаци носе " + brMeseci + " месеци, а списак " +
                    "месеци има " + paket.meseci.length);
  }

  return { n: n, M: brMeseci, lon: lon, lat: lat, cene: cene,
           meseci: paket.meseci, napomena: paket.napomena };
}

/* Уграђени стварни подаци. Носе тачке и цене; индекс се рачуна овде, као
   однос према првом месецу, да се у фајлу не држи двапут иста ствар. */
function izUgradjenih() {
  const n = PODACI.n;
  const mreza = { n, lon: PODACI.lon, lat: PODACI.lat };
  const cene = PODACI.cene;
  const indeks = new Float32Array(n * M);
  for (let k = 0; k < n; k++) {
    const osnova = cene[k];
    for (let i = 0; i < M; i++) {
      indeks[i * n + k] = osnova > 0 ? cene[i * n + k] / osnova : 1;
    }
  }
  return { mreza, cene, indeks };
}

function pripremi() {
  const { mreza, cene, indeks } = PODACI ? izUgradjenih() : izGeneratora();
  const n = mreza.n;
  D = { mreza, n, cene, indeks };

  tacke = new Array(n);
  for (let k = 0; k < n; k++) {
    tacke[k] = { position: [mreza.lon[k], mreza.lat[k]], cena: 0, indeks: 1 };
  }

  /* Груба мера насељености: близина градова плус ретка расута села.
     У стварном послу ово замењује слој зграда или грађевинско подручје. */
  const sumSela = G.napraviSum(4242, 3, 40);
  const skor = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const [x, y] = G.lonLatUKm(mreza.lon[k], mreza.lat[k]);
    let grad = 0;
    for (const red of G.GRADOVI) {
      const [cx, cy] = G.lonLatUKm(red[1], red[2]);
      grad = Math.max(grad, red[3] * Math.exp(-Math.hypot(x - cx, y - cy) / (red[4] * 0.5)));
    }
    skor[k] = grad + 0.6 * Math.pow(sumSela(x, y), 3);
  }
  poredak = Array.from({ length: n }, (_, k) => k).sort((a, b) => skor[b] - skor[a]);

  primeniMesec(t);
  primeniNaseljenost();
}

/* Задржава само најнасељенији део мреже. */
function primeniNaseljenost() {
  if (naseljenoUdeo >= 100) { vidljive = tacke; }
  else {
    const koliko = Math.max(1, Math.round(D.n * naseljenoUdeo / 100));
    vidljive = new Array(koliko);
    for (let i = 0; i < koliko; i++) vidljive[i] = tacke[poredak[i]];
  }
  const n = document.getElementById("prikazano");
  if (n) n.textContent = vidljive.length.toLocaleString("sr-RS");
}

function primeniMesec(i) {
  const off = i * D.n;
  for (let k = 0; k < D.n; k++) {
    tacke[k].cena = D.cene[off + k];
    tacke[k].indeks = D.indeks[off + k];
  }
}

/* ---------- слојеви ---------- */

const putanjaGranice = [...G.GRANICA_PRIBLIZNA, G.GRANICA_PRIBLIZNA[0]];

function slojevi() {
  return [
    new PathLayer({
      id: "granica",
      data: [{ path: putanjaGranice }],
      getPath: d => d.path,
      getColor: [86, 96, 102, 200],
      getWidth: 1,
      widthUnits: "pixels",
      parameters: { depthTest: false }
    }),
    new HexagonLayer({
      id: "hex",
      data: vidljive,
      getPosition: d => d.position,

      gpuAggregation: true,
      radius: poluprecnik,
      coverage: pokrivenost,
      upperPercentile: percentil,
      extruded: true,

      /* боја носи цену */
      colorAggregation: "MEAN",
      getColorWeight: d => d.cena,
      colorRange: PALETA,
      colorDomain: [CENA_MIN, CENA_MAX],

      /* висина носи индекс — исти опсег и размера као у примеру */
      elevationAggregation: "MEAN",
      getElevationWeight: d => d.indeks,
      elevationDomain: [IND_MIN, IND_MAX],
      elevationRange: [0, visinaOpseg],
      elevationScale: visinaSkala,

      material: MATERIJAL,
      pickable: pikovanje,
      updateTriggers: {
        getColorWeight: t,
        getElevationWeight: t
      },
      dataComparator: (a, b) => a === b,
      transitions: prelazi ? { elevationScale: 3000 } : {}
    })
  ];
}

/* ---------- светло ---------- */

/* Као у примеру: једно амбијентално и два тачкаста светла,
   само су положаји померени изнад Србије уместо изнад Британије. */
const svetlo = new LightingEffect({
  ambientLight: new AmbientLight({ color: [255, 255, 255], intensity: 1.0 }),
  pointLight1: new PointLight({
    color: [255, 255, 255], intensity: 0.8, position: [19.9, 42.6, 80000]
  }),
  pointLight2: new PointLight({
    color: [255, 255, 255], intensity: 0.8, position: [21.6, 45.6, 8000]
  })
});

/* ---------- deck ---------- */

/* Нагиб и заокрет исти као у примеру; средиште и зум подешени за Србију. */
const POCETNI_POGLED = {
  longitude: 20.85, latitude: 43.55, zoom: 6.6,
  minZoom: 5, maxZoom: 15, pitch: 40.5, bearing: -27
};

/* Иста подлога коју користи deck.gl пример. Тражи мрежу — тајлови стижу
   са tiles.basemaps.cartocdn.com. Ако не прође, приказ ради и без ње. */
const PODLOGA = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";
const imaPodlogu = typeof maplibregl !== "undefined";
if (!imaPodlogu) {
  const n = document.getElementById("stanje-podloge");
  if (n) n.textContent = "подлога карте: библиотека није учитана";
}

const dek = new DeckGL(Object.assign({
  container: "platno",

  /* Не држати поглед као контролисано стање: тада свако померање мора
     ручно да се врати кроз setProps, а ако то омане, ротација и зум
     престају да раде. Пример користи initialViewState — и ми тако. */
  initialViewState: POCETNI_POGLED,
  controller: true,

  effects: [svetlo],
  layers: [],
}, imaPodlogu ? { map: maplibregl, mapStyle: PODLOGA } : {}, {
  /* Враћамо обичан текст, не HTML — тада deck.gl примени свој
     подразумевани изглед облачића, исти као на њиховој страници.

     Пажња на облик објекта у deck.gl 9: има col, row, colorValue,
     elevationValue и count. Нема `points` (то је само уз агрегацију на
     процесору), а `position` уме да да бесмислене вредности — и њихов
     пример га зато штити са Number.isFinite. Поузданија је info.coordinate. */
  getTooltip: (info) => {
    try {
      const o = info && info.object;
      if (!o) return null;
      const k = info.coordinate;
      const cena = Number.isFinite(o.colorValue) ? Math.round(o.colorValue) : null;
      const ind = Number.isFinite(o.elevationValue) ? o.elevationValue : null;

      return [
        k && k.length === 2 ? "ширина: " + k[1].toFixed(6) : null,
        k && k.length === 2 ? "дужина: " + k[0].toFixed(6) : null,
        cena !== null ? cena + " €/m²" : null,
        ind !== null ? "индекс " + ind.toFixed(3).replace(".", ",") +
                       "  (+" + Math.round((ind - 1) * 100) + " %)" : null,
        Number.isFinite(o.count) ? o.count + " тачака мреже" : null
      ].filter(Boolean).join("\n");
    } catch (e) {
      prijavi("Облачић", e);
      return null;
    }
  }
}));

/* ---------- управљање ---------- */

function osvezi() {
  dek.setProps({ layers: slojevi() });
  document.getElementById("mesec").textContent = MESECI[t];
  const off = t * D.n;
  let zbir = 0, imax = 0;
  for (let k = 0; k < D.n; k++) {
    zbir += D.cene[off + k];
    if (D.indeks[off + k] > imax) imax = D.indeks[off + k];
  }
  document.getElementById("prosek").textContent = Math.round(zbir / D.n) + " €";
  document.getElementById("najveci").textContent =
    "+" + Math.round((imax - 1) * 100) + " %";
}

function veziKlizac(id, naStanje, prikaz) {
  const el = document.getElementById(id);
  const izlaz = document.getElementById(id + "-v");
  el.addEventListener("input", e => {
    naStanje(+e.target.value);
    izlaz.textContent = prikaz(+e.target.value);
    osvezi();
  });
  izlaz.textContent = prikaz(+el.value);
}

veziKlizac("radijus",     v => poluprecnik = v,  v => v);
veziKlizac("pokrivenost", v => pokrivenost = v,  v => v.toFixed(2).replace(".", ","));
veziKlizac("percentil",   v => percentil = v,    v => v);
veziKlizac("visina",      v => visinaSkala = v,  v => v);
veziKlizac("naseljeno",   v => { naseljenoUdeo = v; primeniNaseljenost(); }, v => v + " %");

document.getElementById("klizac").addEventListener("input", e => {
  t = +e.target.value; primeniMesec(t); osvezi();
});

const dugme = document.getElementById("pusti");
dugme.addEventListener("click", () => {
  if (animacija) {
    clearInterval(animacija); animacija = null;
    dugme.textContent = "▶ Пусти"; dugme.classList.remove("radi");
  } else {
    dugme.textContent = "⏸ Стани"; dugme.classList.add("radi");
    animacija = setInterval(() => {
      t = (t + 1) % M;
      document.getElementById("klizac").value = t;
      primeniMesec(t); osvezi();
    }, 130);
  }
});

/* ---------- дијагностика (?dijagnostika=1) ----------
   Мери зашто приказ штуца. Без параметра се ништа од овога не извршава,
   па испоручени фајл остаје непромењен.

   fps и времена долазе из deck.gl-овог `metrics`, који их сам скупља.
   Прекидачи гађају два најскупља осумњичена: пиковање (свако померање
   миша исцрта сцену још једном у помоћни бафер, па чита назад са графичке)
   и висину стубова (висок стуб покрива много пиксела, а сваки преклопљени
   пиксел се сенчи изнова). */

function pokreniDijagnostiku() {
  const box = document.createElement("div");
  box.id = "dijagnostika";
  box.style.cssText =
    "position:fixed;left:12px;top:12px;z-index:70;background:rgba(0,0,0,.86);" +
    "color:#8f8;font:11px/1.5 monospace;padding:10px 12px;min-width:210px;" +
    "border-left:3px solid #6c6";
  box.innerHTML =
    '<b style="color:#cfc">МЕРЕЊЕ</b><br><span id="dg-brojke">…</span><hr' +
    ' style="border:0;border-top:1px solid #363;margin:8px 0">' +
    '<label><input type="checkbox" id="dg-pik" checked> пиковање</label><br>' +
    '<label><input type="checkbox" id="dg-prelaz" checked> прелази</label><br>' +
    '<label>висина стуба <select id="dg-vis">' +
    '<option value="3000">3000 (сада)</option>' +
    '<option value="1000">1000 (као пример)</option>' +
    '<option value="300">300 (ниско)</option></select></label>';
  document.body.appendChild(box);

  const brojke = box.querySelector("#dg-brojke");
  setInterval(() => {
    const m = dek.metrics || {};
    const r = (v) => Number.isFinite(v) ? v.toFixed(1) : "—";
    brojke.innerHTML =
      "fps        <b>" + r(m.fps) + "</b><br>" +
      "gpu/frame  " + r(m.gpuTimePerFrame) + " ms<br>" +
      "cpu/frame  " + r(m.cpuTimePerFrame) + " ms<br>" +
      "pick       " + r(m.pickTime) + " ms / " + (m.pickCount || 0) + "×<br>" +
      "шестоуглова " + (m.drawLayersCount || 0) + " слоја";
  }, 500);

  box.querySelector("#dg-pik").addEventListener("change", (e) => {
    pikovanje = e.target.checked; osvezi();
  });
  box.querySelector("#dg-prelaz").addEventListener("change", (e) => {
    prelazi = e.target.checked; osvezi();
  });
  box.querySelector("#dg-vis").addEventListener("change", (e) => {
    visinaOpseg = +e.target.value; osvezi();
  });
}

/* ---------- покретање ---------- */

/* Не користити requestAnimationFrame: у картици која није видљива он се
   не извршава, па се страница никад не иницијализује. */
setTimeout(async () => {
  try {
    procitajParametre();

    /* Уграђени блок се распакује пре свега осталог: тек кад је ту, зна се
       колико тачака има и шта пише у напомени. */
    if (PAKET) {
      const u = document.getElementById("ucitavanje");
      if (u) u.textContent = "распакујем уграђене податке…";
      PODACI = await raspakuj(PAKET);
    }
    pripremi();

    /* Број месеци долази из података, не из шаблона — уграђени извод не
       мора да има баш 96 месеци колико их има генератор. */
    const klizacVreme = document.getElementById("klizac");
    klizacVreme.max = M - 1;
    klizacVreme.value = t;

    /* Ознака извора прати податке. Кад су уграђени, пише оно што о себи
       каже meta.json — да фајл никад не тврди нешто друго него што носи. */
    if (PODACI && PODACI.napomena) {
      const o = document.getElementById("oznaka-podataka");
      if (o) o.textContent = PODACI.napomena;
    }
    osvezi();
    const u = document.getElementById("ucitavanje");
    if (u) u.remove();
    if (dijagnostika) pokreniDijagnostiku();
    document.getElementById("tacaka").textContent = D.n.toLocaleString("sr-RS");

    /* Тек кад је прво спљоштено цртање отишло, дижемо на пуну висину. */
    setTimeout(() => {
      visinaSkala = VISINA_ZADATA;
      const kl = document.getElementById("visina");
      if (kl) { kl.value = VISINA_ZADATA; document.getElementById("visina-v").textContent = VISINA_ZADATA; }
      osvezi();
    }, 80);
  } catch (e) {
    prijavi("Рачунање података није успело", e);
  }
}, 0);

/* Стање подлоге пратимо преко догађаја саме карте, не на истек времена —
   иначе се пријави квар и кад подлога само још учитава. */
if (imaPodlogu) {
  const n = document.getElementById("stanje-podloge");
  const javi = (txt) => { if (n) n.textContent = "подлога карте: " + txt; };
  try {
    const m = dek.getMapboxMap ? dek.getMapboxMap() : null;
    if (!m) {
      javi("није направљена");
    } else {
      m.on("load", () => javi("учитана"));
      m.on("error", (e) => {
        const p = e && e.error && e.error.message ? e.error.message : "неуспех";
        javi("не стиже — " + p);
      });
    }
  } catch (e) {
    javi("непознато стање");
  }
}
