/* Апликација: deck.gl HexagonLayer над синтетичком ценовном површином.
   Висина шестоугла = индекс (2019 = 1), боја = цена по m².
   Генератор долази из generator/generator.js, угради га napravi-hex.js. */
"use strict";

const { DeckGL, HexagonLayer, PathLayer, TextLayer,
        LightingEffect, AmbientLight, DirectionalLight } = deck;

const KORAK_KM = 2.5;
const MESECI = G.oznakeMeseci();
const M = MESECI.length;

const CENA_MIN = 1000, CENA_MAX = 2700;
const IND_MIN = 1.0,  IND_MAX = 2.2;

/* magma, шест корака — deck.gl очекује низ [r,g,b] */
const PALETA = [
  [ 12,   9,  40], [ 65,  20, 110], [130,  37, 129],
  [201,  59, 112], [246, 122,  93], [252, 205, 138]
];

let D = null, tacke = null, t = M - 1, animacija = null;
let visinaSkala = 3800, poluprecnik = 6000;

/* ---------- подаци ---------- */

function pripremi() {
  const mreza = G.napraviMrezu(KORAK_KM);
  const serija = G.napraviSeriju(mreza);
  const n = mreza.n;
  const cene = new Uint16Array(n * M);
  const indeks = new Float32Array(n * M);
  for (let i = 0; i < M; i++) {
    const r = serija.sledeciMesec(i);
    cene.set(r.cene.map(Math.round), i * n);
    for (let k = 0; k < n; k++) indeks[i * n + k] = r.indeks[k];
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
      getColor: [125, 148, 158, 190],
      getWidth: 1.5,
      widthUnits: "pixels",
      parameters: { depthTest: false }
    }),
    new HexagonLayer({
      id: "hex",
      data: tacke,
      getPosition: d => d.position,
      radius: poluprecnik,
      extruded: true,
      elevationScale: visinaSkala,

      /* боја носи цену */
      colorAggregation: "MEAN",
      getColorWeight: d => d.cena,
      colorRange: PALETA,
      colorDomain: [CENA_MIN, CENA_MAX],

      /* висина носи индекс */
      elevationAggregation: "MEAN",
      getElevationWeight: d => d.indeks,
      elevationDomain: [IND_MIN, IND_MAX],
      elevationRange: [0, 1],

      pickable: true,
      opacity: 0.94,
      material: { ambient: 0.55, diffuse: 0.62, shininess: 40,
                  specularColor: [70, 78, 84] },
      updateTriggers: {
        getColorWeight: t,
        getElevationWeight: t
      },
      transitions: { elevationScale: 220 }
    }),
    new TextLayer({
      id: "gradovi",
      data: G.GRADOVI
        .filter(g => ["Beograd","Novi Sad","Nis","Kragujevac","Subotica","Uzice","Vranje"]
          .indexOf(g[0]) > -1)
        .map(g => ({ ime: NAZIVI[g[0]] || g[0], position: [g[1], g[2]] })),
      getPosition: d => d.position,
      getText: d => d.ime,
      getSize: 12,
      getColor: [232, 240, 243, 225],
      getPixelOffset: [0, -6],
      fontFamily: '"IBM Plex Sans", sans-serif',
      characterSet: "auto",
      outlineWidth: 3,
      outlineColor: [10, 18, 22, 255],
      fontSettings: { sdf: true },
      billboard: true,
      parameters: { depthTest: false }
    })
  ];
}

const NAZIVI = {
  "Beograd": "Београд", "Novi Sad": "Нови Сад", "Nis": "Ниш",
  "Kragujevac": "Крагујевац", "Subotica": "Суботица",
  "Uzice": "Ужице", "Vranje": "Врање"
};

/* ---------- deck ---------- */

const svetlo = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.05 }),
  glavno: new DirectionalLight({
    color: [255, 250, 240], intensity: 1.5, direction: [-1.2, -3, -1]
  }),
  dopunsko: new DirectionalLight({
    color: [180, 205, 220], intensity: 0.75, direction: [2, 2, -0.8]
  })
});

/* Поглед држимо сами: initialViewState се чита само при покретању,
   па дугме „погледај одозго“ мора да мења контролисано стање. */
let pogled = {
  longitude: 20.85, latitude: 43.5, zoom: 6.55,
  pitch: 52, bearing: -14
};

const dek = new DeckGL({
  container: "platno",
  viewState: pogled,
  onViewStateChange: ({ viewState }) => {
    pogled = viewState;
    dek.setProps({ viewState: pogled });
  },
  controller: { dragRotate: true, touchRotate: true },
  effects: [svetlo],
  layers: [],
  getTooltip: ({ object }) => {
    if (!object) return null;
    const cena = Math.round(object.colorValue);
    const ind = object.elevationValue;
    return {
      html:
        '<div class="opis"><b>' + cena + " €/m²</b>" +
        "<span>индекс " + ind.toFixed(3).replace(".", ",") +
        "  ·  +" + Math.round((ind - 1) * 100) + " %</span>" +
        "<span>" + object.points.length + " тачака мреже</span></div>",
      style: { background: "none", padding: "0", margin: "0" }
    };
  }
});

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

document.getElementById("klizac").addEventListener("input", e => {
  t = +e.target.value; primeniMesec(t); osvezi();
});

const dugme = document.getElementById("pusti");
dugme.addEventListener("click", () => {
  if (animacija) {
    clearInterval(animacija); animacija = null;
    dugme.textContent = "▶  Пусти"; dugme.classList.remove("radi");
  } else {
    dugme.textContent = "⏸  Стани"; dugme.classList.add("radi");
    animacija = setInterval(() => {
      t = (t + 1) % M;
      document.getElementById("klizac").value = t;
      primeniMesec(t); osvezi();
    }, 130);
  }
});

document.getElementById("visina").addEventListener("input", e => {
  visinaSkala = +e.target.value;
  document.getElementById("visina-v").textContent = visinaSkala;
  osvezi();
});
document.getElementById("radijus").addEventListener("input", e => {
  poluprecnik = +e.target.value;
  document.getElementById("radijus-v").textContent = (poluprecnik / 1000) + " km";
  osvezi();
});
document.getElementById("ravno").addEventListener("click", e => {
  const spljosteno = e.target.classList.toggle("radi");
  pogled = Object.assign({}, pogled, {
    latitude: spljosteno ? 44.05 : 43.5,
    pitch: spljosteno ? 0 : 52,
    bearing: spljosteno ? 0 : -14
  });
  dek.setProps({ viewState: pogled });
  e.target.textContent = spljosteno ? "Врати 3Д" : "Погледај одозго";
});

/* ---------- покретање ---------- */

/* Не користити requestAnimationFrame за покретање: у картици која није
   видљива он се не извршава, па се страница никад не иницијализује.
   setTimeout ради и у позадини, а нула довољна да се натпис исцрта. */
setTimeout(() => {
  const t0 = performance.now();
  pripremi();
  document.getElementById("klizac").value = t;
  document.getElementById("visina-v").textContent = visinaSkala;
  document.getElementById("radijus-v").textContent = (poluprecnik / 1000) + " km";
  osvezi();
  document.getElementById("ucitavanje").remove();
  document.getElementById("tacaka").textContent = D.n.toLocaleString("sr-RS");
  document.getElementById("racun").textContent =
    Math.round(performance.now() - t0) + " ms";
}, 0);
