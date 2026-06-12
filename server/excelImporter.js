const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const {
  MATCH_ROWS,
  QUALIFIER_ROWS,
  GROUP_POSITION_ROWS,
  PODIUM_ROWS,
  AWARD_ROWS
} = require('./config');
const {
  toText,
  parseScorePrediction,
  splitFixtureLabel,
  isRealTeam,
  canonicalTeamName
} = require('./utils');

function getCell(sheet, addr) {
  const cell = sheet?.[addr];
  if (!cell) return '';
  return toText(cell.w ?? cell.v ?? '');
}

function resolvePredictionDir(dir) {
  return path.resolve(process.cwd(), dir || './data/predictions');
}

function listExcelFiles(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return fs
    .readdirSync(dir)
    .filter((file) => /\.(xlsx|xlsm|xls)$/i.test(file) && !file.startsWith('~$'))
    .map((file) => path.join(dir, file));
}

function participantNameFromFile(filePath) {
  return path
    .basename(filePath)
    .replace(/\.(xlsx|xlsm|xls)$/i, '')
    .replace(/^excel\s+mundial\s+2026\s+/i, '')
    .trim();
}

function parseGroupPositionLabel(label) {
  const clean = toText(label).toUpperCase();
  const posMatch = clean.match(/(1|2|3|4)º/);
  const groupMatch = clean.match(/GRUPO\s+([A-L])/i);
  return {
    group: groupMatch ? groupMatch[1].toUpperCase() : '',
    position: posMatch ? Number(posMatch[1]) : null
  };
}

function readParticipantFromWorkbook(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true, raw: false });
  const sheet = wb.Sheets.Pool || wb.Sheets.pool || wb.Sheets.POOL;
  if (!sheet) {
    throw new Error(`No encuentro la hoja "Pool" en ${path.basename(filePath)}`);
  }

  let name = getCell(sheet, 'C5');
  if (!name || /^nombre$/i.test(name)) {
    name = participantNameFromFile(filePath);
  }

  const participant = {
    id: path.basename(filePath).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(),
    name,
    file: path.basename(filePath),
    predictions: {
      matches: {},
      groupPositions: [],
      qualifiers: {},
      podium: {},
      awards: {}
    },
    warnings: []
  };

  for (const item of MATCH_ROWS) {
    const row = item.row;
    const label = getCell(sheet, `B${row}`);
    const value = getCell(sheet, `C${row}`);
    const fixture = splitFixtureLabel(label);
    participant.predictions.matches[item.matchNumber] = {
      row,
      stage: item.stage,
      matchNumber: item.matchNumber,
      label,
      homeLabel: fixture.home,
      awayLabel: fixture.away,
      ...parseScorePrediction(value)
    };
  }

  for (const row of GROUP_POSITION_ROWS) {
    const label = getCell(sheet, `B${row}`);
    const value = getCell(sheet, `C${row}`);
    const meta = parseGroupPositionLabel(label);
    if (meta.group && meta.position) {
      participant.predictions.groupPositions.push({
        row,
        group: meta.group,
        position: meta.position,
        label,
        value,
        team: isRealTeam(value) ? canonicalTeamName(value) : ''
      });
    }
  }

  for (const [stage, rows] of Object.entries(QUALIFIER_ROWS)) {
    participant.predictions.qualifiers[stage] = rows.map((row) => {
      const value = getCell(sheet, `C${row}`);
      return {
        row,
        value,
        team: isRealTeam(value) ? canonicalTeamName(value) : '',
        label: getCell(sheet, `B${row}`)
      };
    });
  }

  for (const [key, row] of Object.entries(PODIUM_ROWS)) {
    const value = getCell(sheet, `C${row}`);
    participant.predictions.podium[key] = {
      row,
      value,
      team: isRealTeam(value) ? canonicalTeamName(value) : ''
    };
  }

  for (const [award, rows] of Object.entries(AWARD_ROWS)) {
    participant.predictions.awards[award] = {};
    for (const [medal, row] of Object.entries(rows)) {
      const value = getCell(sheet, `C${row}`);
      participant.predictions.awards[award][medal] = {
        row,
        value,
        name: /^escribe un jugador$/i.test(value) ? '' : value
      };
    }
  }

  return participant;
}

function readParticipants(dir) {
  const fullDir = resolvePredictionDir(dir);
  const files = listExcelFiles(fullDir);
  const participants = [];
  const errors = [];

  for (const file of files) {
    try {
      participants.push(readParticipantFromWorkbook(file));
    } catch (err) {
      errors.push({ file: path.basename(file), message: err.message });
    }
  }

  return { participants, errors, dir: fullDir };
}

module.exports = {
  readParticipants,
  readParticipantFromWorkbook,
  getCell
};
