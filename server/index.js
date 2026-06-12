try { require('dotenv').config(); } catch (_) { /* .env optional */ }
const fs = require('fs');
const path = require('path');
const express = require('express');
const { readParticipants } = require('./excelImporter');
const { fetchWorldCupData } = require('./apiClient');
const { scoreDashboard } = require('./scoring');
const { safeReadJson } = require('./utils');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const REFRESH_MS = Number(process.env.REFRESH_MS || 5 * 60 * 1000);
const ROOT = path.resolve(__dirname, '..');
const PREDICTIONS_DIR = path.resolve(ROOT, process.env.PREDICTIONS_DIR || './data/predictions');
const CACHE_FILE = path.resolve(ROOT, process.env.CACHE_FILE || './data/cache/current-api.json');
const MANUAL_AWARDS_FILE = path.resolve(ROOT, process.env.MANUAL_AWARDS_FILE || './data/manual/awards.json');

let state = {
  loading: true,
  updatedAt: null,
  participants: [],
  importErrors: [],
  apiData: { games: [], groups: {}, teams: [], fetchedAt: null, source: '' },
  dashboard: null,
  error: null
};

async function refreshAll(reason = 'timer') {
  try {
    const { participants, errors } = readParticipants(PREDICTIONS_DIR);
    const apiData = await fetchWorldCupData({ cacheFile: CACHE_FILE });
    const manualAwards = safeReadJson(MANUAL_AWARDS_FILE, { goldenBoot: [], goldenBall: [] });
    const dashboard = scoreDashboard(participants, apiData, manualAwards);
    state = {
      loading: false,
      reason,
      updatedAt: new Date().toISOString(),
      participants,
      importErrors: errors,
      apiData,
      dashboard,
      error: null,
      config: {
        refreshMs: REFRESH_MS,
        predictionsDir: PREDICTIONS_DIR,
        cacheFile: CACHE_FILE,
        manualAwardsFile: MANUAL_AWARDS_FILE
      }
    };
    console.log(`[refresh:${reason}] ${participants.length} participante(s), ${apiData.games.length} partido(s), ${errors.length} error(es)`);
  } catch (err) {
    state = { ...state, loading: false, error: err.stack || err.message, updatedAt: new Date().toISOString() };
    console.error(`[refresh:${reason}] ERROR`, err);
  }
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'public')));

app.get('/api/health', (_, res) => {
  res.json({ ok: true, updatedAt: state.updatedAt, loading: state.loading, error: state.error });
});

app.get('/api/dashboard', (_, res) => {
  res.json({
    loading: state.loading,
    updatedAt: state.updatedAt,
    importErrors: state.importErrors,
    apiWarning: state.apiData?.apiWarning,
    apiSource: state.apiData?.source,
    apiFetchedAt: state.apiData?.fetchedAt,
    config: state.config,
    dashboard: state.dashboard,
    error: state.error
  });
});

app.post('/api/refresh', async (_, res) => {
  await refreshAll('manual');
  res.json({ ok: !state.error, updatedAt: state.updatedAt, error: state.error });
});

app.get('/api/participants', (_, res) => {
  res.json({ participants: state.participants, errors: state.importErrors });
});

app.get('/api/raw', (_, res) => {
  res.json(state);
});

// Endpoint pequeño para editar premios manuales desde un panel futuro o curl.
app.post('/api/manual-awards', (req, res) => {
  const payload = {
    goldenBoot: Array.isArray(req.body.goldenBoot) ? req.body.goldenBoot : [],
    goldenBall: Array.isArray(req.body.goldenBall) ? req.body.goldenBall : []
  };
  fs.mkdirSync(path.dirname(MANUAL_AWARDS_FILE), { recursive: true });
  fs.writeFileSync(MANUAL_AWARDS_FILE, JSON.stringify(payload, null, 2));
  refreshAll('manual-awards').finally(() => res.json({ ok: true, payload }));
});

refreshAll('startup');
setInterval(() => refreshAll('timer'), REFRESH_MS);

app.listen(PORT, () => {
  console.log(`Porra Mundial 2026 corriendo en http://localhost:${PORT}`);
  console.log(`Refresco cada ${Math.round(REFRESH_MS / 1000)} segundos`);
});
