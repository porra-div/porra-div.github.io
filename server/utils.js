function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function removeAccents(value) {
  return toText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeText(value) {
  return removeAccents(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ALIASES = new Map();
function addCanonical(canonical, aliases) {
  [canonical, ...aliases].forEach((alias) => ALIASES.set(normalizeText(alias), canonical));
}

addCanonical('Mexico', ['México', 'MEX', 'Mex']);
addCanonical('South Africa', ['Sudáfrica', 'Southafrica', 'RSA', 'Sud']);
addCanonical('South Korea', ['Corea del Sur', 'Korea Republic', 'Republic of Korea', 'Cor', 'KOR']);
addCanonical('Czech Republic', ['República Checa', 'Czechia', 'Rep', 'CZE']);
addCanonical('Canada', ['Canadá', 'Can', 'CAN']);
addCanonical('Bosnia and Herzegovina', ['Bosnia y Herzegovina', 'Bosnia-Herzegovina', 'Bosnia', 'Bos', 'BIH']);
addCanonical('Qatar', ['Catar', 'Cat', 'QAT']);
addCanonical('Switzerland', ['Suiza', 'Sui', 'SUI']);
addCanonical('Brazil', ['Brasil', 'Bra', 'BRA']);
addCanonical('Morocco', ['Marruecos', 'Mar', 'MAR']);
addCanonical('Haiti', ['Haití', 'Hai', 'HAI']);
addCanonical('Scotland', ['Escocia', 'Esc', 'SCO']);
addCanonical('USA', ['Estados Unidos', 'United States', 'USMNT', 'Est', 'USA']);
addCanonical('Paraguay', ['Par', 'PAR']);
addCanonical('Australia', ['Aus', 'AUS']);
addCanonical('Turkey', ['Turquía', 'Türkiye', 'Turkiye', 'Tur', 'TUR']);
addCanonical('Germany', ['Alemania', 'Ale', 'GER']);
addCanonical('Curacao', ['Curazao', 'Curaçao', 'Cur', 'CUW']);
addCanonical('Ivory Coast', ['Costa de Marfil', "Côte d'Ivoire", 'Cote d Ivoire', 'CIV']);
addCanonical('Ecuador', ['Ecu', 'ECU']);
addCanonical('Netherlands', ['Países Bajos', 'Paises Bajos', 'Holanda', 'Ned', 'NED']);
addCanonical('Japan', ['Japón', 'Japon', 'Jap', 'JPN']);
addCanonical('Sweden', ['Suecia', 'Swe', 'SWE']);
addCanonical('Tunisia', ['Túnez', 'Tunez', 'Tun', 'TUN']);
addCanonical('Belgium', ['Bélgica', 'Belgica', 'Bel', 'BEL']);
addCanonical('Egypt', ['Egipto', 'Egi', 'EGY']);
addCanonical('Iran', ['Irán', 'Irn', 'IRN']);
addCanonical('New Zealand', ['Nueva Zelanda', 'Nue', 'NZL']);
addCanonical('Spain', ['España', 'Espana', 'Esp', 'SPA', 'ESP']);
addCanonical('Cape Verde', ['Cabo Verde', 'Cap', 'CPV']);
addCanonical('Saudi Arabia', ['Arabia Saudita', 'Saudi', 'KSA', 'Sau']);
addCanonical('Uruguay', ['Uru', 'URU']);
addCanonical('France', ['Francia', 'Fra', 'FRA']);
addCanonical('Senegal', ['Sen', 'SEN']);
addCanonical('Iraq', ['Irak', 'Irq', 'IRQ']);
addCanonical('Norway', ['Noruega', 'Nor', 'NOR']);
addCanonical('Argentina', ['Arg', 'ARG']);
addCanonical('Algeria', ['Argelia', 'Alg', 'ALG']);
addCanonical('Austria', ['Aut', 'AUStria', 'AUT']);
addCanonical('Jordan', ['Jordania', 'Jor', 'JOR']);
addCanonical('Portugal', ['Por', 'POR']);
addCanonical('DR Congo', ['RD Congo', 'D.R. Congo', 'Congo DR', 'COD', 'RDC']);
addCanonical('Uzbekistan', ['Uzbekistán', 'Uzb', 'UZB']);
addCanonical('Colombia', ['Col', 'COL']);
addCanonical('England', ['Inglaterra', 'Ing', 'ENG']);
addCanonical('Croatia', ['Croacia', 'Cro', 'CRO']);
addCanonical('Ghana', ['Gha', 'GHA']);
addCanonical('Panama', ['Panamá', 'Panama', 'Pan', 'PAN']);

function canonicalTeamName(value) {
  const raw = toText(value)
    .replace(/^[🥇🥈🥉\s]+/u, '')
    .replace(/\([^)]*\)/g, '')
    .trim();
  const norm = normalizeText(raw);
  if (!norm) return '';
  return ALIASES.get(norm) || raw;
}

function teamKey(value) {
  return normalizeText(canonicalTeamName(value));
}

function sameTeam(a, b) {
  return teamKey(a) !== '' && teamKey(a) === teamKey(b);
}

function isPlaceholderTeam(value) {
  const text = toText(value);
  const norm = normalizeText(text);
  if (!text) return true;
  if (norm.includes('grupo') || norm.includes('finalista') || norm.includes('escribe un jugador')) return true;
  if (/^[wl](f|\d*)$/i.test(text)) return true;
  if (/^w[0-9]+$/i.test(text) || /^l[0-9]+$/i.test(text)) return true;
  if (/^\d+[a-l]$/i.test(text)) return true;
  if (/^\d+[a-l]{2,}$/i.test(text)) return true;
  if (/^[a-l]$/i.test(text)) return true;
  if (/^[0-9]+º/.test(text)) return true;
  if (/^[0-9]+\|/.test(text)) return true;
  return false;
}

function isRealTeam(value) {
  return !isPlaceholderTeam(value);
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function signFromScores(home, away) {
  const h = asNumber(home);
  const a = asNumber(away);
  if (h === null || a === null) return '';
  if (h > a) return '1';
  if (h < a) return '2';
  return 'X';
}

function goalDiff(home, away) {
  const h = asNumber(home);
  const a = asNumber(away);
  if (h === null || a === null) return null;
  return h - a;
}

function parseScorePrediction(value) {
  const raw = toText(value);
  if (!raw) return { raw, valid: false, sign: '', homeGoals: null, awayGoals: null, prefix: '' };

  let prefix = '';
  let scoreText = raw;
  if (raw.includes('·')) {
    const parts = raw.split('·');
    prefix = parts.slice(0, -1).join('·');
    scoreText = parts.at(-1);
  }

  const [signPart = '', scorePart = ''] = scoreText.split('|');
  const sign = toText(signPart).toUpperCase().replace('EMPATE', 'X');
  let homeGoals = null;
  let awayGoals = null;
  if (scorePart && scorePart.includes('-')) {
    const [h, a] = scorePart.split('-');
    homeGoals = asNumber(h);
    awayGoals = asNumber(a);
  }

  const valid = homeGoals !== null && awayGoals !== null && ['1', 'X', '2'].includes(signFromScores(homeGoals, awayGoals));
  return {
    raw,
    prefix,
    scoreText,
    sign: ['1', 'X', '2'].includes(sign) ? sign : signFromScores(homeGoals, awayGoals),
    homeGoals,
    awayGoals,
    valid
  };
}

function splitFixtureLabel(label) {
  const cleaned = toText(label).replace(/\s+vs\s+/i, '-');
  if (!cleaned.includes('-')) return { home: '', away: '' };
  const parts = cleaned.split('-');
  return { home: parts[0].trim(), away: parts.slice(1).join('-').trim() };
}

function uniqueByTeam(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    if (!isRealTeam(value)) continue;
    const key = teamKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(canonicalTeamName(value));
  }
  return out;
}

function containsTeam(list, value) {
  const key = teamKey(value);
  if (!key) return false;
  return (list || []).some((item) => teamKey(item) === key);
}

function safeReadJson(file, fallback) {
  try {
    return require('fs').existsSync(file) ? JSON.parse(require('fs').readFileSync(file, 'utf8')) : fallback;
  } catch (err) {
    return fallback;
  }
}

module.exports = {
  toText,
  normalizeText,
  canonicalTeamName,
  teamKey,
  sameTeam,
  isPlaceholderTeam,
  isRealTeam,
  asNumber,
  signFromScores,
  goalDiff,
  parseScorePrediction,
  splitFixtureLabel,
  uniqueByTeam,
  containsTeam,
  safeReadJson
};
