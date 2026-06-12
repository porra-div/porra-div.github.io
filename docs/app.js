let state = null;
let selectedParticipantId = null;
let selectedPredictionParticipantId = null;
let selectedGroup = '';
let filter = '';

const $ = (selector) => document.querySelector(selector);
const fmtDate = (value) => value ? new Date(value).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const STATIC_DATA_URL = 'static-data.json';
const WORLD_CUP_API_BASE = 'https://worldcup26.ir';
let staticData = null;
let staticMode = false;

async function loadDashboard() {
  try {
    if (staticMode) throw new Error('static mode');
    const res = await fetch('/api/dashboard');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state = await res.json();
    await hydrateLocalParticipants();
  } catch (_) {
    staticMode = true;
    state = await loadStaticDashboard();
  }
  render();
}

async function forceRefresh() {
  const btn = $('#refreshBtn');
  btn.disabled = true;
  btn.textContent = 'Actualizando…';
  try {
    if (staticMode) {
      state = await loadStaticDashboard({ forceApi: true });
      render();
    } else {
      await fetch('/api/refresh', { method: 'POST' });
      await loadDashboard();
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Actualizar ahora';
  }
}

async function loadStaticData() {
  if (staticData) return staticData;
  const res = await fetch(`${STATIC_DATA_URL}?v=${Date.now()}`);
  if (!res.ok) throw new Error(`No se pudo cargar ${STATIC_DATA_URL}: HTTP ${res.status}`);
  staticData = await res.json();
  return staticData;
}

async function hydrateLocalParticipants() {
  if (state.participants?.length) return;
  try {
    const res = await fetch('/api/participants');
    if (!res.ok) return;
    const payload = await res.json();
    state.participants = payload.participants || [];
  } catch (_) {
    state.participants = [];
  }
}

async function fetchStaticApiData(fallback, forceApi = false) {
  if (!window.PorraEngine) throw new Error('No está cargado static-engine.js');
  try {
    const cacheMode = forceApi ? 'reload' : 'default';
    const [gamesRaw, groupsRaw, teamsRaw] = await Promise.all([
      fetch(`${WORLD_CUP_API_BASE}/get/games`, { cache: cacheMode }).then((res) => {
        if (!res.ok) throw new Error(`games HTTP ${res.status}`);
        return res.json();
      }),
      fetch(`${WORLD_CUP_API_BASE}/get/groups`, { cache: cacheMode }).then((res) => res.ok ? res.json() : []),
      fetch(`${WORLD_CUP_API_BASE}/get/teams`, { cache: cacheMode }).then((res) => res.ok ? res.json() : [])
    ]);
    return window.PorraEngine.normalizeApiData({
      gamesRaw,
      groupsRaw,
      teamsRaw,
      fetchedAt: new Date().toISOString(),
      source: WORLD_CUP_API_BASE
    });
  } catch (err) {
    return {
      ...(fallback || { games: [], groups: {}, teams: [] }),
      source: `${fallback?.source || 'static-data'} (fallback)`,
      apiWarning: `No se pudo consultar la API desde el navegador: ${err.message}. Usando datos estáticos.`
    };
  }
}

async function loadStaticDashboard(options = {}) {
  const data = await loadStaticData();
  const apiData = await fetchStaticApiData(data.apiData, options.forceApi);
  const dashboard = window.PorraEngine.scoreDashboard(data.participants || [], apiData, data.manualAwards || {});
  return {
    loading: false,
    updatedAt: new Date().toISOString(),
    importErrors: data.importErrors || [],
    apiWarning: apiData.apiWarning,
    apiSource: apiData.source,
    apiFetchedAt: apiData.fetchedAt,
    config: {
      refreshMs: 5 * 60 * 1000,
      mode: 'github-pages',
      staticGeneratedAt: data.generatedAt
    },
    dashboard,
    participants: data.participants || [],
    error: null
  };
}

function renderAlerts() {
  const alerts = [];
  if (state.error) alerts.push(`Error interno: ${state.error}`);
  if (state.apiWarning) alerts.push(state.apiWarning);
  if (state.importErrors?.length) {
    alerts.push(`Hay ${state.importErrors.length} Excel con error: ${state.importErrors.map((e) => `${e.file}: ${e.message}`).join(' · ')}`);
  }
  if (!state.dashboard?.leaderboard?.length) alerts.push('No hay participantes cargados. Mete los .xlsx en data/predictions y pulsa actualizar.');
  $('#alerts').innerHTML = alerts.map((msg) => `<div class="alert">${esc(msg)}</div>`).join('');
}

function renderStatus() {
  const badge = $('#statusBadge');
  badge.textContent = state.loading ? 'Cargando…' : `Actualizado: ${fmtDate(state.updatedAt)}`;
}

function renderFunFacts() {
  const facts = state.dashboard?.funFacts || [];
  $('#funFacts').innerHTML = facts.map((f) => `
    <article class="kpi">
      <div class="kpi-title">${esc(f.title)}</div>
      <div class="kpi-value">${esc(f.value)}</div>
      <div class="kpi-meta">${esc(f.meta || '')}</div>
    </article>
  `).join('');
}

function renderLeaderboard() {
  const rows = (state.dashboard?.leaderboard || [])
    .filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));
  if (!selectedParticipantId && rows[0]) selectedParticipantId = rows[0].id;
  const html = rows.map((p) => `
    <tr data-id="${esc(p.id)}" class="${p.id === selectedParticipantId ? 'active' : ''}">
      <td><span class="rank ${p.rank <= 3 ? 'top' : ''}">${p.rank}</span></td>
      <td><strong>${esc(p.name)}</strong></td>
      <td><span class="total">${p.total}</span></td>
      <td>${p.exactScores}</td>
      <td><span class="stage-chip">${p.breakdown.group || 0}</span></td>
      <td><span class="stage-chip">${p.breakdown.round32 || 0}</span></td>
      <td><span class="stage-chip">${p.breakdown.round16 || 0}</span></td>
      <td><span class="stage-chip">${p.breakdown.quarter || 0}</span></td>
      <td><span class="stage-chip">${p.breakdown.semi || 0}</span></td>
      <td><span class="stage-chip">${p.breakdown.honor || 0}</span></td>
      <td><span class="stage-chip">${p.breakdown.awards || 0}</span></td>
      <td><button class="small-button prediction-open" data-id="${esc(p.id)}" type="button">Predicciones</button></td>
    </tr>
  `).join('');
  $('#leaderboardTable tbody').innerHTML = html || `<tr><td colspan="12" class="empty">No hay participantes que coincidan con la búsqueda.</td></tr>`;
  document.querySelectorAll('#leaderboardTable tbody tr[data-id]').forEach((row) => {
    row.addEventListener('click', () => {
      selectedParticipantId = row.dataset.id;
      selectedPredictionParticipantId = row.dataset.id;
      renderLeaderboard();
      renderParticipantDetails();
    });
  });
  document.querySelectorAll('.prediction-open').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openPredictions(btn.dataset.id);
    });
  });
}

function renderParticipantDetails() {
  const leaderboard = state.dashboard?.leaderboard || [];
  const person = leaderboard.find((p) => p.id === selectedParticipantId) || leaderboard[0];
  if (!person) {
    $('#participantDetails').innerHTML = `<div class="empty">Sin participante seleccionado.</div>`;
    return;
  }
  $('#detailSubtitle').textContent = `${person.name} · ${person.total} puntos · ${person.exactScores} exactos`;
  const events = person.events || [];
  const predictionButton = `<button class="small-button wide prediction-open-detail" data-id="${esc(person.id)}" type="button">Ver predicciones</button>`;
  $('#participantDetails').innerHTML = predictionButton + (events.length ? events.map((e) => `
    <div class="detail-event">
      <strong>${esc(e.label || e.type)} <span class="points-pill">+${e.points}</span></strong>
      <div class="detail-meta">Predicción: ${esc(e.prediction || '')}${e.actual ? ` · Real: ${esc(e.actual)}` : ''}</div>
      ${e.details ? `<div class="detail-meta">${esc(e.details)}</div>` : ''}
    </div>
  `).join('') : `<div class="empty">Todavía no tiene aciertos computados.</div>`);
  document.querySelector('.prediction-open-detail')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    openPredictions(ev.currentTarget.dataset.id);
  });
}

function renderMatches() {
  const matches = state.dashboard?.actual?.matches || [];
  const visible = matches
    .filter((m) => m.homeTeam || m.awayTeam)
    .sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return (a.matchNumber || 0) - (b.matchNumber || 0);
    })
    .slice(0, 16);
  $('#matchesList').innerHTML = visible.length ? visible.map((m) => `
    <div class="match ${m.finished ? 'finished' : ''}">
      <div>
        <div class="match-title">${esc(m.homeTeam || 'TBD')} - ${esc(m.awayTeam || 'TBD')}</div>
        <div class="match-meta">#${esc(m.matchNumber)} · ${esc(stageName(m.stage))}${m.group ? ` · Grupo ${esc(m.group)}` : ''}${m.venue ? ` · ${esc(m.venue)}` : ''}</div>
        <div class="match-meta">${m.finished ? 'Finalizado' : (m.kickoff ? fmtDate(m.kickoff) : esc(m.status || 'Pendiente'))}</div>
      </div>
      <div class="score">${m.homeScore ?? '–'}-${m.awayScore ?? '–'}</div>
    </div>
  `).join('') : `<div class="empty">La API aún no ha devuelto partidos normalizables.</div>`;
}

function stageName(stage) {
  return state.dashboard?.stages?.[stage] || stage || '';
}

function renderQualified() {
  const q = state.dashboard?.actual?.qualified || {};
  const podium = state.dashboard?.actual?.podium || {};
  const sections = [
    ['round32', 'Clasificados a dieciseisavos'],
    ['round16', 'Clasificados a octavos'],
    ['quarter', 'Clasificados a cuartos'],
    ['semi', 'Clasificados a semifinales'],
    ['final', 'Finalistas'],
    ['thirdPlaceGame', '3º y 4º puesto']
  ];
  let html = sections.map(([key, label]) => {
    const teams = q[key] || [];
    return `<div class="qualified-section"><h3>${esc(label)}</h3>${teamTags(teams)}</div>`;
  }).join('');
  html += `<div class="qualified-section"><h3>Cuadro de honor</h3>${teamTags([podium.champion && `🥇 ${podium.champion}`, podium.runnerUp && `🥈 ${podium.runnerUp}`, podium.thirdPlace && `🥉 ${podium.thirdPlace}`].filter(Boolean))}</div>`;
  $('#qualifiedList').innerHTML = html;
}

function teamTags(teams) {
  return teams?.length ? `<div class="team-tags">${teams.map((t) => `<span class="team-tag">${esc(t)}</span>`).join('')}</div>` : `<div class="muted">Pendiente</div>`;
}

function renderGroups() {
  const groups = state.dashboard?.actual?.groups || {};
  const matches = state.dashboard?.actual?.matches || [];
  const letters = groupLetters(groups, matches);
  const select = $('#groupSelect');

  if (!letters.length) {
    select.innerHTML = '';
    $('#groupsGrid').innerHTML = `<div class="empty">Sin grupos todavía.</div>`;
    return;
  }

  if (!selectedGroup || !letters.includes(selectedGroup)) selectedGroup = letters[0];
  select.innerHTML = letters.map((letter) => `<option value="${esc(letter)}" ${letter === selectedGroup ? 'selected' : ''}>Grupo ${esc(letter)}</option>`).join('');

  const rows = groupRows(selectedGroup, groups, matches);
  const groupMatches = matches
    .filter((m) => m.stage === 'group' && m.group === selectedGroup && (m.homeTeam || m.awayTeam))
    .sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0));

  $('#groupsGrid').innerHTML = `
    <article class="group-card featured">
      <h3>Grupo ${esc(selectedGroup)}</h3>
      <div class="group-row muted"><span>#</span><span>Equipo</span><span>Pts</span><span>DG</span></div>
      ${rows.map((t, i) => `
        <div class="group-row">
          <span>${t.position || i + 1}</span><span>${esc(t.team)}</span><span>${t.points ?? 0}</span><span>${t.goalDifference ?? 0}</span>
        </div>
      `).join('')}
    </article>
    <article class="group-card featured">
      <h3>Partidos del grupo</h3>
      <div class="mini-matches">
        ${groupMatches.map((m) => `
          <div class="mini-match ${m.finished ? 'finished' : ''}">
            <span>${esc(m.homeTeam || 'TBD')} - ${esc(m.awayTeam || 'TBD')}</span>
            <strong>${m.homeScore ?? '–'}-${m.awayScore ?? '–'}</strong>
          </div>
        `).join('') || `<div class="muted">Pendiente</div>`}
      </div>
    </article>
  `;
}

function openPredictions(participantId) {
  selectedPredictionParticipantId = participantId || selectedParticipantId;
  renderPredictionsPanel();
  $('#predictionsModal').classList.add('open');
  $('#predictionsModal').setAttribute('aria-hidden', 'false');
}

function closePredictions() {
  $('#predictionsModal').classList.remove('open');
  $('#predictionsModal').setAttribute('aria-hidden', 'true');
}

function renderPredictionsPanel() {
  const participants = state.participants || [];
  const content = $('#predictionsContent');
  if (!participants.length) {
    content.innerHTML = `<div class="empty">No hay predicciones cargadas.</div>`;
    return;
  }

  if (!selectedPredictionParticipantId || !participants.some((p) => p.id === selectedPredictionParticipantId)) {
    selectedPredictionParticipantId = selectedParticipantId || participants[0].id;
  }
  const person = participants.find((p) => p.id === selectedPredictionParticipantId) || participants[0];
  $('#predictionsTitle').textContent = `Predicciones de ${person.name}`;
  $('#predictionsSubtitle').textContent = 'Verde acertado · Rojo fallado · Amarillo pendiente';

  content.innerHTML = `
    <div class="prediction-player-list">
      ${participants.map((p) => `<button class="small-button ${p.id === person.id ? 'active' : ''}" data-prediction-player="${esc(p.id)}" type="button">${esc(p.name)}</button>`).join('')}
    </div>
    <div class="prediction-grid">
      ${predictionMatchesTable(person)}
      ${predictionGroupTable(person)}
      ${predictionQualifiersTable(person)}
      ${predictionHonorTable(person)}
    </div>
  `;
  document.querySelectorAll('[data-prediction-player]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedPredictionParticipantId = btn.dataset.predictionPlayer;
      selectedParticipantId = btn.dataset.predictionPlayer;
      renderLeaderboard();
      renderParticipantDetails();
      renderPredictionsPanel();
    });
  });
}

function predictionMatchesTable(person) {
  const rows = Object.values(person.predictions?.matches || {}).sort((a, b) => a.matchNumber - b.matchNumber);
  return predictionSection('Partidos', `
    <div class="excel-wrap">
      <table class="excel-table predictions-matches">
        <thead><tr><th>#</th><th>Fase</th><th>Partido</th><th>Pronóstico</th><th>Real</th><th>Estado</th></tr></thead>
        <tbody>
          ${rows.map((m) => {
            const status = matchPredictionStatus(m);
            return `
            <tr class="${status.className}">
              <td>${m.matchNumber}</td>
              <td>${esc(stageName(m.stage))}</td>
              <td>${esc(m.label || `${m.homeLabel || ''}-${m.awayLabel || ''}`)}</td>
              <td><strong>${esc(formatPredictionScore(m))}</strong></td>
              <td>${esc(status.actualText)}</td>
              <td><span class="status-pill">${esc(status.label)}</span></td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>
  `);
}

function predictionGroupTable(person) {
  const rows = person.predictions?.groupPositions || [];
  return predictionSection('Grupos', `
    <div class="excel-wrap">
      <table class="excel-table">
        <thead><tr><th>Grupo</th><th>Posición</th><th>Equipo</th><th>Estado</th></tr></thead>
        <tbody>
          ${rows.map((r) => {
            const status = groupPredictionStatus(r);
            return `<tr class="${status.className}"><td>${esc(r.group)}</td><td>${r.position}</td><td><strong>${esc(r.value || r.team)}</strong></td><td><span class="status-pill">${esc(status.label)}</span></td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `);
}

function predictionQualifiersTable(person) {
  const labels = {
    round32: 'Dieciseisavos',
    round16: 'Octavos',
    quarter: 'Cuartos',
    semi: 'Semifinales',
    thirdPlaceGame: '3º y 4º puesto',
    final: 'Final'
  };
  const qualifiers = person.predictions?.qualifiers || {};
  const rows = Object.entries(labels).flatMap(([key, label]) =>
    (qualifiers[key] || []).filter((item) => item.value || item.team).map((item) => ({ key, label, team: item.value || item.team }))
  );
  return predictionSection('Clasificados', `
    <div class="excel-wrap">
      <table class="excel-table">
        <thead><tr><th>Ronda</th><th>Equipo</th><th>Estado</th></tr></thead>
        <tbody>
          ${rows.map((r) => {
            const status = qualifierPredictionStatus(r.key, r.team);
            return `<tr class="${status.className}"><td>${esc(r.label)}</td><td><strong>${esc(r.team)}</strong></td><td><span class="status-pill">${esc(status.label)}</span></td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `);
}

function predictionHonorTable(person) {
  const podium = person.predictions?.podium || {};
  const awards = person.predictions?.awards || {};
  const rows = [
    ['Campeón', podium.champion?.value],
    ['Subcampeón', podium.runnerUp?.value],
    ['3º puesto', podium.thirdPlace?.value],
    ['Bota de Oro', awards.goldenBoot?.gold?.value],
    ['Bota de Plata', awards.goldenBoot?.silver?.value],
    ['Bota de Bronce', awards.goldenBoot?.bronze?.value],
    ['Balón de Oro', awards.goldenBall?.gold?.value],
    ['Balón de Plata', awards.goldenBall?.silver?.value],
    ['Balón de Bronce', awards.goldenBall?.bronze?.value]
  ];
  return predictionSection('Honor y premios', `
    <div class="excel-wrap">
      <table class="excel-table">
        <thead><tr><th>Concepto</th><th>Predicción</th></tr></thead>
        <tbody>
          ${rows.map(([label, value]) => `<tr><td>${esc(label)}</td><td><strong>${esc(value || '')}</strong></td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `);
}

function predictionSection(title, html) {
  return `<article class="prediction-card"><h3>${esc(title)}</h3>${html}</article>`;
}

function formatPredictionScore(match) {
  if (!match?.valid) return match?.raw || '';
  const teams = match.prefix ? `${match.prefix} · ` : '';
  return `${teams}${match.sign || ''}|${match.homeGoals}-${match.awayGoals}`;
}

function matchPredictionStatus(prediction) {
  const actual = (state.dashboard?.actual?.matches || []).find((m) => Number(m.matchNumber) === Number(prediction.matchNumber));
  if (!prediction?.valid || !actual?.finished) {
    return { className: 'status-pending', label: 'Pendiente', actualText: actual ? `${actual.homeScore ?? '-'}-${actual.awayScore ?? '-'}` : '' };
  }
  const exact = Number(prediction.homeGoals) === Number(actual.homeScore) && Number(prediction.awayGoals) === Number(actual.awayScore);
  const sign = scoreSign(prediction.homeGoals, prediction.awayGoals) === scoreSign(actual.homeScore, actual.awayScore);
  return {
    className: exact || sign ? 'status-hit' : 'status-miss',
    label: exact ? 'Exacto' : (sign ? 'Signo' : 'Fallado'),
    actualText: `${actual.homeScore}-${actual.awayScore}`
  };
}

function groupPredictionStatus(prediction) {
  const completed = state.dashboard?.actual?.completedByGroup?.[prediction.group] || 0;
  if (completed < 6) return { className: 'status-pending', label: 'Pendiente' };
  const actualTeam = state.dashboard?.actual?.groups?.[prediction.group]?.[prediction.position - 1]?.team || '';
  return sameTextTeam(prediction.team || prediction.value, actualTeam)
    ? { className: 'status-hit', label: 'Acertado' }
    : { className: 'status-miss', label: 'Fallado' };
}

function qualifierPredictionStatus(key, team) {
  const actual = state.dashboard?.actual?.qualified?.[key] || [];
  if (!actual.length) return { className: 'status-pending', label: 'Pendiente' };
  return actual.some((candidate) => sameTextTeam(candidate, team))
    ? { className: 'status-hit', label: 'Acertado' }
    : { className: 'status-miss', label: 'Fallado' };
}

function scoreSign(home, away) {
  const h = Number(home);
  const a = Number(away);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return '';
  if (h > a) return '1';
  if (h < a) return '2';
  return 'X';
}

function sameTextTeam(a, b) {
  return normalizeText(a) && normalizeText(a) === normalizeText(b);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function groupLetters(groups, matches) {
  const set = new Set(Object.keys(groups || {}));
  for (const match of matches || []) {
    if (match.stage === 'group' && match.group) set.add(match.group);
  }
  return [...set].sort();
}

function groupRows(group, groups, matches) {
  const table = groups?.[group] || [];
  if (table.length) return table;

  const teams = [];
  const seen = new Set();
  for (const match of matches || []) {
    if (match.stage !== 'group' || match.group !== group) continue;
    for (const team of [match.homeTeam, match.awayTeam]) {
      if (!team || seen.has(team)) continue;
      seen.add(team);
      teams.push({ team, position: teams.length + 1, points: 0, goalDifference: 0 });
    }
  }
  return teams;
}

function render() {
  renderStatus();
  renderAlerts();
  renderFunFacts();
  renderLeaderboard();
  renderParticipantDetails();
  renderMatches();
  renderQualified();
  renderGroups();
}

$('#refreshBtn').addEventListener('click', forceRefresh);
$('#searchInput').addEventListener('input', (ev) => {
  filter = ev.target.value;
  renderLeaderboard();
});

$('#groupSelect').addEventListener('change', (ev) => {
  selectedGroup = ev.target.value;
  renderGroups();
});

$('#closePredictionsBtn').addEventListener('click', closePredictions);
$('#predictionsModal').addEventListener('click', (ev) => {
  if (ev.target.id === 'predictionsModal') closePredictions();
});

loadDashboard();
setInterval(loadDashboard, 5 * 60 * 1000);
