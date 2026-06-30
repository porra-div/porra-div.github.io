const range = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => start + i);

const STAGE_LABELS = {
  group: 'Fase de grupos',
  round32: 'Dieciseisavos',
  round16: 'Octavos',
  quarter: 'Cuartos',
  semi: 'Semifinales',
  third: '3º y 4º puesto',
  final: 'Final',
  honor: 'Cuadro de honor',
  awards: 'Premios individuales'
};

// Puntuación introducida desde las capturas compartidas por Rodrigo.
// Exacto sustituye al signo: un resultado exacto de fase de grupos da 2 puntos, no 1+2.
const POINTS = {
  match: {
    group: { sign: 1, goalDiff: 0, exact: 2 },
    round32: { sign: 0, goalDiff: 0, exact: 2 },
    round16: { sign: 0, goalDiff: 0, exact: 2 },
    quarter: { sign: 0, goalDiff: 0, exact: 2 },
    semi: { sign: 0, goalDiff: 0, exact: 2 },
    third: { sign: 0, goalDiff: 0, exact: 0 },
    final: { sign: 0, goalDiff: 0, exact: 2 }
  },
  groupPosition: 1,
  qualifiedRound32: 2,
  qualifiedRound16: 2,
  qualifiedQuarter: 2,
  qualifiedSemi: 2,
  qualifiedThirdPlaceGame: 0,
  qualifiedFinal: 2,
  champion: 4,
  runnerUp: 1,
  thirdPlace: 0,
  goldenBoot: { gold: 2, silver: 0, bronze: 0 },
  goldenBall: { gold: 2, silver: 0, bronze: 0 }
};

const MATCH_ROWS = [
  ...range(6, 77).map((row, i) => ({ row, matchNumber: i + 1, stage: 'group' })),
  ...range(164, 179).map((row, i) => ({ row, matchNumber: 73 + i, stage: 'round32' })),
  ...range(200, 207).map((row, i) => ({ row, matchNumber: 89 + i, stage: 'round16' })),
  ...range(220, 223).map((row, i) => ({ row, matchNumber: 97 + i, stage: 'quarter' })),
  ...range(232, 233).map((row, i) => ({ row, matchNumber: 101 + i, stage: 'semi' })),
  { row: 244, matchNumber: 103, stage: 'third' },
  { row: 247, matchNumber: 104, stage: 'final' }
];

const QUALIFIER_ROWS = {
  round32: range(130, 161),
  round16: range(182, 197),
  quarter: range(210, 217),
  semi: range(226, 229),
  thirdPlaceGame: range(236, 237),
  final: range(240, 241)
};

const PODIUM_ROWS = {
  champion: 250,
  runnerUp: 251,
  thirdPlace: 252
};

const AWARD_ROWS = {
  goldenBoot: { gold: 253, silver: 254, bronze: 255 },
  goldenBall: { gold: 256, silver: 257, bronze: 258 }
};

const GROUP_POSITION_ROWS = range(80, 127);

module.exports = {
  STAGE_LABELS,
  POINTS,
  MATCH_ROWS,
  QUALIFIER_ROWS,
  GROUP_POSITION_ROWS,
  PODIUM_ROWS,
  AWARD_ROWS
};
