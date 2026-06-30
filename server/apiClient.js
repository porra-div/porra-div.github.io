const fs = require('fs');
const path = require('path');
const { asNumber, normalizeText, toText, canonicalTeamName } = require('./utils');

function readPath(obj, paths) {
  for (const p of paths) {
    const parts = p.split('.');
    let cur = obj;
    for (const part of parts) {
      if (cur === null || cur === undefined) break;
      cur = cur[part];
    }
    if (cur !== null && cur !== undefined && cur !== '') return cur;
  }
  return null;
}

function findFirstArray(value, preferredKeys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of preferredKeys) {
    if (Array.isArray(value[key])) return value[key];
    if (value.data && Array.isArray(value.data[key])) return value.data[key];
  }
  if (Array.isArray(value.data)) return value.data;
  for (const child of Object.values(value)) {
    if (Array.isArray(child) && child.length && typeof child[0] === 'object') return child;
  }
  for (const child of Object.values(value)) {
    const arr = findFirstArray(child, preferredKeys);
    if (arr.length) return arr;
  }
  return [];
}

function normalizeTeamObject(team) {
  if (!team) return '';
  if (typeof team === 'string') return canonicalTeamName(team);
  return canonicalTeamName(
    readPath(team, ['name_es', 'nameEn', 'name_en', 'name', 'teamName', 'country', 'title', 'shortName'])
  );
}

function getTeamFromMatch(game, side) {
  const sideTitle = side === 'home' ? 'home' : 'away';
  const alt = side === 'home' ? 'team1' : 'team2';
  const candidate = readPath(game, [
    `${sideTitle}Team.name`, `${sideTitle}Team.name_en`, `${sideTitle}Team.nameEn`,
    `${sideTitle}_team.name`, `${sideTitle}_team.name_en`, `${sideTitle}_team`,
    `${sideTitle}.name`, `${sideTitle}`,
    `${sideTitle}TeamName`, `${sideTitle}_team_name`, `${sideTitle}Name`,
    `${sideTitle}_team_name_en`, `${sideTitle}_team_name_fa`,
    `${alt}.name`, `${alt}`,
    `teams.${sideTitle}.name`, `teams.${sideTitle}`
  ]);
  return normalizeTeamObject(candidate);
}

function getScoreFromMatch(game, side) {
  const prefix = side === 'home' ? 'home' : 'away';
  const altPrefix = side === 'home' ? 'team1' : 'team2';
  return asNumber(readPath(game, [
    `${prefix}Score`, `${prefix}_score`, `${prefix}Goals`, `${prefix}_goals`, `${prefix}_goals_full_time`,
    `score.${prefix}`, `scores.${prefix}`, `score.fullTime.${prefix}`, `score.ft.${prefix}`,
    `goals.${prefix}`, `result.${prefix}`, `${altPrefix}Score`, `${altPrefix}_score`,
    side === 'home' ? 'score1' : 'score2',
    side === 'home' ? 'home_score_current' : 'away_score_current'
  ]));
}

function inferStage(game, matchNumber) {
  const text = normalizeText([
    readPath(game, ['stage', 'round', 'phase', 'matchType', 'type', 'groupName', 'group.name']),
    readPath(game, ['name', 'title', 'description'])
  ].filter(Boolean).join(' '));

  if (matchNumber >= 1 && matchNumber <= 72) return 'group';
  if (matchNumber >= 73 && matchNumber <= 88) return 'round32';
  if (matchNumber >= 89 && matchNumber <= 96) return 'round16';
  if (matchNumber >= 97 && matchNumber <= 100) return 'quarter';
  if (matchNumber >= 101 && matchNumber <= 102) return 'semi';
  if (matchNumber === 103) return 'third';
  if (matchNumber === 104) return 'final';

  if (text.includes('group')) return 'group';
  if (text.includes('round of 32') || text.includes('dieciseis')) return 'round32';
  if (text.includes('round of 16') || text.includes('octav')) return 'round16';
  if (text.includes('quarter') || text.includes('cuarto')) return 'quarter';
  if (text.includes('semi')) return 'semi';
  if (text.includes('third') || text.includes('3')) return 'third';
  if (text.includes('final')) return 'final';
  return 'unknown';
}

function inferGroup(game) {
  const raw = readPath(game, ['group', 'groupName', 'group_name', 'group.name', 'pool', 'poolName']);
  const text = toText(raw);
  const match = text.match(/([A-L])/i);
  return match ? match[1].toUpperCase() : '';
}

function isFinishedStatus(statusRaw) {
  if (statusRaw === true) return true;
  if (statusRaw === false) return false;
  const status = normalizeText(statusRaw);
  if (!status) return false;
  if (['true', '1', 'yes'].includes(status)) return true;
  if (['false', '0', 'no', 'notstarted', 'not started'].includes(status)) return false;
  return /(finished|full time|fulltime|ft|played|complete|completed|ended|finalizado|terminado|after extra|aet|penalties|penalty)/.test(status);
}

const STADIUM_UTC_OFFSETS = {
  // Mexico does not use DST in these host cities; World Cup 2026 is in June.
  1: -6, 2: -6, 3: -6,
  // US Central daylight time.
  4: -5, 5: -5, 6: -5,
  // US/Canada Eastern daylight time.
  7: -4, 8: -4, 9: -4, 10: -4, 11: -4, 12: -4,
  // US/Canada Pacific daylight time.
  13: -7, 14: -7, 15: -7, 16: -7
};

function parseVenueLocalKickoff(value, stadiumId) {
  const raw = toText(value);
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  const offset = STADIUM_UTC_OFFSETS[Number(stadiumId)];
  if (!match || offset === undefined) return raw;
  const [, month, day, year, hour, minute] = match;
  return new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - offset,
    Number(minute)
  )).toISOString();
}

function getKickoff(game) {
  const local = readPath(game, ['local_date', 'localDate']);
  if (local) return parseVenueLocalKickoff(local, readPath(game, ['stadium_id', 'stadiumId', 'stadium.id']));
  return toText(readPath(game, ['date', 'datetime', 'startTime', 'start_time', 'kickoff', 'utcDate']) || '');
}

function normalizeGames(raw) {
  const arr = findFirstArray(raw, ['games', 'matches', 'fixtures', 'data']);
  const sorted = [...arr].sort((a, b) => {
    const na = asNumber(readPath(a, ['matchNumber', 'match_number', 'number', 'gameNumber', 'game_number', 'id']));
    const nb = asNumber(readPath(b, ['matchNumber', 'match_number', 'number', 'gameNumber', 'game_number', 'id']));
    if (na !== null && nb !== null) return na - nb;
    const da = Date.parse(getKickoff(a) || '');
    const db = Date.parse(getKickoff(b) || '');
    if (Number.isFinite(da) && Number.isFinite(db)) return da - db;
    return 0;
  });

  return sorted.map((game, index) => {
    const explicitNumber = asNumber(readPath(game, ['matchNumber', 'match_number', 'number', 'gameNumber', 'game_number']));
    const matchNumber = explicitNumber || index + 1;
    const statusRaw = readPath(game, ['status', 'state', 'matchStatus', 'match_status', 'finished', 'time_elapsed']);
    const homeScore = getScoreFromMatch(game, 'home');
    const awayScore = getScoreFromMatch(game, 'away');
    return {
      raw: game,
      matchNumber,
      stage: inferStage(game, matchNumber),
      group: inferGroup(game),
      homeTeam: getTeamFromMatch(game, 'home'),
      awayTeam: getTeamFromMatch(game, 'away'),
      homeScore,
      awayScore,
      homePenaltyScore: asNumber(readPath(game, ['homePenaltyScore', 'home_penalty_score', 'homePenalties', 'home_penalties', 'penalties.home'])),
      awayPenaltyScore: asNumber(readPath(game, ['awayPenaltyScore', 'away_penalty_score', 'awayPenalties', 'away_penalties', 'penalties.away'])),
      status: toText(statusRaw || ''),
      finished: isFinishedStatus(statusRaw),
      winnerTeam: normalizeTeamObject(readPath(game, ['winner.name', 'winner', 'winnerTeam.name', 'winner_team.name', 'winnerTeam', 'winner_team'])),
      loserTeam: normalizeTeamObject(readPath(game, ['loser.name', 'loser', 'loserTeam.name', 'loser_team.name', 'loserTeam', 'loser_team'])),
      venue: toText(readPath(game, ['venue.name', 'stadium.name', 'stadium', 'venue', 'location']) || ''),
      kickoff: getKickoff(game),
      title: toText(readPath(game, ['name', 'title']) || '')
    };
  });
}

function normalizeGroups(raw) {
  const arr = findFirstArray(raw, ['groups', 'standings', 'tables', 'data']);
  const groups = {};

  function addTeam(groupLetter, team, idx) {
    if (!groupLetter || !team) return;
    if (!groups[groupLetter]) groups[groupLetter] = [];
    groups[groupLetter].push({
      team: normalizeTeamObject(team),
      position: asNumber(readPath(team, ['position', 'rank', 'standing'])) || idx + 1,
      points: asNumber(readPath(team, ['points', 'pts', 'point'])) || 0,
      goalDifference: asNumber(readPath(team, ['goalDifference', 'goal_difference', 'gd', 'diff'])) || 0,
      goalsFor: asNumber(readPath(team, ['goalsFor', 'goals_for', 'gf'])) || 0,
      goalsAgainst: asNumber(readPath(team, ['goalsAgainst', 'goals_against', 'ga'])) || 0
    });
  }

  for (const item of arr) {
    const groupLetter = inferGroup(item);
    const teams = findFirstArray(item, ['teams', 'standings', 'table']);
    if (teams.length) {
      teams.forEach((team, i) => addTeam(groupLetter, team, i));
    } else if (groupLetter) {
      addTeam(groupLetter, item, groups[groupLetter]?.length || 0);
    }
  }

  for (const [group, teams] of Object.entries(groups)) {
    groups[group] = teams.filter((t) => t.team).sort((a, b) => a.position - b.position);
  }

  return groups;
}

function normalizeTeams(raw) {
  const arr = findFirstArray(raw, ['teams', 'data']);
  return arr.map(normalizeTeamObject).filter(Boolean);
}

function normalizeApiData(raw) {
  return {
    games: normalizeGames(raw.gamesRaw || raw.games || raw.matches || []),
    groups: normalizeGroups(raw.groupsRaw || raw.groups || []),
    teams: normalizeTeams(raw.teamsRaw || raw.teams || []),
    fetchedAt: raw.fetchedAt || new Date().toISOString(),
    source: raw.source || 'cache/manual'
  };
}

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'accept': 'application/json' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWorldCupData(options = {}) {
  const base = (options.baseUrl || process.env.WORLD_CUP_API_BASE || 'https://worldcup26.ir').replace(/\/$/, '');
  const cacheFile = path.resolve(process.cwd(), options.cacheFile || process.env.CACHE_FILE || './data/cache/current-api.json');
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });

  try {
    const [gamesRaw, groupsRaw, teamsRaw] = await Promise.all([
      fetchJson(`${base}/get/games`),
      fetchJson(`${base}/get/groups`).catch(() => []),
      fetchJson(`${base}/get/teams`).catch(() => [])
    ]);
    const payload = { gamesRaw, groupsRaw, teamsRaw, fetchedAt: new Date().toISOString(), source: base };
    fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2));
    return normalizeApiData(payload);
  } catch (err) {
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      const normalized = normalizeApiData({ ...cached, source: `${cached.source || base} (cache)` });
      normalized.apiWarning = `No se pudo refrescar la API: ${err.message}. Usando caché.`;
      return normalized;
    }
    return {
      games: [],
      groups: {},
      teams: [],
      fetchedAt: new Date().toISOString(),
      source: base,
      apiWarning: `No se pudo consultar la API y no hay caché: ${err.message}`
    };
  }
}

module.exports = {
  fetchWorldCupData,
  normalizeApiData,
  normalizeGames,
  normalizeGroups,
  normalizeTeams
};
