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

/*
 * Granica dolazi iz Natural Earth 1:10m Admin 0 - Countries, javno vlasnistvo
 * (naturalearthdata.com; repozitorijum nvkelso/natural-earth-vector, fajl
 * geojson/ne_10m_admin_0_countries.geojson).
 *
 * Uzeta su dva sloja: "SRB" (Republika Srbija) i "KOS" (Kosovo i Metohija) -
 * isti obuhvat koji je imala i ranija priblizna kontura. Drze se kao dva
 * odvojena prstena, ne kao jedan spojen poligon: tacka je unutar podrucja ako
 * je unutar bilo kog prstena. Time se izbegava racunanje unije dva poligona,
 * a rezultat je isti. Kome treba samo uze podrucje, izbaci drugi prsten.
 *
 * Uproscena Douglas-Peucker-om na 0,002 stepena (oko 220 m) - ispod cetvrtine
 * celije na koraku od 1,5 km, pa se na prikazu ne vidi. Sa 1.211 temena palo
 * je na 774. Povrsina posle uproscavanja je 88.363 km2 prema zvanicnih
 * 88.499 km2, dakle 0,15 odsto manje - koliko i sam Natural Earth odstupa.
 * Koordinate su na cetiri decimale, oko 11 m.
 *
 * ZA STVARNU UPOTREBU i dalje ide zvanicna granica iz GeoSrbije. Natural Earth
 * je kartografski izvor za sitnu razmeru, ne katastarski podatak.
 */
const GRANICA = [
  /* Република Србија — Natural Earth ADM0_A3 "SRB", 604 темена */
  [
    [20.2428,46.1081],[20.3057,46.0536],[20.3177,46.0386],[20.3386,45.9928],[20.3539,45.9767],
    [20.4291,45.9467],[20.4817,45.9127],[20.4999,45.9067],[20.5380,45.9037],[20.5567,45.8984],
    [20.5721,45.8877],[20.6053,45.8461],[20.6367,45.8270],[20.6459,45.7887],[20.6881,45.7431],
    [20.7001,45.7354],[20.7134,45.7333],[20.7268,45.7362],[20.7394,45.7434],[20.7541,45.7636],
    [20.7652,45.7668],[20.7775,45.7623],[20.7857,45.7526],[20.7791,45.7237],[20.7773,45.6575],
    [20.7622,45.6306],[20.7544,45.6056],[20.7580,45.5893],[20.7874,45.5537],[20.8002,45.5305],
    [20.7976,45.5165],[20.7607,45.4933],[20.7671,45.4793],[20.8160,45.4629],[20.8630,45.4187],
    [20.9276,45.3775],[20.9662,45.3416],[20.9815,45.3328],[21.0640,45.3063],[21.0916,45.2881],
    [21.1033,45.2861],[21.1131,45.2893],[21.1292,45.3019],[21.1394,45.3037],[21.1556,45.2952],
    [21.2061,45.2459],[21.2393,45.2294],[21.2571,45.2241],[21.2993,45.2232],[21.4055,45.1997],
    [21.4338,45.1888],[21.4594,45.1740],[21.4933,45.1451],[21.4978,45.1319],[21.4941,45.1193],
    [21.4815,45.1116],[21.4586,45.1073],[21.4424,45.0929],[21.4438,45.0729],[21.4295,45.0573],
    [21.4219,45.0314],[21.4093,45.0240],[21.3634,45.0165],[21.3514,44.9982],[21.3535,44.9898],
    [21.3839,44.9867],[21.3852,44.9695],[21.4084,44.9583],[21.4565,44.9523],[21.5163,44.9339],
    [21.5310,44.9246],[21.5391,44.9085],[21.5363,44.8893],[21.5221,44.8808],[21.4815,44.8726],
    [21.4534,44.8696],[21.3953,44.8716],[21.3685,44.8649],[21.3555,44.8566],[21.3464,44.8456],
    [21.3428,44.8319],[21.3786,44.8166],[21.3959,44.7902],[21.4122,44.7848],[21.4972,44.7780],
    [21.5584,44.7817],[21.5780,44.7777],[21.5956,44.7660],[21.6197,44.7139],[21.6563,44.6877],
    [21.7052,44.6771],[21.7568,44.6773],[21.8017,44.6839],[21.8554,44.6985],[21.8720,44.6960],
    [21.9624,44.6623],[21.9943,44.6586],[22.0043,44.6515],[22.0322,44.6033],[22.0452,44.5692],
    [22.0763,44.5507],[22.0870,44.5218],[22.1043,44.5096],[22.1266,44.5027],[22.1482,44.5009],
    [22.1721,44.5053],[22.1851,44.5151],[22.2990,44.6617],[22.3049,44.6774],[22.3197,44.6853],
    [22.3611,44.6921],[22.3807,44.7005],[22.4261,44.7337],[22.4689,44.7302],[22.4837,44.7240],
    [22.5533,44.6692],[22.5875,44.6494],[22.6212,44.6374],[22.7001,44.6306],[22.7147,44.6231],
    [22.7652,44.5828],[22.7593,44.5647],[22.7417,44.5519],[22.7001,44.5418],[22.6785,44.5456],
    [22.6422,44.5631],[22.6212,44.5692],[22.6003,44.5698],[22.5805,44.5655],[22.5656,44.5554],
    [22.5567,44.5215],[22.5484,44.5117],[22.5355,44.5075],[22.5004,44.5064],[22.4841,44.4998],
    [22.4770,44.4640],[22.4800,44.4558],[22.5010,44.4419],[22.5054,44.4350],[22.5051,44.4041],
    [22.5227,44.3751],[22.5494,44.3490],[22.5828,44.3284],[22.6212,44.3159],[22.6625,44.3117],
    [22.6815,44.3053],[22.6895,44.2917],[22.6854,44.2437],[22.6916,44.2284],[22.6488,44.2140],
    [22.6062,44.1746],[22.6094,44.1599],[22.5971,44.1191],[22.6047,44.0794],[22.5930,44.0639],
    [22.5546,44.0624],[22.5342,44.0572],[22.5037,44.0199],[22.4343,44.0140],[22.4118,44.0069],
    [22.3996,43.9933],[22.3945,43.9363],[22.3790,43.9135],[22.3771,43.8835],[22.3495,43.8079],
    [22.3626,43.7808],[22.3885,43.7583],[22.3861,43.7255],[22.4049,43.6872],[22.4265,43.6682],
    [22.4663,43.6491],[22.4729,43.6359],[22.4738,43.6130],[22.4820,43.5995],[22.4771,43.5913],
    [22.4831,43.5793],[22.4785,43.5592],[22.4906,43.5409],[22.5189,43.4742],[22.5326,43.4648],
    [22.5658,43.4533],[22.5963,43.4292],[22.6378,43.4264],[22.6647,43.3967],[22.7029,43.3940],
    [22.7330,43.3815],[22.8045,43.3290],[22.8171,43.3155],[22.8270,43.2814],[22.8838,43.2306],
    [22.9155,43.2122],[22.9814,43.1990],[22.9846,43.1746],[22.9740,43.1412],[22.9556,43.1083],
    [22.9353,43.0856],[22.9017,43.0697],[22.8842,43.0367],[22.8423,43.0075],[22.8290,42.9935],
    [22.7764,42.9797],[22.7632,42.9586],[22.7388,42.8974],[22.7270,42.8869],[22.6662,42.8719],
    [22.5909,42.8869],[22.5636,42.8843],[22.5376,42.8683],[22.5060,42.8701],[22.4814,42.8467],
    [22.4455,42.8302],[22.4274,42.8136],[22.4258,42.8098],[22.4531,42.7636],[22.4666,42.7485],
    [22.4814,42.7398],[22.4829,42.7338],[22.4814,42.7277],[22.4681,42.7183],[22.4421,42.6817],
    [22.4492,42.6680],[22.4253,42.5729],[22.5121,42.5192],[22.5249,42.5077],[22.5365,42.4784],
    [22.5195,42.4209],[22.5088,42.4049],[22.4698,42.3917],[22.4544,42.3768],[22.4385,42.3401],
    [22.4240,42.3259],[22.4058,42.3216],[22.3641,42.3210],[22.3450,42.3134],[22.3253,42.3143],
    [22.3076,42.3193],[22.2769,42.3412],[22.2733,42.3655],[22.2689,42.3703],[22.2598,42.3691],
    [22.2334,42.3489],[22.0955,42.3058],[22.0609,42.3011],[22.0276,42.3040],[21.9290,42.3351],
    [21.8844,42.3095],[21.8374,42.3086],[21.8172,42.3051],[21.7065,42.2551],[21.6920,42.2420],
    [21.6769,42.2349],[21.6247,42.2428],[21.5750,42.2420],[21.5641,42.2463],[21.5539,42.2740],
    [21.5149,42.3178],[21.5160,42.3419],[21.5373,42.3586],[21.5966,42.3721],[21.6174,42.3866],
    [21.6219,42.4022],[21.6169,42.4339],[21.6190,42.4492],[21.6279,42.4604],[21.6679,42.4901],
    [21.7177,42.5512],[21.7277,42.5741],[21.7183,42.5910],[21.7288,42.5983],[21.7347,42.6242],
    [21.7671,42.6387],[21.7728,42.6475],[21.7644,42.6696],[21.7387,42.6822],[21.7089,42.6872],
    [21.6874,42.6868],[21.6441,42.6723],[21.6294,42.6722],[21.6127,42.6804],[21.5652,42.7202],
    [21.5425,42.7258],[21.4418,42.7361],[21.4055,42.7353],[21.3787,42.7441],[21.3871,42.7550],
    [21.4041,42.8040],[21.4084,42.8470],[21.3989,42.8546],[21.3467,42.8608],[21.3063,42.8824],
    [21.2605,42.8866],[21.2324,42.9109],[21.2253,42.9736],[21.2098,42.9959],[21.1931,42.9979],
    [21.1654,42.9851],[21.1479,42.9926],[21.1393,43.0058],[21.1240,43.0583],[21.1085,43.0816],
    [21.0926,43.0907],[21.0258,43.0934],[21.0052,43.0991],[20.8386,43.1705],[20.8320,43.1786],
    [20.8361,43.1794],[20.8400,43.2121],[20.8515,43.2198],[20.8647,43.2173],[20.8485,43.2381],
    [20.8194,43.2574],[20.7944,43.2631],[20.7695,43.2608],[20.7453,43.2529],[20.6670,43.2097],
    [20.6449,43.2033],[20.6123,43.2023],[20.6040,43.1980],[20.5975,43.1850],[20.6001,43.1738],
    [20.6261,43.1237],[20.6321,43.1173],[20.6618,43.1159],[20.6692,43.1098],[20.6649,43.0854],
    [20.6438,43.0523],[20.6173,43.0221],[20.5964,43.0071],[20.5624,43.0095],[20.5305,42.9752],
    [20.4764,42.9664],[20.4595,42.9500],[20.4510,42.9220],[20.4667,42.9095],[20.4889,42.8992],
    [20.4988,42.8779],[20.4763,42.8555],[20.4280,42.8406],[20.3454,42.8274],[20.3552,42.8662],
    [20.3536,42.8910],[20.3371,42.9070],[20.2756,42.9299],[20.2232,42.9577],[20.1946,42.9668],
    [20.1409,42.9708],[20.1169,42.9767],[20.0199,43.0473],[19.9597,43.0786],[19.9498,43.0859],
    [19.9291,43.1139],[19.9166,43.1171],[19.9071,43.1133],[19.8722,43.0904],[19.8051,43.0900],
    [19.7818,43.0965],[19.7612,43.1087],[19.7428,43.1265],[19.7136,43.1656],[19.7055,43.1662],
    [19.6846,43.1567],[19.6630,43.1585],[19.6187,43.1682],[19.5981,43.1762],[19.5809,43.1878],
    [19.5499,43.2175],[19.5124,43.2406],[19.4731,43.2933],[19.4140,43.3384],[19.3723,43.3842],
    [19.3556,43.3931],[19.2184,43.4382],[19.1922,43.4545],[19.1759,43.4809],[19.1752,43.5096],
    [19.1953,43.5328],[19.2175,43.5328],[19.2389,43.5721],[19.2527,43.5886],[19.2637,43.5910],
    [19.3009,43.5883],[19.3358,43.6065],[19.3466,43.6088],[19.3634,43.6016],[19.3804,43.5856],
    [19.4107,43.5408],[19.4318,43.5711],[19.4439,43.5719],[19.4817,43.5608],[19.4896,43.5644],
    [19.4918,43.5686],[19.4769,43.5887],[19.4775,43.6170],[19.4817,43.6289],[19.5074,43.6472],
    [19.5057,43.6736],[19.4817,43.7292],[19.4617,43.7621],[19.3595,43.8422],[19.3059,43.9047],
    [19.2754,43.9333],[19.2293,43.9577],[19.2407,43.9657],[19.2429,43.9728],[19.2380,43.9925],
    [19.2435,44.0020],[19.2521,44.0075],[19.2873,44.0130],[19.3259,43.9966],[19.3646,43.9733],
    [19.4471,43.9798],[19.5041,43.9757],[19.5286,43.9772],[19.5522,43.9834],[19.5934,44.0056],
    [19.6104,44.0193],[19.6189,44.0357],[19.6114,44.0545],[19.5989,44.0626],[19.5899,44.0603],
    [19.5802,44.0515],[19.5546,44.0713],[19.5220,44.0850],[19.4982,44.1102],[19.4764,44.1270],
    [19.4742,44.1449],[19.4657,44.1528],[19.4597,44.1527],[19.4426,44.1432],[19.3812,44.1771],
    [19.3624,44.1912],[19.3561,44.2040],[19.3540,44.2243],[19.3416,44.2458],[19.3243,44.2640],
    [19.3074,44.2742],[19.2959,44.2758],[19.2637,44.2702],[19.2495,44.2707],[19.2200,44.2802],
    [19.1772,44.2870],[19.1570,44.2936],[19.1389,44.3093],[19.1167,44.3437],[19.1089,44.3636],
    [19.1072,44.3827],[19.1158,44.4036],[19.1414,44.4308],[19.1434,44.4582],[19.1273,44.5026],
    [19.1299,44.5183],[19.1653,44.5267],[19.1796,44.5383],[19.1873,44.5533],[19.1883,44.5760],
    [19.2087,44.5884],[19.2557,44.6456],[19.2776,44.6849],[19.3084,44.7051],[19.3180,44.7155],
    [19.3284,44.7340],[19.3637,44.8546],[19.3766,44.8630],[19.3728,44.8814],[19.3532,44.8990],
    [19.3401,44.8962],[19.3302,44.8987],[19.3102,44.9124],[19.2838,44.9084],[19.2395,44.9151],
    [19.2019,44.9084],[19.1869,44.9275],[19.1743,44.9254],[19.0846,44.8790],[19.0158,44.8656],
    [18.9943,44.8948],[18.9914,44.9149],[19.0184,44.9257],[19.0319,44.9226],[19.0521,44.9070],
    [19.0667,44.9057],[19.0787,44.9109],[19.1036,44.9382],[19.1245,44.9459],[19.1317,44.9532],
    [19.1276,44.9684],[19.1186,44.9755],[19.0981,44.9700],[19.0872,44.9771],[19.0852,44.9873],
    [19.0954,45.0209],[19.0823,45.0849],[19.0715,45.1071],[19.0462,45.1284],[19.0449,45.1372],
    [19.0601,45.1469],[19.1161,45.1429],[19.1377,45.1460],[19.1417,45.1622],[19.1219,45.1958],
    [19.1439,45.1995],[19.1558,45.1950],[19.1853,45.1680],[19.2045,45.1629],[19.2259,45.1619],
    [19.2678,45.1658],[19.2795,45.1772],[19.2867,45.1795],[19.3043,45.1665],[19.3907,45.1693],
    [19.4054,45.1797],[19.4078,45.2031],[19.3973,45.2233],[19.3781,45.2296],[19.2898,45.2363],
    [19.2599,45.2430],[19.1585,45.2762],[19.1041,45.2987],[19.0962,45.3291],[19.0830,45.3392],
    [19.0529,45.3454],[19.0302,45.3451],[19.0075,45.3595],[18.9775,45.3712],[18.9755,45.3911],
    [18.9974,45.3998],[19.0226,45.4024],[19.0313,45.4162],[19.0023,45.4437],[18.9971,45.4555],
    [18.9964,45.4738],[19.0096,45.4987],[19.0772,45.4916],[19.1063,45.5116],[19.0951,45.5261],
    [19.0510,45.5389],[19.0409,45.5450],[19.0272,45.5626],[19.0181,45.5674],[18.9832,45.5547],
    [18.9602,45.5391],[18.9417,45.5389],[18.9036,45.5731],[18.9124,45.6192],[18.9354,45.6334],
    [18.9685,45.6687],[18.9627,45.6831],[18.9173,45.7066],[18.9090,45.7194],[18.9002,45.7649],
    [18.8450,45.8157],[18.8524,45.8301],[18.8553,45.8574],[18.8998,45.8614],[18.9070,45.8680],
    [18.9040,45.8757],[18.8729,45.8952],[18.9070,45.9157],[18.9013,45.9312],[18.9627,45.9279],
    [18.9818,45.9218],[18.9875,45.9238],[18.9777,45.9435],[18.9818,45.9508],[19.0056,45.9626],
    [19.0309,45.9600],[19.0486,45.9634],[19.0497,45.9931],[19.0654,46.0120],[19.0885,46.0188],
    [19.1110,46.0130],[19.1258,45.9931],[19.1480,45.9841],[19.2357,45.9777],[19.2635,45.9814],
    [19.2748,45.9916],[19.2869,46.0162],[19.3070,46.0266],[19.3622,46.0296],[19.3789,46.0337],
    [19.4047,46.0602],[19.4369,46.0680],[19.4537,46.0776],[19.4730,46.0987],[19.4993,46.1086],
    [19.4875,46.1342],[19.5020,46.1456],[19.5499,46.1642],[19.5897,46.1660],[19.6478,46.1739],
    [19.6693,46.1731],[19.6901,46.1684],[19.7730,46.1316],[19.7904,46.1291],[19.8889,46.1574],
    [19.9291,46.1635],[19.9931,46.1594],[20.0350,46.1430],[20.0634,46.1453],[20.0984,46.1550],
    [20.1148,46.1522],[20.1380,46.1365],[20.1705,46.1455],[20.1885,46.1404]
  ],
  /* Косово и Метохија — Natural Earth ADM0_A3 "KOS", 170 темена */
  [
    [20.0650,42.5468],[20.0770,42.5599],[20.0757,42.6031],[20.1039,42.6531],[20.0942,42.6670],
    [20.0361,42.7080],[20.0248,42.7234],[20.0265,42.7432],[20.0347,42.7514],[20.0763,42.7734],
    [20.1121,42.7665],[20.1495,42.7499],[20.1834,42.7425],[20.2084,42.7633],[20.2092,42.7917],
    [20.2176,42.8027],[20.2261,42.8068],[20.2644,42.8173],[20.4280,42.8406],[20.4763,42.8555],
    [20.4988,42.8779],[20.4889,42.8992],[20.4667,42.9095],[20.4510,42.9220],[20.4595,42.9500],
    [20.4764,42.9664],[20.5305,42.9752],[20.5624,43.0095],[20.5964,43.0071],[20.6173,43.0221],
    [20.6438,43.0523],[20.6649,43.0854],[20.6692,43.1098],[20.6618,43.1159],[20.6321,43.1173],
    [20.6206,43.1333],[20.6001,43.1738],[20.5975,43.1850],[20.6040,43.1980],[20.6123,43.2023],
    [20.6449,43.2033],[20.6670,43.2097],[20.7453,43.2529],[20.7695,43.2608],[20.7944,43.2631],
    [20.8194,43.2574],[20.8384,43.2459],[20.8551,43.2314],[20.8647,43.2173],[20.8515,43.2198],
    [20.8400,43.2121],[20.8361,43.1794],[20.8320,43.1786],[20.8386,43.1705],[21.0052,43.0991],
    [21.0258,43.0934],[21.0926,43.0907],[21.1085,43.0816],[21.1240,43.0583],[21.1393,43.0058],
    [21.1479,42.9926],[21.1654,42.9851],[21.1931,42.9979],[21.2098,42.9959],[21.2253,42.9736],
    [21.2324,42.9109],[21.2605,42.8866],[21.3063,42.8824],[21.3467,42.8608],[21.3989,42.8546],
    [21.4084,42.8470],[21.4041,42.8040],[21.3871,42.7550],[21.3787,42.7441],[21.4055,42.7353],
    [21.4418,42.7361],[21.5425,42.7258],[21.5652,42.7202],[21.6127,42.6804],[21.6294,42.6722],
    [21.6441,42.6723],[21.6874,42.6868],[21.7089,42.6872],[21.7387,42.6822],[21.7644,42.6696],
    [21.7728,42.6475],[21.7671,42.6387],[21.7347,42.6242],[21.7288,42.5983],[21.7183,42.5910],
    [21.7277,42.5741],[21.7177,42.5512],[21.6679,42.4901],[21.6279,42.4604],[21.6190,42.4492],
    [21.6169,42.4339],[21.6219,42.4022],[21.6174,42.3866],[21.5966,42.3721],[21.5373,42.3586],
    [21.5160,42.3419],[21.5149,42.3178],[21.5539,42.2740],[21.5641,42.2463],[21.5199,42.2390],
    [21.4993,42.2387],[21.4815,42.2478],[21.4676,42.2351],[21.4363,42.2469],[21.4199,42.2401],
    [21.4298,42.2158],[21.4191,42.2150],[21.3843,42.2249],[21.3668,42.2239],[21.3538,42.2160],
    [21.2950,42.1490],[21.2937,42.1402],[21.3003,42.1209],[21.2993,42.0914],[21.2889,42.0897],
    [21.2378,42.0974],[21.2254,42.1068],[21.1999,42.1412],[21.1644,42.1670],[21.1264,42.1889],
    [21.0985,42.1960],[21.0744,42.1845],[21.0292,42.1514],[21.0039,42.1420],[20.8105,42.0929],
    [20.7849,42.0820],[20.7654,42.0643],[20.7554,42.0428],[20.7431,41.9935],[20.7418,41.9708],
    [20.7544,41.9309],[20.7505,41.9068],[20.7233,41.8666],[20.7030,41.8496],[20.6815,41.8440],
    [20.6718,41.8493],[20.6528,41.8693],[20.6434,41.8736],[20.6187,41.8505],[20.6024,41.8499],
    [20.5903,41.8547],[20.5671,41.8732],[20.5625,41.9001],[20.5673,41.9122],[20.5887,41.9296],
    [20.5993,41.9479],[20.5993,41.9606],[20.5897,41.9936],[20.5522,42.0738],[20.5494,42.1235],
    [20.5386,42.1501],[20.5008,42.2112],[20.4570,42.2505],[20.3334,42.3179],[20.2378,42.3199],
    [20.2296,42.3267],[20.2209,42.3431],[20.2188,42.3714],[20.1928,42.3937],[20.2044,42.4118],
    [20.2047,42.4201],[20.1808,42.4431],[20.1526,42.4937],[20.1355,42.5096],[20.0856,42.5300]
  ]
];

/*
 * Ray casting (even-odd rule, PNPOLY) nad vise prstenova.
 *
 * Okvir svakog prstena se racuna jednom i pamti: uPoligonu se zove jednom po
 * kandidatu mreze, sto je na koraku od 1,5 km oko 73.000 poziva puta 774
 * stranice. Provera okvira preskoci vecinu tog racuna.
 */

const _okviri = new WeakMap();

function okvirPrstena(prsten) {
  let o = _okviri.get(prsten);
  if (!o) {
    o = { minLon: 180, maxLon: -180, minLat: 90, maxLat: -90 };
    for (const [lo, la] of prsten) {
      if (lo < o.minLon) o.minLon = lo;
      if (lo > o.maxLon) o.maxLon = lo;
      if (la < o.minLat) o.minLat = la;
      if (la > o.maxLat) o.maxLat = la;
    }
    _okviri.set(prsten, o);
  }
  return o;
}

function uPrstenu(lon, lat, poly) {
  const o = okvirPrstena(poly);
  if (lon < o.minLon || lon > o.maxLon || lat < o.minLat || lat > o.maxLat) return false;
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

/* Prima jedan prsten ili niz prstenova, da stariji pozivi ne puknu. */
function uPoligonu(lon, lat, granica) {
  if (!granica.length) return false;
  if (typeof granica[0][0] === 'number') return uPrstenu(lon, lat, granica);
  for (const prsten of granica) if (uPrstenu(lon, lat, prsten)) return true;
  return false;
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
 * RASPORED. Sestougao stoji temenom nagore (ColumnLayer, angle 30):
 *   razmak vrsta    1.5 * R      po geografskoj sirini
 *   razmak kolona   sqrt(3) * R  po duzini
 *   svaka druga vrsta pomerena za pola kolone
 * Svih sest suseda je tada na rastojanju sqrt(3)*R.
 *
 * ZASTO TEMENOM NAGORE, A NE NASTRANU. Jedan stepen duzine nije svuda isto
 * dugacak: 80,1 km na 44. paraleli, 77,1 km na 46,2 a 82,9 km na 41,9.
 * Ranija verzija je za ceo posao uzimala jednu vrednost, onu na 44. paraleli,
 * pa su celije na severu ulazile jedna u drugu za 3,7%, a na jugu ostavljale
 * fugu od 3,5%. To se vidi pri punoj popunjenosti.
 *
 * Sa temenom nagore svaka vrsta lezi na jednoj paraleli, pa se razmak kolona
 * u stepenima moze racunati bas za tu paralelu. Rastojanje na tlu tada svuda
 * ostaje sqrt(3)*R. Da sestougao stoji temenom nastranu, kolone bi bile
 * uspravne i morale bi da drze isti razmak kroz sve paralele — a to je upravo
 * ono sto ne moze.
 *
 * Sto ostaje: sever-jug razmak koristi 111,13 km po stepenu, a stvarna duzina
 * meridijanskog stepena se preko Srbije menja od 111,0 do 111,2 km. To je
 * ispod 0,1% i ne vidi se. Pravo resenje je i dalje zvanicni CRS (UTM 34N).
 */

const R_PO_KORAKU = 1 / Math.sqrt(3 * Math.sqrt(3) / 2);   // 0.6204...

function napraviMrezu(korakKm, granica) {
  const poly = granica || GRANICA;
  /* Okvir preko svih prstenova. Jedan prsten se prihvata i dalje, pa se
     najpre svede na isti oblik. */
  const prstenovi = (typeof poly[0][0] === 'number') ? [poly] : poly;
  let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
  for (const prsten of prstenovi) {
    const o = okvirPrstena(prsten);
    if (o.minLon < minLon) minLon = o.minLon;
    if (o.maxLon > maxLon) maxLon = o.maxLon;
    if (o.minLat < minLat) minLat = o.minLat;
    if (o.maxLat > maxLat) maxLat = o.maxLat;
  }

  const R = korakKm * R_PO_KORAKU;
  const dyKm = 1.5 * R;                 // razmak vrsta, sever-jug
  const dxKm = Math.sqrt(3) * R;        // razmak kolona, istok-zapad
  const dLat = dyKm / KM_PO_STEPENU_LAT;
  const ny = Math.ceil((maxLat - minLat) / dLat);

  const lon = [], lat = [], gx = [], gy = [];
  let nx = 0;
  for (let j = 0; j < ny; j++) {
    const la = minLat + (j + 0.5) * dLat;
    // razmak kolona bas za ovu paralelu — otud i teme nagore
    const dLon = dxKm / (111.320 * Math.cos(la * Math.PI / 180));
    const pomak = (j & 1) ? 0.5 : 0;    // svaka druga vrsta za pola kolone
    const kolona = Math.ceil((maxLon - minLon) / dLon);
    if (kolona > nx) nx = kolona;
    for (let i = 0; i < kolona; i++) {
      const lo = minLon + (i + 0.5 + pomak) * dLon;
      if (!uPoligonu(lo, la, poly)) continue;
      lon.push(lo); lat.push(la); gx.push(i); gy.push(j);
    }
  }
  return {
    korakKm, poluprecnikKm: R, nx, ny,
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
    oznakeMeseci, BROJ_MESECI, GODINE, GRADOVI, GRANICA,
    lonLatUKm, kmULonLat, uPoligonu, napraviSum
  };
}
