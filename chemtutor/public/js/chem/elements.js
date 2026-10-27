// Периодическая система химических элементов: данные по всем 118 элементам.
// Массы — стандартные атомные массы IUPAC (округлённо); для радиоактивных
// элементов без стабильных изотопов — массовое число наиболее устойчивого изотопа.
// Электроотрицательность — по Полингу (null, если не определена).

const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
function supConfig(s) {
  // '3s2 3p4' -> '3s² 3p⁴' (только цифры после буквы подоболочки)
  return s.replace(/([spdf])(\d+)/g, (_, l, n) => l + n.split('').map(d => SUP[d]).join(''));
}

// [symbol, name, latin, mass, category, en, config, ox, state]
// state: s = solid, l = liquid, g = gas
const RAW = [
  ['H', 'Водород', 'Hydrogenium', 1.008, 'nonmetal', 2.20, '1s1', [-1, 1], 'g'],
  ['He', 'Гелий', 'Helium', 4.0026, 'noble', null, '1s2', [], 'g'],
  ['Li', 'Литий', 'Lithium', 6.94, 'alkali', 0.98, '[He] 2s1', [1], 's'],
  ['Be', 'Бериллий', 'Beryllium', 9.0122, 'alkaline-earth', 1.57, '[He] 2s2', [2], 's'],
  ['B', 'Бор', 'Borum', 10.81, 'metalloid', 2.04, '[He] 2s2 2p1', [3], 's'],
  ['C', 'Углерод', 'Carboneum', 12.011, 'nonmetal', 2.55, '[He] 2s2 2p2', [-4, 2, 4], 's'],
  ['N', 'Азот', 'Nitrogenium', 14.007, 'nonmetal', 3.04, '[He] 2s2 2p3', [-3, 1, 2, 3, 4, 5], 'g'],
  ['O', 'Кислород', 'Oxygenium', 15.999, 'nonmetal', 3.44, '[He] 2s2 2p4', [-2, -1, 2], 'g'],
  ['F', 'Фтор', 'Fluorum', 18.998, 'halogen', 3.98, '[He] 2s2 2p5', [-1], 'g'],
  ['Ne', 'Неон', 'Neon', 20.180, 'noble', null, '[He] 2s2 2p6', [], 'g'],
  ['Na', 'Натрий', 'Natrium', 22.990, 'alkali', 0.93, '[Ne] 3s1', [1], 's'],
  ['Mg', 'Магний', 'Magnesium', 24.305, 'alkaline-earth', 1.31, '[Ne] 3s2', [2], 's'],
  ['Al', 'Алюминий', 'Aluminium', 26.982, 'post-transition', 1.61, '[Ne] 3s2 3p1', [3], 's'],
  ['Si', 'Кремний', 'Silicium', 28.085, 'metalloid', 1.90, '[Ne] 3s2 3p2', [-4, 4], 's'],
  ['P', 'Фосфор', 'Phosphorus', 30.974, 'nonmetal', 2.19, '[Ne] 3s2 3p3', [-3, 3, 5], 's'],
  ['S', 'Сера', 'Sulfur', 32.06, 'nonmetal', 2.58, '[Ne] 3s2 3p4', [-2, 4, 6], 's'],
  ['Cl', 'Хлор', 'Chlorum', 35.45, 'halogen', 3.16, '[Ne] 3s2 3p5', [-1, 1, 3, 5, 7], 'g'],
  ['Ar', 'Аргон', 'Argon', 39.948, 'noble', null, '[Ne] 3s2 3p6', [], 'g'],
  ['K', 'Калий', 'Kalium', 39.098, 'alkali', 0.82, '[Ar] 4s1', [1], 's'],
  ['Ca', 'Кальций', 'Calcium', 40.078, 'alkaline-earth', 1.00, '[Ar] 4s2', [2], 's'],
  ['Sc', 'Скандий', 'Scandium', 44.956, 'transition', 1.36, '[Ar] 3d1 4s2', [3], 's'],
  ['Ti', 'Титан', 'Titanium', 47.867, 'transition', 1.54, '[Ar] 3d2 4s2', [2, 3, 4], 's'],
  ['V', 'Ванадий', 'Vanadium', 50.942, 'transition', 1.63, '[Ar] 3d3 4s2', [2, 3, 4, 5], 's'],
  ['Cr', 'Хром', 'Chromium', 51.996, 'transition', 1.66, '[Ar] 3d5 4s1', [2, 3, 6], 's'],
  ['Mn', 'Марганец', 'Manganum', 54.938, 'transition', 1.55, '[Ar] 3d5 4s2', [2, 4, 6, 7], 's'],
  ['Fe', 'Железо', 'Ferrum', 55.845, 'transition', 1.83, '[Ar] 3d6 4s2', [2, 3, 6], 's'],
  ['Co', 'Кобальт', 'Cobaltum', 58.933, 'transition', 1.88, '[Ar] 3d7 4s2', [2, 3], 's'],
  ['Ni', 'Никель', 'Niccolum', 58.693, 'transition', 1.91, '[Ar] 3d8 4s2', [2, 3], 's'],
  ['Cu', 'Медь', 'Cuprum', 63.546, 'transition', 1.90, '[Ar] 3d10 4s1', [1, 2], 's'],
  ['Zn', 'Цинк', 'Zincum', 65.38, 'transition', 1.65, '[Ar] 3d10 4s2', [2], 's'],
  ['Ga', 'Галлий', 'Gallium', 69.723, 'post-transition', 1.81, '[Ar] 3d10 4s2 4p1', [3], 's'],
  ['Ge', 'Германий', 'Germanium', 72.630, 'metalloid', 2.01, '[Ar] 3d10 4s2 4p2', [-4, 2, 4], 's'],
  ['As', 'Мышьяк', 'Arsenicum', 74.922, 'metalloid', 2.18, '[Ar] 3d10 4s2 4p3', [-3, 3, 5], 's'],
  ['Se', 'Селен', 'Selenium', 78.971, 'nonmetal', 2.55, '[Ar] 3d10 4s2 4p4', [-2, 4, 6], 's'],
  ['Br', 'Бром', 'Bromum', 79.904, 'halogen', 2.96, '[Ar] 3d10 4s2 4p5', [-1, 1, 3, 5, 7], 'l'],
  ['Kr', 'Криптон', 'Krypton', 83.798, 'noble', 3.00, '[Ar] 3d10 4s2 4p6', [2], 'g'],
  ['Rb', 'Рубидий', 'Rubidium', 85.468, 'alkali', 0.82, '[Kr] 5s1', [1], 's'],
  ['Sr', 'Стронций', 'Strontium', 87.62, 'alkaline-earth', 0.95, '[Kr] 5s2', [2], 's'],
  ['Y', 'Иттрий', 'Yttrium', 88.906, 'transition', 1.22, '[Kr] 4d1 5s2', [3], 's'],
  ['Zr', 'Цирконий', 'Zirconium', 91.224, 'transition', 1.33, '[Kr] 4d2 5s2', [4], 's'],
  ['Nb', 'Ниобий', 'Niobium', 92.906, 'transition', 1.6, '[Kr] 4d4 5s1', [3, 5], 's'],
  ['Mo', 'Молибден', 'Molybdaenum', 95.95, 'transition', 2.16, '[Kr] 4d5 5s1', [4, 6], 's'],
  ['Tc', 'Технеций', 'Technetium', 98, 'transition', 1.9, '[Kr] 4d5 5s2', [4, 7], 's'],
  ['Ru', 'Рутений', 'Ruthenium', 101.07, 'transition', 2.2, '[Kr] 4d7 5s1', [3, 4, 8], 's'],
  ['Rh', 'Родий', 'Rhodium', 102.91, 'transition', 2.28, '[Kr] 4d8 5s1', [3], 's'],
  ['Pd', 'Палладий', 'Palladium', 106.42, 'transition', 2.20, '[Kr] 4d10', [2, 4], 's'],
  ['Ag', 'Серебро', 'Argentum', 107.87, 'transition', 1.93, '[Kr] 4d10 5s1', [1], 's'],
  ['Cd', 'Кадмий', 'Cadmium', 112.41, 'transition', 1.69, '[Kr] 4d10 5s2', [2], 's'],
  ['In', 'Индий', 'Indium', 114.82, 'post-transition', 1.78, '[Kr] 4d10 5s2 5p1', [3], 's'],
  ['Sn', 'Олово', 'Stannum', 118.71, 'post-transition', 1.96, '[Kr] 4d10 5s2 5p2', [2, 4], 's'],
  ['Sb', 'Сурьма', 'Stibium', 121.76, 'metalloid', 2.05, '[Kr] 4d10 5s2 5p3', [-3, 3, 5], 's'],
  ['Te', 'Теллур', 'Tellurium', 127.60, 'metalloid', 2.1, '[Kr] 4d10 5s2 5p4', [-2, 4, 6], 's'],
  ['I', 'Иод', 'Iodum', 126.90, 'halogen', 2.66, '[Kr] 4d10 5s2 5p5', [-1, 1, 5, 7], 's'],
  ['Xe', 'Ксенон', 'Xenon', 131.29, 'noble', 2.6, '[Kr] 4d10 5s2 5p6', [2, 4, 6], 'g'],
  ['Cs', 'Цезий', 'Caesium', 132.91, 'alkali', 0.79, '[Xe] 6s1', [1], 's'],
  ['Ba', 'Барий', 'Barium', 137.33, 'alkaline-earth', 0.89, '[Xe] 6s2', [2], 's'],
  ['La', 'Лантан', 'Lanthanum', 138.91, 'lanthanide', 1.10, '[Xe] 5d1 6s2', [3], 's'],
  ['Ce', 'Церий', 'Cerium', 140.12, 'lanthanide', 1.12, '[Xe] 4f1 5d1 6s2', [3, 4], 's'],
  ['Pr', 'Празеодим', 'Praseodymium', 140.91, 'lanthanide', 1.13, '[Xe] 4f3 6s2', [3], 's'],
  ['Nd', 'Неодим', 'Neodymium', 144.24, 'lanthanide', 1.14, '[Xe] 4f4 6s2', [3], 's'],
  ['Pm', 'Прометий', 'Promethium', 145, 'lanthanide', 1.13, '[Xe] 4f5 6s2', [3], 's'],
  ['Sm', 'Самарий', 'Samarium', 150.36, 'lanthanide', 1.17, '[Xe] 4f6 6s2', [2, 3], 's'],
  ['Eu', 'Европий', 'Europium', 151.96, 'lanthanide', 1.2, '[Xe] 4f7 6s2', [2, 3], 's'],
  ['Gd', 'Гадолиний', 'Gadolinium', 157.25, 'lanthanide', 1.20, '[Xe] 4f7 5d1 6s2', [3], 's'],
  ['Tb', 'Тербий', 'Terbium', 158.93, 'lanthanide', 1.2, '[Xe] 4f9 6s2', [3, 4], 's'],
  ['Dy', 'Диспрозий', 'Dysprosium', 162.50, 'lanthanide', 1.22, '[Xe] 4f10 6s2', [3], 's'],
  ['Ho', 'Гольмий', 'Holmium', 164.93, 'lanthanide', 1.23, '[Xe] 4f11 6s2', [3], 's'],
  ['Er', 'Эрбий', 'Erbium', 167.26, 'lanthanide', 1.24, '[Xe] 4f12 6s2', [3], 's'],
  ['Tm', 'Тулий', 'Thulium', 168.93, 'lanthanide', 1.25, '[Xe] 4f13 6s2', [3], 's'],
  ['Yb', 'Иттербий', 'Ytterbium', 173.05, 'lanthanide', 1.1, '[Xe] 4f14 6s2', [2, 3], 's'],
  ['Lu', 'Лютеций', 'Lutetium', 174.97, 'lanthanide', 1.27, '[Xe] 4f14 5d1 6s2', [3], 's'],
  ['Hf', 'Гафний', 'Hafnium', 178.49, 'transition', 1.3, '[Xe] 4f14 5d2 6s2', [4], 's'],
  ['Ta', 'Тантал', 'Tantalum', 180.95, 'transition', 1.5, '[Xe] 4f14 5d3 6s2', [5], 's'],
  ['W', 'Вольфрам', 'Wolframium', 183.84, 'transition', 2.36, '[Xe] 4f14 5d4 6s2', [4, 6], 's'],
  ['Re', 'Рений', 'Rhenium', 186.21, 'transition', 1.9, '[Xe] 4f14 5d5 6s2', [4, 7], 's'],
  ['Os', 'Осмий', 'Osmium', 190.23, 'transition', 2.2, '[Xe] 4f14 5d6 6s2', [4, 8], 's'],
  ['Ir', 'Иридий', 'Iridium', 192.22, 'transition', 2.20, '[Xe] 4f14 5d7 6s2', [3, 4], 's'],
  ['Pt', 'Платина', 'Platinum', 195.08, 'transition', 2.28, '[Xe] 4f14 5d9 6s1', [2, 4], 's'],
  ['Au', 'Золото', 'Aurum', 196.97, 'transition', 2.54, '[Xe] 4f14 5d10 6s1', [1, 3], 's'],
  ['Hg', 'Ртуть', 'Hydrargyrum', 200.59, 'transition', 2.00, '[Xe] 4f14 5d10 6s2', [1, 2], 'l'],
  ['Tl', 'Таллий', 'Thallium', 204.38, 'post-transition', 1.62, '[Xe] 4f14 5d10 6s2 6p1', [1, 3], 's'],
  ['Pb', 'Свинец', 'Plumbum', 207.2, 'post-transition', 2.33, '[Xe] 4f14 5d10 6s2 6p2', [2, 4], 's'],
  ['Bi', 'Висмут', 'Bismuthum', 208.98, 'post-transition', 2.02, '[Xe] 4f14 5d10 6s2 6p3', [3, 5], 's'],
  ['Po', 'Полоний', 'Polonium', 209, 'post-transition', 2.0, '[Xe] 4f14 5d10 6s2 6p4', [2, 4], 's'],
  ['At', 'Астат', 'Astatium', 210, 'halogen', 2.2, '[Xe] 4f14 5d10 6s2 6p5', [-1, 1], 's'],
  ['Rn', 'Радон', 'Radon', 222, 'noble', null, '[Xe] 4f14 5d10 6s2 6p6', [2], 'g'],
  ['Fr', 'Франций', 'Francium', 223, 'alkali', 0.7, '[Rn] 7s1', [1], 's'],
  ['Ra', 'Радий', 'Radium', 226, 'alkaline-earth', 0.9, '[Rn] 7s2', [2], 's'],
  ['Ac', 'Актиний', 'Actinium', 227, 'actinide', 1.1, '[Rn] 6d1 7s2', [3], 's'],
  ['Th', 'Торий', 'Thorium', 232.04, 'actinide', 1.3, '[Rn] 6d2 7s2', [4], 's'],
  ['Pa', 'Протактиний', 'Protactinium', 231.04, 'actinide', 1.5, '[Rn] 5f2 6d1 7s2', [5], 's'],
  ['U', 'Уран', 'Uranium', 238.03, 'actinide', 1.38, '[Rn] 5f3 6d1 7s2', [3, 4, 6], 's'],
  ['Np', 'Нептуний', 'Neptunium', 237, 'actinide', 1.36, '[Rn] 5f4 6d1 7s2', [5], 's'],
  ['Pu', 'Плутоний', 'Plutonium', 244, 'actinide', 1.28, '[Rn] 5f6 7s2', [4], 's'],
  ['Am', 'Америций', 'Americium', 243, 'actinide', 1.13, '[Rn] 5f7 7s2', [3], 's'],
  ['Cm', 'Кюрий', 'Curium', 247, 'actinide', 1.28, '[Rn] 5f7 6d1 7s2', [3], 's'],
  ['Bk', 'Берклий', 'Berkelium', 247, 'actinide', 1.3, '[Rn] 5f9 7s2', [3], 's'],
  ['Cf', 'Калифорний', 'Californium', 251, 'actinide', 1.3, '[Rn] 5f10 7s2', [3], 's'],
  ['Es', 'Эйнштейний', 'Einsteinium', 252, 'actinide', 1.3, '[Rn] 5f11 7s2', [3], 's'],
  ['Fm', 'Фермий', 'Fermium', 257, 'actinide', 1.3, '[Rn] 5f12 7s2', [3], 's'],
  ['Md', 'Менделевий', 'Mendelevium', 258, 'actinide', 1.3, '[Rn] 5f13 7s2', [3], 's'],
  ['No', 'Нобелий', 'Nobelium', 259, 'actinide', 1.3, '[Rn] 5f14 7s2', [2], 's'],
  ['Lr', 'Лоуренсий', 'Lawrencium', 266, 'actinide', null, '[Rn] 5f14 7s2 7p1', [3], 's'],
  ['Rf', 'Резерфордий', 'Rutherfordium', 267, 'transition', null, '[Rn] 5f14 6d2 7s2', [4], 's'],
  ['Db', 'Дубний', 'Dubnium', 268, 'transition', null, '[Rn] 5f14 6d3 7s2', [5], 's'],
  ['Sg', 'Сиборгий', 'Seaborgium', 269, 'transition', null, '[Rn] 5f14 6d4 7s2', [6], 's'],
  ['Bh', 'Борий', 'Bohrium', 270, 'transition', null, '[Rn] 5f14 6d5 7s2', [7], 's'],
  ['Hs', 'Хассий', 'Hassium', 269, 'transition', null, '[Rn] 5f14 6d6 7s2', [8], 's'],
  ['Mt', 'Мейтнерий', 'Meitnerium', 278, 'transition', null, '[Rn] 5f14 6d7 7s2', [], 's'],
  ['Ds', 'Дармштадтий', 'Darmstadtium', 281, 'transition', null, '[Rn] 5f14 6d8 7s2', [], 's'],
  ['Rg', 'Рентгений', 'Roentgenium', 282, 'transition', null, '[Rn] 5f14 6d9 7s2', [], 's'],
  ['Cn', 'Коперниций', 'Copernicium', 285, 'transition', null, '[Rn] 5f14 6d10 7s2', [], 's'],
  ['Nh', 'Нихоний', 'Nihonium', 286, 'post-transition', null, '[Rn] 5f14 6d10 7s2 7p1', [], 's'],
  ['Fl', 'Флеровий', 'Flerovium', 289, 'post-transition', null, '[Rn] 5f14 6d10 7s2 7p2', [], 's'],
  ['Mc', 'Московий', 'Moscovium', 290, 'post-transition', null, '[Rn] 5f14 6d10 7s2 7p3', [], 's'],
  ['Lv', 'Ливерморий', 'Livermorium', 293, 'post-transition', null, '[Rn] 5f14 6d10 7s2 7p4', [], 's'],
  ['Ts', 'Теннессин', 'Tennessine', 294, 'halogen', null, '[Rn] 5f14 6d10 7s2 7p5', [], 's'],
  ['Og', 'Оганесон', 'Oganesson', 294, 'noble', null, '[Rn] 5f14 6d10 7s2 7p6', [], 's'],
];

// Последние Z каждого периода
const PERIOD_END = [2, 10, 18, 36, 54, 86, 118];
const STATE = { s: 'solid', l: 'liquid', g: 'gas' };

function periodOf(z) {
  return PERIOD_END.findIndex(e => z <= e) + 1;
}

function groupOf(z) {
  const p = periodOf(z);
  const start = p === 1 ? 1 : PERIOD_END[p - 2] + 1;
  const i = z - start; // позиция в периоде, с нуля
  if (p === 1) return z === 1 ? 1 : 18;
  if (p <= 3) return i < 2 ? i + 1 : i + 11;
  if (p <= 5) return i + 1;
  // 6 и 7 периоды: 32 элемента, i = 2..16 — f-блок (La–Lu, Ac–Lr)
  if (i < 2) return i + 1;
  if (i <= 16) return null;
  return i - 13;
}

/** Элементы, у которых нет стабильных изотопов (масса — массовое число изотопа). */
const RADIOACTIVE_ONLY = new Set([43, 61, ...Array.from({ length: 35 }, (_, k) => 84 + k).filter(z => z !== 90 && z !== 91 && z !== 92)]);

export const ELEMENTS = RAW.map((r, idx) => {
  const z = idx + 1;
  const [symbol, name, latin, mass, category, en, config, ox, st] = r;
  const group = groupOf(z);
  const period = periodOf(z);
  let x, y;
  if (group === null) {
    // f-блок: ряды 9 (лантаноиды) и 10 (актиноиды), колонки 3..17
    const first = period === 6 ? 57 : 89;
    x = z - first + 3;
    y = period === 6 ? 9 : 10;
  } else {
    x = group;
    y = period;
  }
  return Object.freeze({
    z, symbol, name, latin, mass, group, period, category, en,
    config: supConfig(config),
    ox: Object.freeze(ox.slice()),
    state: STATE[st],
    radioactive: RADIOACTIVE_ONLY.has(z),
    predicted: z >= 104,
    x, y,
  });
});

export const CATEGORY_NAMES = Object.freeze({
  'alkali': 'Щелочные металлы',
  'alkaline-earth': 'Щёлочноземельные металлы и Be, Mg',
  'transition': 'Переходные металлы',
  'post-transition': 'Постпереходные металлы',
  'metalloid': 'Полуметаллы (металлоиды)',
  'nonmetal': 'Неметаллы',
  'halogen': 'Галогены',
  'noble': 'Благородные газы',
  'lanthanide': 'Лантаноиды',
  'actinide': 'Актиноиды',
});

export const STATE_NAMES = Object.freeze({ solid: 'твёрдое', liquid: 'жидкое', gas: 'газ' });

const BY_SYMBOL = new Map(ELEMENTS.map(e => [e.symbol, e]));

/** Элемент по символу (с учётом регистра: 'Co' ≠ 'CO'), либо undefined. */
export function bySymbol(sym) {
  return BY_SYMBOL.get(String(sym || '').trim());
}

/** Элемент по порядковому номеру, либо undefined. */
export function byZ(z) {
  return ELEMENTS[z - 1];
}

/** Позиция в сетке таблицы: x = 1..18, y = 1..7 (основная часть), 9/10 — лантаноиды/актиноиды. */
export function gridPosition(el) {
  const e = typeof el === 'string' ? bySymbol(el) : (typeof el === 'number' ? byZ(el) : el);
  return e ? { x: e.x, y: e.y } : null;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/**
 * Номер группы в короткопериодной (школьной) форме: 'IА', 'VIIIБ' и т.п. (буквы кириллические).
 * Для лантаноидов/актиноидов — 'IIIБ'.
 */
export function shortGroup(el) {
  const g = el.group;
  if (g === null) return 'IIIБ';
  if (g <= 2) return ROMAN[g] + 'А';
  if (g >= 13) return ROMAN[g - 10] + 'А';
  if (g <= 7) return ROMAN[g] + 'Б';
  if (g <= 10) return 'VIIIБ';
  return ROMAN[g - 10] + 'Б';
}
