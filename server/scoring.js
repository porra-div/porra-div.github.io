const { POINTS, STAGE_LABELS } = require('./config');
const {
  asNumber,
  signFromScores,
  goalDiff,
  containsTeam,
  isRealTeam,
  sameTeam,
  teamKey,
  canonicalTeamName,
  uniqueByTeam,
  normalizeText
} = require('./utils');

function buildMatchMap(games) {
  const map = new Map();
  for (const game of games || []) {
    if (game.matchNumber) map.set(Number(game.matchNumber), game);
  }
  return map;
}

function predictedTeams(prediction) {
  return {
    home: prediction.prefix ? prediction.prefix.split('-')[0] : prediction.homeLabel,
    away: prediction.prefix ? prediction.prefix.split('-').slice(1).join('-') : prediction.awayLabel
  };
}

function matchTeamsPrediction(prediction, actual) {
  const teams = predictedTeams(prediction);
  const checks = [
    [teams.home, actual?.homeTeam],
    [teams.away, actual?.awayTeam]
  ].filter(([predicted]) => isRealTeam(predicted));
  return !checks.length || checks.every(([predicted, real]) => sameTeam(predicted, real));
}

function findActualMatchForPrediction(prediction, actual) {
  const byNumber = actual.matchMap.get(Number(prediction.matchNumber));
  if (byNumber && matchTeamsPrediction(prediction, byNumber)) return byNumber;

  const teams = predictedTeams(prediction);
  if (!isRealTeam(teams.home) || !isRealTeam(teams.away)) return byNumber;

  return (actual.games || []).find((match) =>
    match.stage === prediction.stage &&
    sameTeam(teams.home, match.homeTeam) &&
    sameTeam(teams.away, match.awayTeam)
  ) || byNumber;
}

function winnerFromMatch(match) {
  if (!match || !match.finished) return '';
  if (match.winnerTeam) return canonicalTeamName(match.winnerTeam);
  const h = asNumber(match.homeScore);
  const a = asNumber(match.awayScore);
  if (h === null || a === null) return '';
  if (h === a) {
    const hp = asNumber(match.homePenaltyScore);
    const ap = asNumber(match.awayPenaltyScore);
    if (hp === null || ap === null || hp === ap) return '';
    return hp > ap ? match.homeTeam : match.awayTeam;
  }
  return h > a ? match.homeTeam : match.awayTeam;
}

function loserFromMatch(match) {
  if (!match || !match.finished) return '';
  if (match.loserTeam) return canonicalTeamName(match.loserTeam);
  const h = asNumber(match.homeScore);
  const a = asNumber(match.awayScore);
  if (h === null || a === null) return '';
  if (h === a) {
    const hp = asNumber(match.homePenaltyScore);
    const ap = asNumber(match.awayPenaltyScore);
    if (hp === null || ap === null || hp === ap) return '';
    return hp > ap ? match.awayTeam : match.homeTeam;
  }
  return h > a ? match.awayTeam : match.homeTeam;
}

function stageForMatchNumber(matchNumber) {
  if (matchNumber <= 72) return 'group';
  if (matchNumber <= 88) return 'round32';
  if (matchNumber <= 96) return 'round16';
  if (matchNumber <= 100) return 'quarter';
  if (matchNumber <= 102) return 'semi';
  if (matchNumber === 103) return 'third';
  if (matchNumber === 104) return 'final';
  return 'unknown';
}

function scoreMatchPrediction(prediction, actual) {
  const stage = prediction.stage || stageForMatchNumber(prediction.matchNumber);
  const rules = POINTS.match[stage] || { sign: 0, goalDiff: 0, exact: 0 };
  const details = [];

  if (!prediction?.valid || !actual?.finished) {
    return { points: 0, max: Math.max(rules.exact || 0, rules.sign || 0), details, status: 'pending' };
  }

  const actualSign = signFromScores(actual.homeScore, actual.awayScore);
  const exact = prediction.homeGoals === actual.homeScore && prediction.awayGoals === actual.awayScore;
  const sign = prediction.sign === actualSign;
  const diff = goalDiff(prediction.homeGoals, prediction.awayGoals) === goalDiff(actual.homeScore, actual.awayScore);

  // Evita dar puntos de marcador en eliminatorias si la predicción incluye equipos reales distintos del partido real.
  const teamsMatch = matchTeamsPrediction(prediction, actual);

  let points = 0;
  if (exact && teamsMatch) {
    points = rules.exact || 0;
    if (points) details.push(`Resultado exacto: +${points}`);
  } else if (sign && teamsMatch) {
    points = rules.sign || 0;
    if (points) details.push(`Signo 1X2: +${points}`);
    if (diff && rules.goalDiff) {
      points += rules.goalDiff;
      details.push(`Diferencia de goles: +${rules.goalDiff}`);
    }
  }

  return {
    points,
    max: Math.max(rules.exact || 0, rules.sign || 0),
    details,
    status: points > 0 ? 'hit' : 'miss',
    exact,
    sign,
    teamsMatch
  };
}

function computeGroupStandings(games) {
  const standings = {};
  const completedByGroup = {};

  function ensure(group, team) {
    if (!group || !team) return null;
    if (!standings[group]) standings[group] = new Map();
    const key = teamKey(team);
    if (!standings[group].has(key)) {
      standings[group].set(key, {
        team: canonicalTeamName(team),
        played: 0,
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0
      });
    }
    return standings[group].get(key);
  }

  for (const match of games || []) {
    if (match.stage !== 'group' || !match.group) continue;
    const home = ensure(match.group, match.homeTeam);
    const away = ensure(match.group, match.awayTeam);
    if (!match.finished) continue;
    const h = asNumber(match.homeScore);
    const a = asNumber(match.awayScore);
    if (!home || !away || h === null || a === null) continue;
    home.played += 1;
    away.played += 1;
    home.goalsFor += h;
    home.goalsAgainst += a;
    away.goalsFor += a;
    away.goalsAgainst += h;
    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;
    if (h > a) home.points += 3;
    else if (h < a) away.points += 3;
    else {
      home.points += 1;
      away.points += 1;
    }
    completedByGroup[match.group] = (completedByGroup[match.group] || 0) + 1;
  }

  const out = {};
  for (const [group, map] of Object.entries(standings)) {
    out[group] = [...map.values()].sort((a, b) =>
      b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team)
    ).map((team, idx) => ({ ...team, position: idx + 1 }));
  }
  return { standings: out, completedByGroup };
}

function mergeApiAndComputedGroups(apiGroups, computed) {
  const out = { ...(computed.standings || {}) };
  for (const [group, rows] of Object.entries(apiGroups || {})) {
    if (rows?.length) out[group] = rows;
  }
  return out;
}

function allGroupMatchesCompleted(completedByGroup) {
  return Array.from({ length: 12 }, (_, i) => String.fromCharCode(65 + i)).every((group) => (completedByGroup[group] || 0) >= 6);
}

function qualifiedRound32FromGroups(groups, completedByGroup) {
  if (!allGroupMatchesCompleted(completedByGroup)) return [];
  const groupLetters = Array.from({ length: 12 }, (_, i) => String.fromCharCode(65 + i));
  const topTwo = [];
  const thirds = [];
  for (const group of groupLetters) {
    const table = groups[group] || [];
    if (table.length < 4) return [];
    topTwo.push(table[0]?.team, table[1]?.team);
    thirds.push({ group, ...(table[2] || {}) });
  }
  const bestThirds = thirds
    .filter((t) => t.team)
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team))
    .slice(0, 8)
    .map((t) => t.team);
  return uniqueByTeam([...topTwo, ...bestThirds]);
}

function winnersForRange(matchMap, start, end) {
  const winners = [];
  for (let n = start; n <= end; n++) {
    const winner = winnerFromMatch(matchMap.get(n));
    if (winner) winners.push(winner);
  }
  return uniqueByTeam(winners);
}

function losersForRange(matchMap, start, end) {
  const losers = [];
  for (let n = start; n <= end; n++) {
    const loser = loserFromMatch(matchMap.get(n));
    if (loser) losers.push(loser);
  }
  return uniqueByTeam(losers);
}

function lastFinishedMatchNumber(games, predicate) {
  return Math.max(0, ...(games || [])
    .filter((match) => match.finished && predicate(match))
    .map((match) => Number(match.matchNumber) || 0));
}

function groupCompletedAtMatchNumber(actual, group) {
  if ((actual.completedByGroup?.[group] || 0) < 6) return 0;
  return lastFinishedMatchNumber(actual.games, (match) => match.stage === 'group' && match.group === group);
}

function teamQualifiedAtMatchNumber(actual, key, team) {
  if (!team) return 0;
  if (key === 'round32') {
    return lastFinishedMatchNumber(actual.games, (match) => match.stage === 'group');
  }

  const ranges = {
    round16: [73, 88],
    quarter: [89, 96],
    semi: [97, 100],
    thirdPlaceGame: [101, 102],
    final: [101, 102]
  };
  const [start, end] = ranges[key] || [];
  if (!start || !end) return 0;

  for (let n = start; n <= end; n++) {
    const match = actual.matchMap.get(n);
    const qualified = key === 'thirdPlaceGame' ? loserFromMatch(match) : winnerFromMatch(match);
    if (sameTeam(team, qualified)) return Number(match.matchNumber) || n;
  }
  return 0;
}

function buildActualFacts(apiData) {
  const games = apiData.games || [];
  const matchMap = buildMatchMap(games);
  const computed = computeGroupStandings(games);
  const groups = mergeApiAndComputedGroups(apiData.groups, computed);
  const completedByGroup = computed.completedByGroup || {};

  const actual = {
    games,
    matchMap,
    groups,
    completedByGroup,
    qualified: {
      round32: qualifiedRound32FromGroups(groups, completedByGroup),
      round16: winnersForRange(matchMap, 73, 88),
      quarter: winnersForRange(matchMap, 89, 96),
      semi: winnersForRange(matchMap, 97, 100),
      thirdPlaceGame: losersForRange(matchMap, 101, 102),
      final: winnersForRange(matchMap, 101, 102)
    },
    podium: {
      champion: winnerFromMatch(matchMap.get(104)),
      runnerUp: loserFromMatch(matchMap.get(104)),
      thirdPlace: winnerFromMatch(matchMap.get(103))
    }
  };

  return actual;
}

function scoreTeamList(predictions, actualList, pointsPerHit, label) {
  let points = 0;
  const hits = [];
  const misses = [];
  for (const pred of predictions || []) {
    if (!pred.team) continue;
    if (containsTeam(actualList, pred.team)) {
      points += pointsPerHit;
      hits.push(pred.team);
    } else {
      misses.push(pred.team);
    }
  }
  return { points, hits, misses, label, max: (predictions || []).filter((p) => p.team).length * pointsPerHit };
}

function scoreGroupPositions(participant, actual) {
  let points = 0;
  const rows = [];
  for (const pred of participant.predictions.groupPositions || []) {
    if (!pred.team || (actual.completedByGroup[pred.group] || 0) < 6) continue;
    const table = actual.groups[pred.group] || [];
    const actualTeam = table[pred.position - 1]?.team;
    const hit = actualTeam && sameTeam(pred.team, actualTeam);
    if (hit) points += POINTS.groupPosition;
    rows.push({
      group: pred.group,
      position: pred.position,
      prediction: pred.team,
      actual: actualTeam || '',
      points: hit ? POINTS.groupPosition : 0
    });
  }
  return { points, rows };
}

function scorePodium(participant, actual) {
  const checks = [
    ['champion', POINTS.champion, 'Campeón'],
    ['runnerUp', POINTS.runnerUp, 'Subcampeón'],
    ['thirdPlace', POINTS.thirdPlace, '3º puesto']
  ];
  let points = 0;
  const rows = [];
  for (const [key, pts, label] of checks) {
    const pred = participant.predictions.podium[key]?.team;
    const real = actual.podium[key];
    const hit = pred && real && sameTeam(pred, real);
    if (hit) points += pts;
    rows.push({ label, prediction: pred || '', actual: real || '', points: hit ? pts : 0 });
  }
  return { points, rows };
}

function normalizePlayer(value) {
  return normalizeText(String(value || '').replace(/\([^)]*\)/g, ''));
}

function scoreAwards(participant, manualAwards) {
  let points = 0;
  const rows = [];
  const checks = [
    ['goldenBoot', 'gold', POINTS.goldenBoot.gold, 'Bota de Oro'],
    ['goldenBoot', 'silver', POINTS.goldenBoot.silver, 'Bota de Plata'],
    ['goldenBoot', 'bronze', POINTS.goldenBoot.bronze, 'Bota de Bronce'],
    ['goldenBall', 'gold', POINTS.goldenBall.gold, 'Balón de Oro'],
    ['goldenBall', 'silver', POINTS.goldenBall.silver, 'Balón de Plata'],
    ['goldenBall', 'bronze', POINTS.goldenBall.bronze, 'Balón de Bronce']
  ];

  for (const [award, medal, pts, label] of checks) {
    const pred = participant.predictions.awards?.[award]?.[medal]?.name || '';
    const actualList = (manualAwards?.[award] || []).map(normalizePlayer).filter(Boolean);
    const hit = pts > 0 && pred && actualList.includes(normalizePlayer(pred));
    if (hit) points += pts;
    rows.push({ label, prediction: pred, actual: (manualAwards?.[award] || []).join(', '), points: hit ? pts : 0 });
  }
  return { points, rows };
}

function scoreParticipant(participant, apiData, manualAwards = {}) {
  const actual = buildActualFacts(apiData);
  const breakdown = Object.fromEntries(Object.keys(STAGE_LABELS).map((key) => [key, 0]));
  const events = [];
  const matchTimeline = [];
  let total = 0;

  function addTimeline(matchNumber, label, points, type = 'bonus') {
    if (!points || !matchNumber) return;
    matchTimeline.push({ matchNumber, label, points, type });
  }

  for (const [matchNumberRaw, prediction] of Object.entries(participant.predictions.matches || {})) {
    const matchNumber = Number(matchNumberRaw);
    const actualMatch = findActualMatchForPrediction(prediction, actual);
    const score = scoreMatchPrediction(prediction, actualMatch);
    if (actualMatch?.finished && prediction?.valid) {
      matchTimeline.push({
        matchNumber: actualMatch.matchNumber || matchNumber,
        label: `${actualMatch.homeTeam || prediction.homeLabel} - ${actualMatch.awayTeam || prediction.awayLabel}`,
        points: score.points || 0,
        exact: Boolean(score.exact && score.teamsMatch)
      });
    }
    if (score.points) {
      total += score.points;
      breakdown[prediction.stage] += score.points;
      events.push({
        type: 'match',
        stage: prediction.stage,
        matchNumber: actualMatch?.matchNumber || matchNumber,
        label: `${actualMatch?.homeTeam || prediction.homeLabel} - ${actualMatch?.awayTeam || prediction.awayLabel}`,
        prediction: prediction.valid ? `${prediction.homeGoals}-${prediction.awayGoals}` : prediction.raw,
        actual: actualMatch?.finished ? `${actualMatch.homeScore}-${actualMatch.awayScore}` : '',
        points: score.points,
        details: score.details.join(', ')
      });
    }
  }

  const groupPosition = scoreGroupPositions(participant, actual);
  total += groupPosition.points;
  breakdown.group += groupPosition.points;
  groupPosition.rows.filter((r) => r.points).forEach((r) => {
    const label = `${r.position}º Grupo ${r.group}`;
    events.push({ type: 'groupPosition', stage: 'group', label, prediction: r.prediction, actual: r.actual, points: r.points });
    addTimeline(groupCompletedAtMatchNumber(actual, r.group), label, r.points, 'groupPosition');
  });

  const qualifierChecks = [
    ['round32', POINTS.qualifiedRound32, 'Clasificado para dieciseisavos', 'group'],
    ['round16', POINTS.qualifiedRound16, 'Clasificado para octavos', 'round32'],
    ['quarter', POINTS.qualifiedQuarter, 'Clasificado para cuartos', 'round16'],
    ['semi', POINTS.qualifiedSemi, 'Clasificado para semifinales', 'quarter'],
    ['thirdPlaceGame', POINTS.qualifiedThirdPlaceGame, 'Clasificado para 3º/4º puesto', 'semi'],
    ['final', POINTS.qualifiedFinal, 'Clasificado para la final', 'semi']
  ];

  for (const [key, pts, label, stageBucket] of qualifierChecks) {
    const res = scoreTeamList(participant.predictions.qualifiers[key], actual.qualified[key], pts, label);
    total += res.points;
    breakdown[stageBucket] += res.points;
    if (!pts) continue;
    res.hits.forEach((team) => {
      events.push({ type: 'qualifier', stage: stageBucket, label, prediction: team, actual: team, points: pts });
      addTimeline(teamQualifiedAtMatchNumber(actual, key, team), `${label}: ${team}`, pts, 'qualifier');
    });
  }

  const podium = scorePodium(participant, actual);
  total += podium.points;
  breakdown.honor += podium.points;
  podium.rows.filter((r) => {
    if (r.points) addTimeline(104, r.label, r.points, 'honor');
    return r.points;
  }).forEach((r) => events.push({ type: 'podium', stage: 'honor', ...r }));

  const awards = scoreAwards(participant, manualAwards);
  total += awards.points;
  breakdown.awards += awards.points;
  awards.rows.filter((r) => {
    if (r.points) addTimeline(104, r.label, r.points, 'awards');
    return r.points;
  }).forEach((r) => events.push({ type: 'award', stage: 'awards', ...r }));

  const exactScores = events.filter((e) => e.type === 'match' && String(e.details || '').includes('Resultado exacto')).length;
  return {
    id: participant.id,
    name: participant.name,
    file: participant.file,
    total,
    breakdown,
    exactScores,
    hits: events.length,
    timeline: matchTimeline.sort((a, b) => a.matchNumber - b.matchNumber),
    events: events.sort(compareScoreEvents)
  };
}

function compareScoreEvents(a, b) {
  const order = {
    group: 1,
    round32: 2,
    round16: 3,
    quarter: 4,
    semi: 5,
    final: 6,
    honor: 7,
    awards: 8
  };
  return (order[a.stage] || 99) - (order[b.stage] || 99) ||
    (Number(a.matchNumber) || 999) - (Number(b.matchNumber) || 999) ||
    String(a.label || '').localeCompare(String(b.label || ''));
}

function makeLeaderboard(participants, apiData, manualAwards = {}) {
  const scores = participants.map((p) => scoreParticipant(p, apiData, manualAwards));
  scores.sort((a, b) => b.total - a.total || b.exactScores - a.exactScores || a.name.localeCompare(b.name));
  return scores.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

function makeFunFacts(leaderboard, participants, apiData) {
  const facts = [];
  const actual = buildActualFacts(apiData);
  const leader = leaderboard[0];
  if (leader) facts.push({ title: 'Líder provisional', value: leader.name, meta: `${leader.total} puntos` });

  const championPicks = new Map();
  for (const p of participants) {
    const champ = p.predictions.podium.champion?.team;
    if (!champ) continue;
    championPicks.set(champ, (championPicks.get(champ) || 0) + 1);
  }
  const popular = [...championPicks.entries()].sort((a, b) => b[1] - a[1])[0];
  if (popular) facts.push({ title: 'Campeón más apostado', value: popular[0], meta: `${popular[1]} participantes` });

  const unpopular = [...championPicks.entries()].sort((a, b) => a[1] - b[1])[0];
  if (unpopular && unpopular !== popular) facts.push({ title: 'Apuesta diferencial', value: unpopular[0], meta: `${unpopular[1]} participante(s)` });

  const exactKing = [...leaderboard].sort((a, b) => b.exactScores - a.exactScores)[0];
  if (exactKing) facts.push({ title: 'Rey del marcador exacto', value: exactKing.name, meta: `${exactKing.exactScores} exactos` });

  const finished = (apiData.games || []).filter((m) => m.finished).length;
  facts.push({ title: 'Partidos computados', value: finished, meta: 'de 104' });

  if (actual.podium.champion) facts.push({ title: 'Campeón real', value: actual.podium.champion, meta: 'cuadro de honor cerrado' });
  return facts;
}

function fallbackMatchesFromPredictions(participants) {
  const first = participants?.[0];
  if (!first?.predictions?.matches) return [];
  return Object.values(first.predictions.matches).map((p) => ({
    matchNumber: p.matchNumber,
    stage: p.stage,
    group: p.stage === 'group' && p.label ? (p.label.match(/^([A-L])/)?.[1] || '') : '',
    homeTeam: p.homeLabel,
    awayTeam: p.awayLabel,
    homeScore: null,
    awayScore: null,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    status: 'Pendiente',
    finished: false,
    kickoff: '',
    venue: ''
  }));
}

function scoreDashboard(participants, apiData, manualAwards = {}) {
  const leaderboard = makeLeaderboard(participants, apiData, manualAwards);
  const actual = buildActualFacts(apiData);
  const apiMatches = (apiData.games || []).map((m) => ({
    matchNumber: m.matchNumber,
    stage: m.stage,
    group: m.group,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    homePenaltyScore: m.homePenaltyScore,
    awayPenaltyScore: m.awayPenaltyScore,
    status: m.status,
    finished: m.finished,
    kickoff: m.kickoff,
    venue: m.venue
  }));
  return {
    leaderboard,
    funFacts: makeFunFacts(leaderboard, participants, apiData),
    stages: STAGE_LABELS,
    points: POINTS,
    actual: {
      groups: actual.groups,
      completedByGroup: actual.completedByGroup,
      qualified: actual.qualified,
      podium: actual.podium,
      matches: apiMatches.length ? apiMatches : fallbackMatchesFromPredictions(participants)
    }
  };
}

module.exports = {
  scoreDashboard,
  makeLeaderboard,
  buildActualFacts,
  computeGroupStandings,
  scoreParticipant
};
