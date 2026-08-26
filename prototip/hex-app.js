/* deck.gl HexagonLayer над синтетичком ценовном површином Србије.
   Висина шестоугла = индекс (01/2019 = 1), боја = цена по m².

   Палета, материјал, светло и угао камере преузети су из званичног
   deck.gl примера 3d-heatmap (deck.gl/examples/hexagon-layer), да би
   приказ изгледао исто. Генератор долази из generator/generator.js. */
"use strict";

/* ---------- видљиво пријављивање грешака ----------
   Без овога свака грешка нестане у конзоли и страница само „не ради“.
   Сваки квар се исписује преко екрана, да се одмах види шта је. */

function prijavi(sta, greska) {
  const p = document.getElementById("greska");
  if (!p) return;
  p.style.display = "block";
  p.innerHTML +=
    "<b>" + sta + "</b><br>" +
    String(greska && greska.message ? greska.message : greska) + "<br><br>";
  const u = document.getElementById("ucitavanje");
  if (u) u.remove();
}

window.addEventListener("error", e => prijavi("Грешка у скрипти", e.error || e.message));
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
const MESECI = G.oznakeMeseci();
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

let D = null, tacke = null, t = M - 1, animacija = null;
let poluprecnik = 3000, pokrivenost = 1, percentil = 100, visinaSkala = 50;

/* ---------- подаци ---------- */

function pripremi() {
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
  D = { mreza, n, cene, indeks };

  tacke = new Array(n);
  for (let k = 0; k < n; k++) {
    tacke[k] = { position: [mreza.lon[k], mreza.lat[k]], cena: 0, indeks: 1 };
  }
  primeniMesec(t);
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
      data: tacke,
      getPosition: d => d.position,

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
      elevationRange: [0, 3000],
      elevationScale: visinaSkala,

      material: MATERIJAL,
      pickable: true,
      updateTriggers: {
        getColorWeight: t,
        getElevationWeight: t
      },
      transitions: { elevationScale: 3000 }
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
  getTooltip: ({ object }) => {
    if (!object) return null;
    const [lon, lat] = object.position;
    const cena = Math.round(object.colorValue);
    const ind = object.elevationValue;
    return {
      html:
        '<div class="opis">' +
        '<span class="k">ширина</span> ' + lat.toFixed(6) + '<br>' +
        '<span class="k">дужина</span> ' + lon.toFixed(6) + '<br>' +
        '<b>' + cena + ' €/m²</b> · индекс ' +
        ind.toFixed(3).replace(".", ",") +
        ' (+' + Math.round((ind - 1) * 100) + ' %)<br>' +
        '<span class="k">' + object.points.length + ' тачака мреже</span>' +
        '</div>',
      style: { background: "none", padding: "0", margin: "0" }
    };
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

/* ---------- покретање ---------- */

/* Не користити requestAnimationFrame: у картици која није видљива он се
   не извршава, па се страница никад не иницијализује. */
setTimeout(() => {
  try {
    pripremi();
    document.getElementById("klizac").value = t;
    osvezi();
    const u = document.getElementById("ucitavanje");
    if (u) u.remove();
    document.getElementById("tacaka").textContent = D.n.toLocaleString("sr-RS");
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
