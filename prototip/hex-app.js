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

const { DeckGL, ColumnLayer, PathLayer,
        LightingEffect, AmbientLight, PointLight, DataFilterExtension } = deck;

const KORAK_KM = 1.5;

/* Полупречник ћелије у метрима. Долази уз податке; кад се рачуна генератором,
   изводи се из корака исто као тамо: површина шестоугла је (3√3/2)·R². */
const R_PO_KORAKU = 1 / Math.sqrt(3 * Math.sqrt(3) / 2);

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

/* Иста палета као у deck.gl примеру — подразумевана, да приказ остане
   препознатљиво тај пример.

   Има две мане, обе измерене. Прво, светлина јој није монотона: расте до
   средине опсега (1680 €/m², L=0,89) па пада, тако да најјефтинија (L=0,26)
   и најскупља (L=0,17) ћелија изгледају подједнако тамно — однос 1,4:1, а
   WCAG за графичке елементе тражи 3:1. Друго, кораци 1680→2020 €/m² се под
   деутеранопијом стапају у једну боју (размак 0,008 у Oklab-у, где је испод
   0,05 већ неразазнатљиво).

   У примеру то мање смета јер боја носи БРОЈ незгода, па је већина
   шестоуглова при дну опсега. Овде боји целу земљу непрекидно. */
const PALETA = [
  [  1, 152, 189],
  [ 73, 227, 206],
  [216, 254, 181],
  [254, 237, 177],
  [254, 173,  84],
  [209,  55,  78]
];

/* Приступачна замена: inferno, подигнутог доњег краја.
   Светлина расте монотоно кроз цео опсег (однос крајева 8,9:1), па
   јефтино тоне у подлогу а скупо гори — иста граматика коју користи и
   рампа одступања. Најмањи корак међу суседима: 0,091 нормално, 0,084
   деутеранопија, 0,050 протанопија.

   Доњи крај НИЈЕ црн, него L=0,047 — 1,5:1 према подлози. Прави inferno
   почиње од скоро црне, а како се празне ћелије више не цртају, најјефтинија
   ћелија би тада изгледала као рупа у подацима. */
const PALETA_PRISTUPACNA = [
  [ 84,  36, 126],
  [126,  42, 122],
  [170,  52, 104],
  [208,  74,  76],
  [236, 116,  44],
  [249, 176,  34],
  [252, 233, 130]
];

/* Палета за одступање — расипајућа, али са ТАМНОМ средином.
   Прва верзија је била ColorBrewer RdYlBu, чија је најсветлија тачка (L=0,87)
   падала тачно на просек. Подлога је на L≈0,015, па су најобичније ћелије
   светлеле јаче од свега на екрану, а одступања се губила — тачно обрнуто од
   онога што приказ треба да истакне.

   Овде је средина на L=0,022, једва изнад подлоге: ћелија на просеку утоне у
   карту, а одступање се пали. Светлина је симетрична око средине (крајеви се
   разликују за 0,04) и монотоно расте од средине ка оба краја, па се јачина
   одступања чита и без разликовања боја — што помаже и код слабијег вида за
   боје, где смер (хладно/топло) остаје једини носилац знака.

   Седам степени, не шест: са парним бројем средина пада ИЗМЕЂУ два степена,
   па нема тачке која заиста означава просек. */
const PALETA_ODSTUPANJE = [
  [124, 226, 255],
  [ 38, 150, 214],
  [ 26,  78, 120],
  [ 32,  42,  54],   // средина — референтни ниво месеца
  [124,  68,  40],
  [236, 140,  44],
  [255, 212, 130]
];

/* Исти материјал као у примеру */
const MATERIJAL = {
  ambient: 0.64,
  diffuse: 0.6,
  shininess: 32,
  specularColor: [51, 51, 51]
};

let D = null, t = M - 1, animacija = null;

/* Ћелије се сад цртају једна по тачки, па се и подаци држе као равни низови:
   положаји једном, цена и индекс текућег месеца. Никаквих ситних објеката. */
let polozaji = null, zaSloj = null;
let cenaSad = null, indeksSad = null, rang = null;
let brojUObuhvatu = 0;

/* Први месец у ком ћелија уопште има податак, по ћелији; −1 ако га нема
   никад. Пуна табла из генератора даје свуда 0. */
let osnovaMeseca = null;

/* Колико ћелија текући месец нема податак — исписује се у плочи. */
let brojPraznih = 0;

/* Колико траје један корак анимације и, заједно с тим, претапање између
   два месеца. Иста вредност иде и у setInterval и у transitions. */
const KORAK_ANIMACIJE = 130;

/* Једна инстанца филтера за све слојеве — прављење новог у сваком кадру би
   значило да deck.gl сваки пут поново саставља шејдер. */
const filter = new DataFilterExtension({ filterSize: 2 });

/* ---------- рампа боја ----------
   Боја је непрекидна између степени: HexagonLayer је свој colorRange делио на
   шест равних платоа, па је глатка површина излазила као контуре уместо као
   површина.

   Мешање иде кроз **Oklab**, не кроз сирови sRGB. Мешање по каналима у sRGB-у
   даје неравномерне перцептивне кораке и мутне средине — између плаве и
   наранџасте прође кроз прљаво сиву. Oklab је прављен тако да једнак померај
   у њему изгледа као једнак померај оку, па прелаз испадне гладак.

   Рампа се једном разложи у таблицу од 256 боја и даље се само индексира:
   јефтиније је од рачунања по ћелији, а таблица се прави једном, при учитавању. */

function uOklab(r, g, b) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  ];
}

function izOklab(L, A, B) {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.2914855480 * B;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  const gama = (v) => {
    v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    v = Math.round(v * 255);
    return v < 0 ? 0 : (v > 255 ? 255 : v);
  };
  return [
    gama( 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gama(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gama(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
  ];
}

const RAMPA_KORAKA = 256;

function napraviRampu(paleta) {
  const uLab = paleta.map(c => uOklab(c[0], c[1], c[2]));
  const out = new Uint8Array(RAMPA_KORAKA * 3);
  for (let i = 0; i < RAMPA_KORAKA; i++) {
    const p = (i / (RAMPA_KORAKA - 1)) * (uLab.length - 1);
    const j = Math.min(uLab.length - 2, Math.floor(p));
    const f = p - j;
    const a = uLab[j], b = uLab[j + 1];
    const rgb = izOklab(
      a[0] + (b[0] - a[0]) * f,
      a[1] + (b[1] - a[1]) * f,
      a[2] + (b[2] - a[2]) * f
    );
    out[i * 3] = rgb[0]; out[i * 3 + 1] = rgb[1]; out[i * 3 + 2] = rgb[2];
  }
  return out;
}

const RAMPA_CENA = napraviRampu(PALETA);
const RAMPA_CENA_PRISTUPACNA = napraviRampu(PALETA_PRISTUPACNA);
const RAMPA_ODSTUPANJA = napraviRampu(PALETA_ODSTUPANJE);

/* Која се рампа тренутно користи за цену. Мења се тачкастим дугметом поред
   легенде, и преко адресе `?paleta=pristupacna`. Тиче се само режима „цена“ —
   рампа одступања је већ отпорна на слабије разликовање боја (најмањи корак
   0,143 под деутеранопијом), па за њу нема шта да се бира. */
let paletaCene = "deck";
const rampaCene = () => paletaCene === "pristupacna" ? RAMPA_CENA_PRISTUPACNA : RAMPA_CENA;

/* CSS прелив за легенду, из исте таблице — да трака и карта не оду у различите
   боје ако се палета промени. */
function relivRampe(rampa) {
  const koraka = 12, delovi = [];
  for (let i = 0; i < koraka; i++) {
    const j = Math.round(i / (koraka - 1) * (RAMPA_KORAKA - 1)) * 3;
    delovi.push("rgb(" + rampa[j] + "," + rampa[j + 1] + "," + rampa[j + 2] + ") " +
      (100 * i / (koraka - 1)).toFixed(1) + "%");
  }
  return "linear-gradient(to right, " + delovi.join(", ") + ")";
}

function bojaIzRampe(rampa, u, target) {
  let i = Math.round((u < 0 ? 0 : (u > 1 ? 1 : u)) * (RAMPA_KORAKA - 1)) * 3;
  target[0] = rampa[i]; target[1] = rampa[i + 1]; target[2] = rampa[i + 2];
  target[3] = 255;
  return target;
}

/* ---------- шта боја носи ----------
   „цена“      — апсолутна цена по m², непроменљив опсег кроз свих 96 месеци.
                 Упоредиво међу месецима, али у првим годинама цела земља лежи
                 у доњем делу опсега, па се просторна разлика једва види.
   „одступање“ — однос према просеку тог месеца. Свака слика се сама
                 нормализује, па се распоред скупог и јефтиног види подједнако
                 добро и 2019. и 2026. Опсег је симетричан у логаритму и рачуна
                 се једном, из целог низа, да не трепери из месеца у месец. */

let bojaRezim = "cena";
let nivoMeseca = null;       // референтни ниво по месецу — медијана, не просек
let brojReferentnih = 0;     // колико ћелија чини референтни скуп
let logOdstupanja = 1;       // полуопсег рампе, из перцентила а не из крајности

function bojaZaCelija(k, target) {
  if (bojaRezim === "odstupanje") {
    const p = nivoMeseca[t];
    const r = p > 0 ? cenaSad[k] / p : 1;
    return bojaIzRampe(RAMPA_ODSTUPANJA,
      0.5 + Math.log(r) / (2 * logOdstupanja), target);
  }
  return bojaIzRampe(rampaCene(),
    (cenaSad[k] - CENA_MIN) / (CENA_MAX - CENA_MIN), target);
}

/* Висина носи индекс. Раније је ово радио HexagonLayer преко elevationDomain
   и elevationRange; резултат је исти, само се сад рачуна овде. */
function visinaZaIndeks(ind) {
  let u = (ind - IND_MIN) / (IND_MAX - IND_MIN);
  u = u < 0 ? 0 : (u > 1 ? 1 : u);
  return u * visinaOpseg;
}

/* Обухват података: колики део мреже се уопште црта.
   На 100 % приказ је потпуно попуњен — мрежа је правилна и свака ћелија
   унутар границе има вредност. Стварни подаци о становима постоје само тамо
   где има зграда, па имају празнине; овај клизач служи да се унапред види
   како ће приказ тада изгледати.

   ПАЖЊА НА ИМЕ. Проценат је удео исцртаних ћелија, а не процена насељене
   површине — ништа у ланцу не мери становништво. Ћелије се задржавају по
   близини градова (види skor ниже), што је груба замена за грађевинско
   подручје. Зато клизач више не пише „насељени део“: то је тврдило нешто
   што подаци не носе. */
let obuhvatUdeo = 100;
let poredak = null;
let pokrivenost = 0.7, percentil = 100;

/* Величина ћелије више није ствар погледа него података: одређена је
   решетком на којој тачке леже и не сме да се мења клизачем — сваки други
   полупречник би оставио рупе или преклоп. Попуњеност је оно што је од
   ранијег „пречника“ заиста било корисно, и она остаје. */
let poluprecnik = Math.round(KORAK_KM * 1000 * R_PO_KORAKU);

/* Горња граница цене за приказ, из клизача перцентила. Ћелије изнад ње се
   не цртају — филтрира их DataFilterExtension, на графичкој. */
let pragCene = Infinity;

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
     hexagon-layer.html?obuhvat=10&mesec=2024-06&boja=odstupanje
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
  /* `naseljeno` је ранији назив истог подешавања. Остаје да раде адресе
     које су већ подељене; предност има новији `obuhvat`. */
  if ((v = broj("obuhvat", 3, 100)) === null) v = broj("naseljeno", 3, 100);
  if (v !== null) { obuhvatUdeo = v; postavi("obuhvat", v, v + " %"); }
  /* `precnik` је остао из времена кад је величина ћелије била ствар погледа.
     Више није — ћелија је одређена решетком. Стара адреса се не квари, само
     тај део нема дејства. */
  if ((v = broj("pokrivenost", 0, 1)) !== null) { pokrivenost = v; postavi("pokrivenost", v, v.toFixed(2).replace(".", ",")); }
  if ((v = broj("percentil", 80, 100)) !== null) { percentil = v; postavi("percentil", v, v); }
  if ((v = broj("visina", 5, 220)) !== null) { VISINA_ZADATA = v; }

  if (p.get("dijagnostika") === "1") dijagnostika = true;

  if (p.get("paleta") === "pristupacna") paletaCene = "pristupacna";

  if (p.get("boja") === "odstupanje") {
    bojaRezim = "odstupanje";
    const el = document.getElementById("boja");
    if (el) el.value = "odstupanje";
  }

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
           meseci: paket.meseci, napomena: paket.napomena,
           poluprecnikM: paket.poluprecnikM || null };
}

/* ---------- празне ћелије ----------
   Цена 0 значи „нема податка за ту ћелију у том месецу“. Генератор прави
   пуну таблу, али стварни промет је догађај: у једној ћелији, у једном
   месецу, трансакција најчешће нема ниједне. Договор о нули стоји и у
   meta.json (`cene_bin.nula_znaci`).

   Нула је безбедна ознака јер цена од 0 €/m² ионако нема значење. Кад
   података има свуда — као у генератору — ништа од овога се не активира и
   приказ ради тачно као раније. */
const NEMA = 0;

/* Уграђени стварни подаци. Носе тачке и цене; индекс се рачуна овде, као
   однос према првом месецу, да се у фајлу не држи двапут иста ствар.

   Са празнинама први месец не мора да постоји, па се основа помера на први
   месец у ком ћелија уопште има податак. Због тога индекс више није за све
   ћелије мерен од исте тачке — која је то тачка чува се у `osnovaMeseca` и
   облачић је исписује кад није јануар 2019. */
function izUgradjenih() {
  const n = PODACI.n;
  const mreza = { n, lon: PODACI.lon, lat: PODACI.lat };
  const cene = PODACI.cene;
  const indeks = new Float32Array(n * M);
  osnovaMeseca = new Int16Array(n).fill(-1);

  for (let k = 0; k < n; k++) {
    let osnova = 0;
    for (let i = 0; i < M; i++) {
      const c = cene[i * n + k];
      if (c !== NEMA) { osnova = c; osnovaMeseca[k] = i; break; }
    }
    for (let i = 0; i < M; i++) {
      const c = cene[i * n + k];
      /* Празан месец добија индекс 0 — исти договор као за цену. */
      indeks[i * n + k] = (c === NEMA || osnova <= 0) ? NEMA : c / osnova;
    }
  }
  return { mreza, cene, indeks };
}

function pripremi() {
  const { mreza, cene, indeks } = PODACI ? izUgradjenih() : izGeneratora();
  const n = mreza.n;
  D = { mreza, n, cene, indeks };

  /* Величина ћелије долази уз податке; кад их нема, изводи се из корака
     исто као у генератору, да се цртано и рачунато не разиђу. */
  poluprecnik = (PODACI && PODACI.poluprecnikM) ||
                Math.round(KORAK_KM * 1000 * R_PO_KORAKU);

  /* Положаји иду у један низ и више се не мењају. deck.gl их узима као
     готов бафер, без иједног позива приступника и без 40.000 ситних
     објеката какве је ранија верзија правила. */
  polozaji = new Float64Array(n * 2);
  for (let k = 0; k < n; k++) {
    polozaji[k * 2] = mreza.lon[k];
    polozaji[k * 2 + 1] = mreza.lat[k];
  }
  zaSloj = { length: n, attributes: { getPosition: { value: polozaji, size: 2 } } };

  cenaSad = new Float32Array(n);
  indeksSad = new Float32Array(n);

  /* Просек по месецу и највеће одступање од њега у целом низу. Рачуна се
     једном, овде, да режим „одступање“ има непроменљив опсег — иначе би боја
     треперила из месеца у месец, што је баш замка коју deck.gl пример има са
     самоподешавајућим доменом. Држимо се односа, не логаритама, па се логаритам
     узима само двапут на крају. */
  /* ---------- референтни ниво месеца ----------
     Према чему се мери „одступање“. Три ствари су намерно овако:

     МЕДИЈАНА, не просек. Расподела цена је десно закошена, па просек вуче
     скупи реп — једна луксузна ћелија помера ниво целе земље.

     РЕФЕРЕНТНИ СКУП, не све присутне ћелије. Ако ниво рачунају оне ћелије које
     тог месеца случајно имају податак, онда се он помера кад се промени КО
     извештава, а не кад се промене цене. Измерено на пробном ретком скупу:
     ниво преко присутних ћелија је 8–9 % нижи од нивоа преко ћелија које
     извештавају увек, јер су ове друге градске и скупље. Зато скуп чине ћелије
     са податком у бар половини месеци — стабилна популација.

     Тај скуп је сам по себи пристрасан ка градовима, и то се не да избећи:
     негде мора да се бира између стабилног и репрезентативног. Колико га
     ћелија чини стоји у наслову легенде, да избор не буде скривен.

     На пуној табли — какву генератор прави — скуп је цела мрежа и медијана се
     рачуна преко свега, па се ништа од овога не примећује. */
  const pokrivenostCelije = new Int32Array(n);
  for (let i = 0; i < M; i++) {
    const off = i * n;
    for (let k = 0; k < n; k++) if (cene[off + k] !== NEMA) pokrivenostCelije[k]++;
  }
  const prag = Math.max(1, Math.ceil(M / 2));
  let referentne = [];
  for (let k = 0; k < n; k++) if (pokrivenostCelije[k] >= prag) referentne.push(k);
  /* Ако ниједна ћелија не испуни услов — веома редак извод — узима се шта има. */
  if (!referentne.length) {
    for (let k = 0; k < n; k++) if (pokrivenostCelije[k] > 0) referentne.push(k);
  }
  brojReferentnih = referentne.length;

  /* Медијана бројањем: цене су цели бројеви у уском опсегу, па је један пролаз
     кроз ћелије и један кроз бројач тачнији и бржи од сортирања. */
  const BROJAC_M = new Uint32Array(65536);
  nivoMeseca = new Float32Array(M);
  for (let i = 0; i < M; i++) {
    const off = i * n;
    BROJAC_M.fill(0);
    let koliko = 0;
    for (const k of referentne) {
      const c = cene[off + k];
      if (c === NEMA) continue;
      BROJAC_M[c]++; koliko++;
    }
    if (!koliko) { nivoMeseca[i] = 0; continue; }
    const cilj = koliko >> 1;
    let zbir = 0;
    for (let c = 0; c < 65536; c++) {
      zbir += BROJAC_M[c];
      if (zbir > cilj) { nivoMeseca[i] = c; break; }
    }
  }

  /* ---------- полуопсег рампе ----------
     Раније је опсег постављала НАЈКРАЈНИЈА ћелија у целом низу, па је једна
     вредност одређивала скалу за све остале: измерено, 95 % ћелија је 2019.
     падало у средњих 20 % рампе. Сада га поставља 1./99. перцентил одступања,
     а реп се одсеца — рампа се тиме користи двоструко боље, а боја остаје
     сразмерна одступању, па легенда и даље чита поштено.

     Перцентил се тражи хистограмом преко ln(однос), да се 3,8 милиона
     вредности не сортира. */
  {
    const KANTI = 2000, RASPON = 1.5;          // ln(4,48) — довољно за сваки реп
    const hist = new Uint32Array(KANTI);
    let ukupno = 0;
    for (let i = 0; i < M; i++) {
      const p = nivoMeseca[i];
      if (p <= 0) continue;
      const off = i * n;
      for (let k = 0; k < n; k++) {
        const c = cene[off + k];
        if (c === NEMA) continue;
        let x = Math.log(c / p);
        x = x < -RASPON ? -RASPON : (x > RASPON ? RASPON : x);
        let j = Math.floor((x + RASPON) / (2 * RASPON) * KANTI);
        if (j < 0) j = 0; else if (j >= KANTI) j = KANTI - 1;
        hist[j]++; ukupno++;
      }
    }
    const perc = (p) => {
      const cilj = ukupno * p;
      let zbir = 0;
      for (let j = 0; j < KANTI; j++) {
        zbir += hist[j];
        if (zbir >= cilj) return (j + 0.5) / KANTI * 2 * RASPON - RASPON;
      }
      return RASPON;
    };
    logOdstupanja = ukupno
      ? Math.max(Math.abs(perc(0.01)), Math.abs(perc(0.99))) || 1
      : 1;
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

  /* Ранг по близини градова, по ћелији. Клизач обухвата више не прави нов
     низ тачака него само помера горњу границу овог ранга — филтрирање је на
     графичкој, кроз DataFilterExtension. */
  rang = new Float32Array(n);
  for (let i = 0; i < n; i++) rang[poredak[i]] = i;

  primeniMesec(t);
  primeniObuhvat();
}

/* Задржава само онај део мреже који улази у обухват. */
function primeniObuhvat() {
  brojUObuhvatu = obuhvatUdeo >= 100
    ? D.n
    : Math.max(1, Math.round(D.n * obuhvatUdeo / 100));
}

function primeniMesec(i) {
  const off = i * D.n;
  for (let k = 0; k < D.n; k++) {
    cenaSad[k] = D.cene[off + k];
    indeksSad[k] = D.indeks[off + k];
  }
}

/* ---------- горњи перцентил ----------
   Ранији HexagonLayer је ово радио сам: ћелије изнад перцентила је сакривао.
   ColumnLayer нема ту особину, па се праг рачуна овде и предаје филтеру.

   Цене су цели бројеви у уском опсегу, па се перцентил добија пребројавањем
   уместо сортирањем: један пролаз кроз ћелије и један кроз бројач. Тачно је
   као сортирање, а не троши ништа приметно ни при пуштеној анимацији. */

const BROJAC = new Uint32Array(65536);

function izracunajPrag() {
  if (percentil >= 100) { pragCene = Infinity; return; }

  BROJAC.fill(0);
  let ukupno = 0;
  for (let k = 0; k < D.n; k++) {
    if (rang[k] >= brojUObuhvatu) continue;   // те се ионако не цртају
    if (cenaSad[k] === NEMA) continue;        // празне не улазе у перцентил
    const c = cenaSad[k] | 0;
    BROJAC[c < 0 ? 0 : c > 65535 ? 65535 : c]++;
    ukupno++;
  }
  if (!ukupno) { pragCene = Infinity; return; }

  const koliko = Math.floor(ukupno * percentil / 100);
  let zbir = 0;
  for (let c = 0; c < 65536; c++) {
    zbir += BROJAC[c];
    if (zbir >= koliko) { pragCene = c; return; }
  }
  pragCene = Infinity;
}

/* ---------- слојеви ---------- */

/* Граница долази као више прстенова (Србија и КиМ), па се сваки црта као
   своја затворена путања — прво теме се додаје на крај да се прстен склопи. */
const putanjeGranice = G.GRANICA.map(prsten => ({ path: [...prsten, prsten[0]] }));

function slojevi() {
  return [
    new PathLayer({
      id: "granica",
      data: putanjeGranice,
      getPath: d => d.path,
      getColor: [86, 96, 102, 200],
      getWidth: 1,
      widthUnits: "pixels",
      parameters: { depthTest: false }
    }),
    new ColumnLayer({
      id: "celije",
      data: zaSloj,

      /* Шест страна, темена на истоку и западу — исто што HexagonLayer црта
         испод себе, само без корака агрегације. Полупречник је одређен
         решетком на којој тачке леже, па се не подешава. */
      diskResolution: 6,
      radius: poluprecnik,
      angle: 30,
      extruded: true,
      coverage: pokrivenost,
      elevationScale: visinaSkala,

      getFillColor: (d, { index, target }) => bojaZaCelija(index, target),
      getElevation: (d, { index }) => visinaZaIndeks(indeksSad[index]),

      /* Оба филтера иду на графичку: цена преко прага перцентила и ранг
         обухвата. Ниједан од њих више не тражи да се низ података
         прегради — мења се само filterRange. */
      extensions: [filter],
      filterSize: 2,
      getFilterValue: (d, { index, target }) => {
        target[0] = cenaSad[index];
        target[1] = rang[index];
        return target;
      },
      /* Доња граница цене је 1, не 0: тиме празне ћелије (цена = 0) испадају
         из цртања истим филтером који већ носи перцентил, без новог канала. */
      filterRange: [[1, pragCene], [0, brojUObuhvatu - 1]],

      material: MATERIJAL,
      pickable: pikovanje,
      onClick: (info) => {
        if (info && info.index >= 0) { probodi(info.index); return true; }
        return false;
      },
      updateTriggers: {
        getFillColor: t + "/" + bojaRezim + "/" + paletaCene,
        getElevation: t,
        getFilterValue: t
      },

      /* Сад кад свака ћелија има своју висину и боју, прелаз може да иде по
         тим вредностима, а не само по укупној размери као раније. Због тога
         се месеци претапају уместо да прескачу. */
      transitions: prelazi
        ? { getElevation: KORAK_ANIMACIJE, getFillColor: KORAK_ANIMACIJE }
        : {}
    }),

    /* Ознаке пробода: равне шестоугаоне плочице на тлу, испод самог стуба.
       Цртају се без провере дубине, као и обрис границе, па се виде и кад је
       стуб висок и кад је поглед нагнут. Нису извучене а стуб јесте, па
       ниједна не заклања боју коју ћелија носи. */
    new ColumnLayer({
      id: "probodi",
      data: probodeni,
      diskResolution: 6,
      radius: poluprecnik,
      angle: 30,
      extruded: false,
      coverage: 1,
      getPosition: k => [D.mreza.lon[k], D.mreza.lat[k]],
      getFillColor: k => bojaProboda(k).concat(235),
      pickable: false,
      parameters: { depthTest: false },
      updateTriggers: { getFillColor: probodeni.join(",") }
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

     Сад кад се црта једна ћелија по тачки, `info.index` је баш та тачка, па
     облачић исписује њену цену и њене координате. Ранија верзија је овде
     морала да чита colorValue и elevationValue — просек шестоугла над
     непознатим бројем тачака — и да координату вади из info.coordinate,
     јер је `position` умео да да бесмислену вредност. */
  getTooltip: (info) => {
    try {
      if (!info || !info.layer || info.layer.id !== "celije") return null;
      const k = info.index;
      if (!(k >= 0) || !D || k >= D.n) return null;

      if (cenaSad[k] === NEMA) return null;   // празне се ионако не цртају

      const ind = indeksSad[k];
      /* Кад ћелији први податак не пада у јануар 2019, индекс се мери од њеног
         првог месеца — па облачић каже од ког, да „+42 %“ не изгледа као раст
         од почетка низа. */
      const osnova = osnovaMeseca ? osnovaMeseca[k] : 0;
      const odKad = (osnova > 0 && MESECI[osnova]) ? "  од " + MESECI[osnova] : "";
      return [
        "ширина: " + D.mreza.lat[k].toFixed(6),
        "дужина: " + D.mreza.lon[k].toFixed(6),
        Math.round(cenaSad[k]) + " €/m²",
        ind > 0
          ? "индекс " + ind.toFixed(3).replace(".", ",") +
            "  (+" + Math.round((ind - 1) * 100) + " %)" + odKad
          : "индекс: нема основе"
      ].join("\n");
    } catch (e) {
      prijavi("Облачић", e);
      return null;
    }
  }
}));

/* ---------- управљање ---------- */

/* ---------- пробод: кретање изабране ћелије ----------
   Приказ носи свих 96 месеци, али у сваком тренутку показује само један.
   Питање које се о ценовној површини заправо поставља — „шта се овде дешавало
   свих ових година“ — на њој се дотад могло одговорити само вучењем клизача
   напред-назад и памћењем боја.

   Клик на ћелију је зато прободе: њен цео низ се исцрта у плочи. Подаци су
   ионако већ у меморији (D.cene[mesec * n + celija]), па ово ништа не учитава
   и ништа не рачуна унапред.

   Боје пробода су намерно ван обе палете карте, да се не мешају са вредношћу. */

const BOJE_PROBODA = [
  [255, 255, 255],
  [235, 120, 220],
  [150, 240, 120]
];
const NAJVISE_PROBODA = BOJE_PROBODA.length;

let probodeni = [];   // индекси ћелија, најстарији први

function probodi(k) {
  const i = probodeni.indexOf(k);
  if (i > -1) probodeni.splice(i, 1);                 // други клик скида
  else {
    probodeni.push(k);
    if (probodeni.length > NAJVISE_PROBODA) probodeni.shift();
  }
  osvezi();
}

function bojaProboda(k) {
  return BOJE_PROBODA[probodeni.indexOf(k) % BOJE_PROBODA.length];
}

/* Низ цена једне ћелије кроз све месеце. */
function nizCelije(k) {
  const out = new Float32Array(M);
  for (let i = 0; i < M; i++) out[i] = D.cene[i * D.n + k];
  return out;
}

function crtajNizove() {
  const platno = document.getElementById("niz");
  const spisak = document.getElementById("pribodene");
  const uput = document.getElementById("uput-niz");
  if (!platno || !spisak) return;

  /* Резолуција платна прати екран, иначе је линија мутна на ретина екрану. */
  const gustina = window.devicePixelRatio || 1;
  const sirina = platno.clientWidth || 264;
  const visina = 66;
  if (platno.width !== Math.round(sirina * gustina)) {
    platno.width = Math.round(sirina * gustina);
    platno.height = Math.round(visina * gustina);
  }
  const c = platno.getContext("2d");
  c.setTransform(gustina, 0, 0, gustina, 0, 0);
  c.clearRect(0, 0, sirina, visina);

  if (uput) uput.style.display = probodeni.length ? "none" : "";
  spisak.innerHTML = "";

  if (!probodeni.length) {
    c.strokeStyle = "rgba(160,167,180,.25)";
    c.beginPath(); c.moveTo(0, visina - 8); c.lineTo(sirina, visina - 8); c.stroke();
    return;
  }

  const nizovi = probodeni.map(nizCelije);

  /* Опсег се узима само преко месеци који имају податак. */
  let vmin = Infinity, vmax = -Infinity, imaIkakvih = false;
  for (const niz of nizovi) {
    for (let i = 0; i < M; i++) {
      if (niz[i] === NEMA) continue;
      imaIkakvih = true;
      if (niz[i] < vmin) vmin = niz[i];
      if (niz[i] > vmax) vmax = niz[i];
    }
  }
  if (!imaIkakvih) { vmin = 0; vmax = 1; }
  if (!(vmax > vmin)) { vmax = vmin + 1; }

  const gore = 10, dole = visina - 12;
  const uX = (i) => (M > 1 ? (i / (M - 1)) * (sirina - 1) : 0);
  const uY = (v) => dole - ((v - vmin) / (vmax - vmin)) * (dole - gore);

  /* Усправна линија на текућем месецу — веза између низа и слике на карти. */
  c.strokeStyle = "rgba(209,55,78,.75)";
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(uX(t) + 0.5, 0); c.lineTo(uX(t) + 0.5, dole); c.stroke();

  c.strokeStyle = "rgba(160,167,180,.28)";
  c.beginPath(); c.moveTo(0, dole + 0.5); c.lineTo(sirina, dole + 0.5); c.stroke();

  nizovi.forEach((niz, red) => {
    const b = BOJE_PROBODA[red % BOJE_PROBODA.length];
    c.strokeStyle = "rgb(" + b[0] + "," + b[1] + "," + b[2] + ")";
    c.fillStyle = c.strokeStyle;
    c.lineWidth = 1.4;

    /* Линија се ПРЕКИДА на празнинама. Спајање преко рупе би нацртало
       кретање које никад није измерено — управо оно што стварни промет нема.
       Усамљен месец, без суседа са податком, добија тачку да се не изгуби. */
    let uNizu = false;
    c.beginPath();
    for (let i = 0; i < M; i++) {
      if (niz[i] === NEMA) { uNizu = false; continue; }
      const x = uX(i), y = uY(niz[i]);
      if (uNizu) c.lineTo(x, y); else c.moveTo(x, y);
      uNizu = true;
    }
    c.stroke();

    for (let i = 0; i < M; i++) {
      if (niz[i] === NEMA) continue;
      const sam = (i === 0 || niz[i - 1] === NEMA) && (i === M - 1 || niz[i + 1] === NEMA);
      if (!sam) continue;
      c.beginPath(); c.arc(uX(i), uY(niz[i]), 1.5, 0, Math.PI * 2); c.fill();
    }

    /* Тачка на текућем месецу — само ако тог месеца податка има. */
    if (niz[t] !== NEMA) {
      c.beginPath(); c.arc(uX(t), uY(niz[t]), 2.2, 0, Math.PI * 2); c.fill();
    }
  });

  c.fillStyle = "rgb(140,148,160)";
  c.font = "9.5px Helvetica, Arial, sans-serif";
  c.textBaseline = "top";
  c.fillText(Math.round(vmax) + " €", 0, 0);
  c.textBaseline = "bottom";
  c.fillText(Math.round(vmin) + " €", 0, visina);
  c.textAlign = "right";
  c.fillText(MESECI[M - 1], sirina, visina);
  c.textAlign = "left";

  probodeni.forEach((k, red) => {
    const b = BOJE_PROBODA[red % BOJE_PROBODA.length];
    const red_ = document.createElement("div");
    red_.className = "pribod";
    /* Ћелија може бити пробедена, а тог месеца немати податак. */
    const ima = cenaSad[k] !== NEMA;
    red_.innerHTML =
      '<span class="tacka" style="background:rgb(' + b.join(",") + ')"></span>' +
      '<span class="mesto">' + D.mreza.lat[k].toFixed(3) + ", " +
      D.mreza.lon[k].toFixed(3) + "</span>" +
      '<span class="cena"' + (ima ? "" : ' style="color:rgb(120,128,140);font-weight:normal"') +
      ">" + (ima ? Math.round(cenaSad[k]) + " €" : "нема") + "</span>" +
      '<button class="skini" type="button" aria-label="Скини">×</button>';
    red_.querySelector(".skini").addEventListener("click", () => probodi(k));
    spisak.appendChild(red_);
  });
}

/* ---------- легенда ----------
   Трака је прелив, не шест поља, јер је и боја на карти сад непрекидна.
   Натпис и оса прате изабрани режим. */

function osveziLegendu() {
  const naslov = document.getElementById("legenda-naslov");
  const traka = document.getElementById("legenda-traka");
  const osa = document.getElementById("legenda-osa");
  if (!naslov || !traka || !osa) return;

  traka.style.background = relivRampe(
    bojaRezim === "odstupanje" ? RAMPA_ODSTUPANJA : rampaCene());

  /* Тачкасто дугме показује палету на коју би се прешло, не тренутну — да се
     види шта се добија пре клика. У режиму одступања се склања: тамо нема
     избора. */
  const dugmePalete = document.getElementById("paleta-dugme");
  if (dugmePalete) {
    const uOdstupanju = bojaRezim === "odstupanje";
    dugmePalete.style.display = uOdstupanju ? "none" : "";
    if (!uOdstupanju) {
      const druga = paletaCene === "pristupacna" ? RAMPA_CENA : RAMPA_CENA_PRISTUPACNA;
      dugmePalete.style.background = relivRampe(druga);
      dugmePalete.title = paletaCene === "pristupacna"
        ? "Врати палету из deck.gl примера"
        : "Пређи на приступачну палету: светлина расте кроз цео опсег, " +
          "кораци се не стапају при слабијем разликовању боја";
      dugmePalete.setAttribute("aria-pressed", paletaCene === "pristupacna" ? "true" : "false");
    }
  }

  if (bojaRezim === "odstupanje") {
    const pct = Math.round((Math.exp(logOdstupanja) - 1) * 100);
    /* Пише се МЕДИЈАНА, не „просек“ — да натпис каже баш оно што се рачуна.
       Од колико ћелија је узета, стоји у наслову преко `title`. */
    naslov.textContent = "Боја — одступање од медијане месеца";
    naslov.title = "Медијана се узима преко " +
      brojReferentnih.toLocaleString("sr-RS") + " ћелија које извештавају у " +
      "бар половини месеци. Крајњих 1 % одступања је одсечено.";
    osa.innerHTML = "<span>−" + pct + " %</span><span>медијана</span><span>+" +
                    pct + " %</span>";
    osa.style.justifyContent = "space-between";
  } else {
    naslov.textContent = "Боја — цена по m²";
    naslov.title = "";
    osa.innerHTML = "<span>" + CENA_MIN + " €</span><span>" + CENA_MAX + " €</span>";
  }
}

function osvezi() {
  izracunajPrag();
  dek.setProps({ layers: slojevi() });
  document.getElementById("mesec").textContent = MESECI[t];

  /* Бројке прате оно што се види, не целу мрежу. Раније су се рачунале
     преко свих тачака, па је спуштање обухвата на 10 % остављало
     просек целе Србије поред приказаних десет посто — а то су баш најскупље
     ћелије, тако да је бројка била нижа од свега на екрану. */
  let zbir = 0, imax = 0, koliko = 0, prazno = 0;
  for (let k = 0; k < D.n; k++) {
    if (rang[k] >= brojUObuhvatu) continue;
    if (cenaSad[k] === NEMA) { prazno++; continue; }   // нема податка овог месеца
    if (cenaSad[k] > pragCene) continue;
    zbir += cenaSad[k];
    if (indeksSad[k] > imax) imax = indeksSad[k];
    koliko++;
  }
  brojPraznih = prazno;

  document.getElementById("prosek").textContent =
    koliko ? Math.round(zbir / koliko) + " €" : "—";
  document.getElementById("najveci").textContent =
    koliko && imax > 0 ? "+" + Math.round((imax - 1) * 100) + " %" : "—";
  document.getElementById("prikazano").textContent =
    koliko.toLocaleString("sr-RS");

  /* Ред „без податка“ се појављује само кад празнина има — на пуној табли
     из генератора остаје сакривен, па се плоча не мења без потребе. */
  const redPraznih = document.getElementById("red-praznih");
  if (redPraznih) {
    redPraznih.style.display = prazno ? "" : "none";
    const br = document.getElementById("praznih");
    if (br) br.textContent = prazno.toLocaleString("sr-RS") +
      "  (" + Math.round(100 * prazno / (brojUObuhvatu || 1)) + " %)";
  }

  crtajNizove();
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

/* Клизача за пречник више нема: величина ћелије је особина решетке на којој
   подаци леже, а не подешавање погледа. Попуњеност ради оно што је од
   пречника заиста било корисно. */
veziKlizac("pokrivenost", v => pokrivenost = v,  v => v.toFixed(2).replace(".", ","));
veziKlizac("percentil",   v => percentil = v,    v => v);
veziKlizac("visina",      v => visinaSkala = v,  v => v);
veziKlizac("obuhvat",     v => { obuhvatUdeo = v; primeniObuhvat(); }, v => v + " %");

document.getElementById("paleta-dugme").addEventListener("click", () => {
  paletaCene = paletaCene === "pristupacna" ? "deck" : "pristupacna";
  osveziLegendu();
  osvezi();
});

document.getElementById("boja").addEventListener("change", e => {
  bojaRezim = e.target.value === "odstupanje" ? "odstupanje" : "cena";
  osveziLegendu();
  osvezi();
});

document.getElementById("klizac").addEventListener("input", e => {
  t = +e.target.value; primeniMesec(t); osvezi();
});

const dugme = document.getElementById("pusti");
dugme.addEventListener("click", () => {
  if (animacija) {
    clearInterval(animacija); animacija = null;
    dugme.textContent = "▶ Пусти"; dugme.classList.remove("radi");
    pikovanje = true;
    osvezi();
  } else {
    dugme.textContent = "⏸ Стани"; dugme.classList.add("radi");
    /* Док анимација иде, пиковање се гаси: свако померање миша иначе исцрта
       сцену још једном у помоћни бафер и прочита је назад са графичке, а то
       се при пуштеној анимацији дешава у сваком кадру. Враћа се на стоп. */
    pikovanje = false;
    animacija = setInterval(() => {
      t = (t + 1) % M;
      document.getElementById("klizac").value = t;
      primeniMesec(t); osvezi();
    }, KORAK_ANIMACIJE);
  }
});

/* ---------- дијагностика (?dijagnostika=1) ----------
   Мери зашто приказ штуца. Без параметра се ништа од овога не извршава,
   па испоручени фајл остаје непромењен.

   fps и времена долазе из deck.gl-овог `metrics`, који их сам скупља.
   Прекидачи гађају два најскупља осумњичена: пиковање (свако померање
   миша исцрта сцену још једном у помоћни бафер, па чита назад са графичке)
   и висину стубова (висок стуб покрива много пиксела, а сваки преклопљени
   пиксел се сенчи изнова).

   ВАЖНО о читању бројки. `dek.metrics` се не освежава непрекидно: deck.gl га
   пуни на сваких 60 исцртаних кадрова и одмах затим нулира бројаче
   (`_metricsCounter++ % 60 === 0`). А исцртава само кад има шта да се промени.
   Ранија верзија је анкетно читала `dek.metrics` на пола секунде и зато је,
   баш при ниском fps-у — дакле тачно кад мерење треба — исписивала саме нуле:
   до 60 кадрова се дуго не стигне. Уместо анкете сад слушамо `_onMetrics`,
   који deck.gl зове онда кад бројке заиста постоје. */

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
  let kadrova = 0;
  const ispisi = (m) => {
    const r = (v) => Number.isFinite(v) ? v.toFixed(1) : "—";
    brojke.innerHTML =
      "fps        <b>" + r(m.fps) + "</b><br>" +
      "gpu/frame  " + r(m.gpuTimePerFrame) + " ms<br>" +
      "cpu/frame  " + r(m.cpuTimePerFrame) + " ms<br>" +
      "pick       " + r(m.pickTime) + " ms / " + (m.pickCount || 0) + "×<br>" +
      "кадрова    " + (kadrova += 60) + "<br>" +
      "ћелија     " + (D ? D.n.toLocaleString("sr-RS") : "—");
  };
  brojke.textContent = "чекам 60 кадрова…";
  dek.setProps({ _onMetrics: ispisi });

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
    osveziLegendu();
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
