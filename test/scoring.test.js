const assert = require('assert');
const { scoreParticipant } = require('../server/scoring');
const { buildActualFacts } = require('../server/scoring');

function participantWithMatch(prediction) {
  return {
    id: 'test',
    name: 'Test',
    file: 'test.xlsx',
    predictions: {
      matches: { [prediction.matchNumber]: prediction },
      groupPositions: [],
      qualifiers: {
        round32: [],
        round16: [],
        quarter: [],
        semi: [],
        thirdPlaceGame: [],
        final: []
      },
      podium: {},
      awards: {}
    }
  };
}

function match(overrides) {
  return {
    matchNumber: 73,
    stage: 'round32',
    homeTeam: 'Germany',
    awayTeam: 'Paraguay',
    homeScore: 1,
    awayScore: 1,
    finished: true,
    ...overrides
  };
}

function prediction(overrides) {
  return {
    matchNumber: 73,
    stage: 'round32',
    prefix: 'Brazil-Netherlands',
    homeLabel: 'Brazil',
    awayLabel: 'Netherlands',
    raw: 'Brazil-Netherlands·X|1-1',
    sign: 'X',
    homeGoals: 1,
    awayGoals: 1,
    valid: true,
    ...overrides
  };
}

{
  const result = scoreParticipant(participantWithMatch(prediction()), {
    games: [match()],
    groups: {}
  });
  assert.equal(result.total, 0, 'no puntua un exacto si los equipos reales del partido son otros');
  assert.equal(result.exactScores, 0, 'no cuenta exacto si solo coincide el marcador');
}

{
  const result = scoreParticipant(participantWithMatch(prediction({
    prefix: 'Brazil-W74',
    homeLabel: 'Brazil',
    awayLabel: 'W74'
  })), {
    games: [match({ homeTeam: 'Germany', awayTeam: 'Paraguay' })],
    groups: {}
  });
  assert.equal(result.total, 0, 'no puntua si el unico equipo real predicho no coincide con su lado');
}

{
  const result = scoreParticipant(participantWithMatch(prediction()), {
    games: [
      match({ matchNumber: 73, homeTeam: 'Germany', awayTeam: 'Paraguay', homeScore: 0, awayScore: 0 }),
      match({ matchNumber: 74, homeTeam: 'Brazil', awayTeam: 'Netherlands', homeScore: 1, awayScore: 1 })
    ],
    groups: {}
  });
  assert.equal(result.total, 2, 'si el emparejamiento real existe en otro numero, usa ese partido');
  assert.equal(result.exactScores, 1, 'el exacto cuenta cuando equipos y resultado coinciden');
}

{
  const actual = buildActualFacts({
    games: [
      match({
        matchNumber: 104,
        stage: 'final',
        homeTeam: 'Spain',
        awayTeam: 'France',
        homeScore: 1,
        awayScore: 1,
        homePenaltyScore: 5,
        awayPenaltyScore: 4
      })
    ],
    groups: {}
  });
  assert.equal(actual.podium.champion, 'Spain', 'el campeon se resuelve por penaltis si el partido queda empatado');
  assert.equal(actual.podium.runnerUp, 'France', 'el subcampeon se resuelve por penaltis si el partido queda empatado');
}

{
  const actual = buildActualFacts({
    games: [
      match({
        matchNumber: 73,
        stage: 'round32',
        homeTeam: 'Germany',
        awayTeam: 'Paraguay',
        homeScore: 1,
        awayScore: 1,
        homePenaltyScore: 3,
        awayPenaltyScore: 4
      })
    ],
    groups: {}
  });
  assert.deepEqual(actual.qualified.round16, ['Paraguay'], 'los clasificados de eliminatorias se resuelven por penaltis');
}

console.log('scoring tests ok');
