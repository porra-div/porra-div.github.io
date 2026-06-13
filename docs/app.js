let state = null;
let selectedParticipantId = null;
let selectedPredictionParticipantId = null;
let selectedGroup = '';
let filter = '';
const game = {
  open: false,
  dragging: false,
  flying: false,
  goals: 0,
  shots: 0,
  streak: 0,
  message: 'A puerta',
  keeperT: 0,
  spin: 0,
  blockerT: 0,
  ball: { x: 480, y: 540, r: 16, vx: 0, vy: 0 },
  aim: { x: 480, y: 120 },
  raf: null
};

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const STATIC_DATA_URL = 'static-data.json';
const WORLD_CUP_API_BASE = 'https://worldcup26.ir';
let staticData = null;
let staticMode = false;
const TEAM_ES = {
  Mexico: 'México',
  'South Africa': 'Sudáfrica',
  'South Korea': 'Corea del Sur',
  'Czech Republic': 'República Checa',
  Canada: 'Canadá',
  'Bosnia and Herzegovina': 'Bosnia y Herzegovina',
  Qatar: 'Catar',
  Switzerland: 'Suiza',
  Brazil: 'Brasil',
  Morocco: 'Marruecos',
  Haiti: 'Haití',
  Scotland: 'Escocia',
  USA: 'Estados Unidos',
  Paraguay: 'Paraguay',
  Australia: 'Australia',
  Turkey: 'Turquía',
  Germany: 'Alemania',
  Curacao: 'Curazao',
  'Ivory Coast': 'Costa de Marfil',
  Ecuador: 'Ecuador',
  Netherlands: 'Países Bajos',
  Japan: 'Japón',
  Sweden: 'Suecia',
  Tunisia: 'Túnez',
  Belgium: 'Bélgica',
  Egypt: 'Egipto',
  Iran: 'Irán',
  'New Zealand': 'Nueva Zelanda',
  Spain: 'España',
  'Cape Verde': 'Cabo Verde',
  'Saudi Arabia': 'Arabia Saudita',
  Uruguay: 'Uruguay',
  France: 'Francia',
  Senegal: 'Senegal',
  Iraq: 'Irak',
  Norway: 'Noruega',
  Argentina: 'Argentina',
  Algeria: 'Argelia',
  Austria: 'Austria',
  Jordan: 'Jordania',
  Portugal: 'Portugal',
  'DR Congo': 'RD Congo',
  Uzbekistan: 'Uzbekistán',
  Colombia: 'Colombia',
  England: 'Inglaterra',
  Croatia: 'Croacia',
  Ghana: 'Ghana',
  Panama: 'Panamá'
};

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  const apiDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (apiDate) {
    const [, month, day, year, hour = '0', minute = '0'] = apiDate;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const fmtDate = (value) => {
  const parsed = parseDateValue(value);
  return parsed ? parsed.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' }) : '—';
};

function displayTeam(value) {
  const raw = String(value || '');
  const medal = raw.match(/^[🥇🥈🥉]\s*/u)?.[0] || '';
  const clean = raw.replace(/^[🥇🥈🥉]\s*/u, '');
  return `${medal}${TEAM_ES[clean] || clean}`;
}

function displayTeamsText(value) {
  let text = String(value || '');
  for (const [english, spanish] of Object.entries(TEAM_ES).sort((a, b) => b[0].length - a[0].length)) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(english)}\\b`, 'g'), spanish);
  }
  return text;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
      <div class="kpi-value">${esc(displayTeamsText(f.value))}</div>
      <div class="kpi-meta">${esc(displayTeamsText(f.meta || ''))}</div>
    </article>
  `).join('');
}

function renderInsights() {
  renderHistoryChart();
}

function renderHistoryChart() {
  const rows = state.dashboard?.leaderboard || [];
  const finished = (state.dashboard?.actual?.matches || []).filter((m) => m.finished).map((m) => Number(m.matchNumber)).sort((a, b) => a - b);
  const matchNumbers = [...new Set(finished)];
  if (!rows.length || !matchNumbers.length) {
    $('#historyChart').innerHTML = `<div class="empty">La gráfica aparecerá cuando haya partidos finalizados.</div>`;
    return;
  }

  const width = Math.max(900, 140 + matchNumbers.length * 34);
  const height = 320;
  const pad = { top: 22, right: 32, bottom: 44, left: 42 };
  const maxScore = Math.max(1, ...rows.map((row) => row.total || 0));
  const colors = ['#ffcc29', '#fff7e8', '#2ea043', '#58a6ff', '#ff7a7a', '#c084fc'];
  const xFor = (matchNumber) => {
    const index = Math.max(0, matchNumbers.indexOf(Number(matchNumber)));
    const denom = Math.max(1, matchNumbers.length - 1);
    return pad.left + (index / denom) * (width - pad.left - pad.right);
  };
  const yFor = (points) => height - pad.bottom - (points / maxScore) * (height - pad.top - pad.bottom);

  const series = rows.map((row, index) => {
    let acc = 0;
    const byMatch = new Map((row.timeline || []).map((event) => [Number(event.matchNumber), event.points || 0]));
    const points = matchNumbers.map((matchNumber) => {
      acc += byMatch.get(matchNumber) || 0;
      return `${xFor(matchNumber).toFixed(1)},${yFor(acc).toFixed(1)}`;
    });
    return { row, color: colors[index % colors.length], points: points.join(' ') };
  });

  $('#historyChart').innerHTML = `
    <svg class="history-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolución de puntos">
      <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="chart-axis"></line>
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="chart-axis"></line>
      ${[0, .5, 1].map((step) => {
        const y = yFor(maxScore * step);
        return `<g><line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" class="chart-grid"></line><text x="8" y="${y + 4}" class="chart-label">${Math.round(maxScore * step)}</text></g>`;
      }).join('')}
      ${series.map((item) => `<polyline points="${item.points}" fill="none" stroke="${item.color}" class="chart-line"></polyline>`).join('')}
      ${series.map((item) => {
        const last = item.points.split(' ').at(-1).split(',');
        return `<circle cx="${last[0]}" cy="${last[1]}" r="4.5" fill="${item.color}"></circle>`;
      }).join('')}
    </svg>
    <div class="chart-legend" style="grid-template-columns: repeat(${Math.min(series.length, 5)}, minmax(160px, 1fr));">
      ${series.map((item) => `<span><i style="background:${item.color}"></i>${esc(item.row.name)}</span>`).join('')}
    </div>
  `;
}

function renderLeaderboard() {
  const rows = (state.dashboard?.leaderboard || [])
    .filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));
  if (!selectedParticipantId && rows[0]) selectedParticipantId = rows[0].id;
  const html = rows.map((p) => `
    <tr data-id="${esc(p.id)}" class="${p.id === selectedParticipantId ? 'active' : ''}">
      <td><span class="rank ${p.rank <= 3 ? 'top' : ''}">${rankMedal(p.rank) || p.rank}</span></td>
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

function rankMedal(rank) {
  return { 1: '🥇', 2: '🥈', 3: '🥉' }[rank] || '';
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
      <strong>${esc(displayTeamsText(e.label || e.type))} <span class="points-pill">+${e.points}</span></strong>
      <div class="detail-meta">Predicción: ${esc(displayTeamsText(e.prediction || ''))}${e.actual ? ` · Real: ${esc(displayTeamsText(e.actual))}` : ''}</div>
      ${e.details ? `<div class="detail-meta">${esc(displayTeamsText(e.details))}</div>` : ''}
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
    .sort(compareMatchesByKickoff)
    .slice(0, 16);
  $('#matchesList').innerHTML = visible.length ? visible.map((m) => `
    <div class="match ${m.finished ? 'finished' : ''}">
      <div>
        <div class="match-title">${esc(displayTeam(m.homeTeam) || 'Por definir')} - ${esc(displayTeam(m.awayTeam) || 'Por definir')}</div>
        <div class="match-meta">#${esc(m.matchNumber)} · ${esc(stageName(m.stage))}${m.group ? ` · Grupo ${esc(m.group)}` : ''}${m.venue ? ` · ${esc(m.venue)}` : ''}</div>
        <div class="match-meta">${esc(matchDateLabel(m))}${m.finished ? ' · Finalizado' : ''}</div>
      </div>
      <div class="score">${m.homeScore ?? '–'}-${m.awayScore ?? '–'}</div>
    </div>
  `).join('') : `<div class="empty">La API aún no ha devuelto partidos normalizables.</div>`;
}

function matchDateLabel(match) {
  if (match?.kickoff) return fmtDate(match.kickoff);
  return match?.status || 'Fecha por confirmar';
}

function compareMatchesByKickoff(a, b) {
  const da = parseDateValue(a?.kickoff)?.getTime();
  const db = parseDateValue(b?.kickoff)?.getTime();
  if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
  if (Number.isFinite(da) && !Number.isFinite(db)) return -1;
  if (!Number.isFinite(da) && Number.isFinite(db)) return 1;
  return (a?.matchNumber || 0) - (b?.matchNumber || 0);
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
  return teams?.length ? `<div class="team-tags">${teams.map((t) => `<span class="team-tag">${esc(displayTeam(t))}</span>`).join('')}</div>` : `<div class="muted">Pendiente</div>`;
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
    .sort(compareMatchesByKickoff);

  $('#groupsGrid').innerHTML = `
    <article class="group-card featured">
      <h3>Grupo ${esc(selectedGroup)}</h3>
      <div class="group-row muted"><span>#</span><span>Equipo</span><span>Pts</span><span>DG</span></div>
      ${rows.map((t, i) => `
        <div class="group-row">
          <span>${t.position || i + 1}</span><span>${esc(displayTeam(t.team))}</span><span>${t.points ?? 0}</span><span>${t.goalDifference ?? 0}</span>
        </div>
      `).join('')}
    </article>
    <article class="group-card featured">
      <h3>Partidos del grupo</h3>
      <div class="mini-matches">
        ${groupMatches.map((m) => `
          <div class="mini-match ${m.finished ? 'finished' : ''}">
            <span>${esc(displayTeam(m.homeTeam) || 'Por definir')} - ${esc(displayTeam(m.awayTeam) || 'Por definir')}</span>
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
  $('#predictionsSubtitle').textContent = 'Verde acertado · Borde dorado resultado exacto · Rojo fallado · Amarillo pendiente';

  content.innerHTML = `
    <div class="prediction-player-list">
      ${participants.map((p) => `<button class="small-button ${p.id === person.id ? 'active' : ''}" data-prediction-player="${esc(p.id)}" type="button">${esc(p.name)}</button>`).join('')}
    </div>
    <div class="prediction-grid predictions-only">
      ${predictionMatchesBoard(person)}
      ${predictionBracket(person)}
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

function predictionMatchesBoard(person) {
  const rows = Object.values(person.predictions?.matches || {})
    .filter((m) => m.valid)
    .sort(comparePredictionsByKickoff);
  const stages = [
    ['group', 'Fase de grupos'],
    ['round32', 'Dieciseisavos'],
    ['round16', 'Octavos'],
    ['quarter', 'Cuartos'],
    ['semi', 'Semifinales'],
    ['third', '3º y 4º puesto'],
    ['final', 'Final']
  ];
  return predictionSection('Predicciones', `
    <div class="prediction-stage-list">
      ${stages.map(([stage, label]) => {
        const stageRows = rows.filter((m) => m.stage === stage);
        if (!stageRows.length) return '';
        return `
          <section class="prediction-stage">
            <h4>${esc(label)}</h4>
            <div class="prediction-card-grid">
              ${stageRows.map((m) => predictionMatchCard(m)).join('')}
            </div>
          </section>
        `;
      }).join('')}
    </div>
  `);
}

function predictionMatchCard(match) {
  const status = matchPredictionStatus(match);
  return `
    <article class="prediction-match-card ${status.className}">
      <div class="prediction-match-top">
        <span>#${status.matchNumber || match.matchNumber}</span>
        <span class="status-pill">${esc(status.label)}</span>
      </div>
      <div class="prediction-match-title">${esc(displayTeamsText(match.label || `${match.homeLabel || ''}-${match.awayLabel || ''}`))}</div>
      <div class="prediction-match-date">${esc(predictionDateText(match))}</div>
      <div class="prediction-score-row">
        <div>
          <span>Predicción</span>
          <strong>${esc(formatPredictionScoreOnly(match))}</strong>
        </div>
        <div>
          <span>Real</span>
          <strong>${esc(status.actualText || 'Pendiente')}</strong>
        </div>
      </div>
    </article>
  `;
}

function predictionBracket(person) {
  const matches = Object.values(person.predictions?.matches || {})
    .filter((m) => Number(m.matchNumber) >= 73)
    .sort(comparePredictionsByKickoff);
  const rounds = [
    ['round32', 'Dieciseisavos'],
    ['round16', 'Octavos'],
    ['quarter', 'Cuartos'],
    ['semi', 'Semifinales'],
    ['final', 'Final']
  ];
  return predictionSection('Cruces', `
    <div class="bracket">
      ${rounds.map(([stage, label]) => `
        <div class="bracket-round">
          <h4>${esc(label)}</h4>
          ${(matches.filter((m) => m.stage === stage)).map((m) => {
            const status = matchPredictionStatus(m);
            return `
              <div class="bracket-match ${status.className}">
                <div class="bracket-teams">${esc(bracketLabel(m))}</div>
                <div class="bracket-date">${esc(predictionDateText(m))}</div>
                <div class="bracket-score">${esc(formatPredictionScoreOnly(m))}</div>
                <div class="bracket-state">${esc(status.label)}</div>
              </div>
            `;
          }).join('') || `<div class="muted">Pendiente</div>`}
        </div>
      `).join('')}
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

function formatPredictionScoreOnly(match) {
  if (!match?.valid) return match?.raw || '';
  return `${match.sign || ''}|${match.homeGoals}-${match.awayGoals}`;
}

function bracketLabel(match) {
  if (match.prefix) return displayTeamsText(match.prefix);
  if (match.label) return displayTeamsText(match.label);
  return `${displayTeam(match.homeLabel) || 'Por definir'}-${displayTeam(match.awayLabel) || 'Por definir'}`;
}

function actualMatchForPrediction(prediction) {
  const matches = state.dashboard?.actual?.matches || [];
  const byNumber = matches.find((m) => Number(m.matchNumber) === Number(prediction.matchNumber));
  if (byNumber && matchTeamsPrediction(prediction, byNumber)) return byNumber;
  const teams = predictedTeams(prediction);
  if (!teams.home || !teams.away) return byNumber;
  return matches.find((m) =>
    m.stage === prediction.stage &&
    sameTeamName(teams.home, m.homeTeam) &&
    sameTeamName(teams.away, m.awayTeam)
  ) || byNumber;
}

function comparePredictionsByKickoff(a, b) {
  const actualA = actualMatchForPrediction(a);
  const actualB = actualMatchForPrediction(b);
  const da = parseDateValue(actualA?.kickoff)?.getTime();
  const db = parseDateValue(actualB?.kickoff)?.getTime();
  if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
  if (Number.isFinite(da) && !Number.isFinite(db)) return -1;
  if (!Number.isFinite(da) && Number.isFinite(db)) return 1;
  return (actualA?.matchNumber || a?.matchNumber || 0) - (actualB?.matchNumber || b?.matchNumber || 0);
}

function predictedTeams(prediction) {
  if (!prediction) return { home: '', away: '' };
  if (prediction.prefix) {
    const parts = prediction.prefix.split('-');
    return { home: parts[0] || '', away: parts.slice(1).join('-') || '' };
  }
  return { home: prediction.homeLabel || '', away: prediction.awayLabel || '' };
}

function matchTeamsPrediction(prediction, actual) {
  const teams = predictedTeams(prediction);
  return sameTeamName(teams.home, actual?.homeTeam) && sameTeamName(teams.away, actual?.awayTeam);
}

function sameTeamName(a, b) {
  const left = normalizeText(TEAM_ES[a] || a);
  const right = normalizeText(TEAM_ES[b] || b);
  return Boolean(left && right && left === right);
}

function predictionDateText(prediction) {
  const actual = actualMatchForPrediction(prediction);
  return actual?.kickoff ? fmtDate(actual.kickoff) : 'Fecha por confirmar';
}

function matchPredictionStatus(prediction) {
  const actual = actualMatchForPrediction(prediction);
  if (!prediction?.valid || !actual?.finished) {
    return { className: 'status-pending', label: 'Pendiente', actualText: actual ? `${actual.homeScore ?? '-'}-${actual.awayScore ?? '-'}` : '', matchNumber: actual?.matchNumber };
  }
  const exact = Number(prediction.homeGoals) === Number(actual.homeScore) && Number(prediction.awayGoals) === Number(actual.awayScore);
  const sign = scoreSign(prediction.homeGoals, prediction.awayGoals) === scoreSign(actual.homeScore, actual.awayScore);
  return {
    className: exact ? 'status-exact' : (sign ? 'status-hit' : 'status-miss'),
    label: exact ? 'Resultado exacto' : (sign ? 'Ganador/empate' : 'Fallado'),
    actualText: `${actual.homeScore}-${actual.awayScore}`,
    matchNumber: actual.matchNumber
  };
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
  renderInsights();
  renderLeaderboard();
  renderParticipantDetails();
  renderMatches();
  renderQualified();
  renderGroups();
}

function openGame() {
  game.open = true;
  resetPenaltyBall();
  updateGameHud();
  $('#gameModal').classList.add('open');
  $('#gameModal').setAttribute('aria-hidden', 'false');
  resizePenaltyCanvas();
  startGameLoop();
}

function closeGame() {
  game.open = false;
  $('#gameModal').classList.remove('open');
  $('#gameModal').setAttribute('aria-hidden', 'true');
  if (game.raf) cancelAnimationFrame(game.raf);
  game.raf = null;
}

function openLobato() {
  $('#lobatoModal').classList.add('open');
  $('#lobatoModal').setAttribute('aria-hidden', 'false');
}

function closeLobato() {
  $('#lobatoModal').classList.remove('open');
  $('#lobatoModal').setAttribute('aria-hidden', 'true');
}

function resetPenaltyBall() {
  const { width, height } = penaltyCanvasSize();
  game.flying = false;
  game.dragging = false;
  game.spin = 0;
  game.ball = { x: width / 2, y: height - 72, r: Math.max(11, width * 0.015), vx: 0, vy: 0 };
  game.aim = { x: width / 2, y: Math.max(82, height * 0.2) };
}

function penaltyCanvasSize() {
  const canvas = $('#penaltyGame');
  return { width: canvas?.width || 960, height: canvas?.height || 620 };
}

function resizePenaltyCanvas() {
  const canvas = $('#penaltyGame');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = Math.max(360, Math.round(rect.width * dpr));
  const height = Math.round(width * 0.64);
  const old = penaltyCanvasSize();
  if (canvas.width !== width || canvas.height !== height) {
    const xRatio = width / old.width;
    const yRatio = height / old.height;
    canvas.width = width;
    canvas.height = height;
    game.ball.x *= xRatio;
    game.ball.y *= yRatio;
    game.ball.r = Math.max(12, width * 0.017);
    game.aim.x *= xRatio;
    game.aim.y *= yRatio;
  }
}

function startGameLoop() {
  if (game.raf) cancelAnimationFrame(game.raf);
  const tick = () => {
    if (!game.open) return;
    updatePenaltyGame();
    drawPenaltyGame();
    game.raf = requestAnimationFrame(tick);
  };
  tick();
}

function updatePenaltyGame() {
  const { width, height } = penaltyCanvasSize();
  const goal = goalRect(width, height);
  const keeper = keeperRect(width, height);
  game.keeperT += 0.078 + Math.min(game.streak, 5) * 0.006;
  game.blockerT += 0.064;

  if (!game.flying) return;

  game.ball.vx += game.spin;
  game.ball.x += game.ball.vx;
  game.ball.y += game.ball.vy;
  game.ball.vx *= 0.988;
  game.ball.vy *= 0.989;

  for (const blocker of blockerRects(width, height)) {
    if (circleRect(game.ball, blocker)) {
      finishPenalty('Tapado', false);
      return;
    }
  }

  if (circleRect(game.ball, keeper)) {
    finishPenalty('Parada', false);
    return;
  }

  if (game.ball.y - game.ball.r <= goal.y + goal.h) {
    if (game.ball.x > goal.x && game.ball.x < goal.x + goal.w && game.ball.y > goal.y - 18) {
      finishPenalty('Golazo', true);
    } else {
      finishPenalty('Fuera', false);
    }
  }
}

function finishPenalty(message, goal) {
  game.flying = false;
  game.shots += 1;
  if (goal) {
    game.goals += 1;
    game.streak += 1;
  } else {
    game.streak = 0;
  }
  game.message = message;
  updateGameHud();
  setTimeout(() => {
    if (!game.open) return;
    game.message = 'A puerta';
    resetPenaltyBall();
    updateGameHud();
  }, 900);
}

function updateGameHud() {
  $('#gameSubtitle').textContent = `Modo difícil · Goles: ${game.goals} · Tiros: ${game.shots} · Racha: ${game.streak}`;
  $('#gameResult').textContent = game.message;
  $('#gameResult').className = `game-result ${game.message === 'Golazo' ? 'goal' : game.message === 'A puerta' ? '' : 'miss'}`;
}

function drawPenaltyGame() {
  const canvas = $('#penaltyGame');
  const ctx = canvas.getContext('2d');
  const { width, height } = penaltyCanvasSize();
  const goal = goalRect(width, height);
  const keeper = keeperRect(width, height);

  ctx.clearRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#7a001c');
  sky.addColorStop(0.42, '#c8102e');
  sky.addColorStop(0.43, '#0f7f3d');
  sky.addColorStop(1, '#064f27');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  drawCrowd(ctx, width, height);
  drawPitch(ctx, width, height);
  drawGoal(ctx, goal);
  blockerRects(width, height).forEach((blocker, index) => drawBlocker(ctx, blocker, index));
  drawKeeper(ctx, keeper);
  drawAim(ctx, width, height);
  drawBall(ctx);
}

function drawCrowd(ctx, width, height) {
  ctx.fillStyle = 'rgba(255, 204, 41, .82)';
  const top = height * 0.08;
  for (let i = 0; i < 58; i += 1) {
    const x = (i / 57) * width;
    const y = top + ((i * 17) % 34);
    ctx.fillRect(x - 5, y, 10, 16);
  }
  ctx.fillStyle = 'rgba(255, 248, 219, .82)';
  ctx.fillRect(width * 0.12, height * 0.03, width * 0.76, height * 0.022);
}

function drawPitch(ctx, width, height) {
  ctx.strokeStyle = 'rgba(255,255,255,.62)';
  ctx.lineWidth = Math.max(2, width * 0.004);
  ctx.beginPath();
  ctx.moveTo(width * 0.14, height * 0.48);
  ctx.lineTo(width * 0.86, height * 0.48);
  ctx.lineTo(width * 0.98, height);
  ctx.lineTo(width * 0.02, height);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(width / 2, height * 0.78, width * 0.14, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.74)';
  ctx.beginPath();
  ctx.arc(width / 2, height - 72, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawGoal(ctx, goal) {
  ctx.lineWidth = Math.max(5, goal.w * 0.018);
  ctx.strokeStyle = '#fff7e8';
  ctx.strokeRect(goal.x, goal.y, goal.w, goal.h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,.28)';
  for (let x = goal.x + goal.w / 8; x < goal.x + goal.w; x += goal.w / 8) {
    ctx.beginPath();
    ctx.moveTo(x, goal.y);
    ctx.lineTo(x, goal.y + goal.h);
    ctx.stroke();
  }
  for (let y = goal.y + goal.h / 4; y < goal.y + goal.h; y += goal.h / 4) {
    ctx.beginPath();
    ctx.moveTo(goal.x, y);
    ctx.lineTo(goal.x + goal.w, y);
    ctx.stroke();
  }
}

function drawKeeper(ctx, keeper) {
  ctx.fillStyle = '#174ea6';
  ctx.fillRect(keeper.x, keeper.y, keeper.w, keeper.h);
  ctx.fillStyle = '#fff7e8';
  ctx.beginPath();
  ctx.arc(keeper.x + keeper.w / 2, keeper.y - keeper.h * 0.18, keeper.w * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#174ea6';
  ctx.lineWidth = Math.max(5, keeper.w * 0.08);
  ctx.beginPath();
  ctx.moveTo(keeper.x - keeper.w * 0.22, keeper.y + keeper.h * 0.18);
  ctx.lineTo(keeper.x + keeper.w * 1.22, keeper.y + keeper.h * 0.18);
  ctx.stroke();
}

function drawBlocker(ctx, blocker, index) {
  ctx.fillStyle = index % 2 ? '#fff7e8' : '#c8102e';
  ctx.fillRect(blocker.x, blocker.y, blocker.w, blocker.h);
  ctx.fillStyle = '#320008';
  ctx.beginPath();
  ctx.arc(blocker.x + blocker.w / 2, blocker.y - blocker.w * 0.16, blocker.w * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(50,0,8,.85)';
  ctx.lineWidth = Math.max(4, blocker.w * 0.08);
  ctx.beginPath();
  ctx.moveTo(blocker.x - blocker.w * 0.18, blocker.y + blocker.h * 0.25);
  ctx.lineTo(blocker.x + blocker.w * 1.18, blocker.y + blocker.h * 0.25);
  ctx.stroke();
}

function drawAim(ctx, width, height) {
  if (game.flying) return;
  ctx.strokeStyle = 'rgba(255, 204, 41, .82)';
  ctx.lineWidth = Math.max(2, width * 0.003);
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(game.ball.x, game.ball.y);
  ctx.lineTo(game.aim.x, game.aim.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(game.aim.x, game.aim.y, Math.max(12, width * 0.018), 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 204, 41, .20)';
  ctx.fill();
}

function drawBall(ctx) {
  const { x, y, r } = game.ball;
  ctx.fillStyle = '#fff7e8';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#320008';
  ctx.lineWidth = Math.max(2, r * 0.14);
  ctx.stroke();
  ctx.fillStyle = '#320008';
  for (let i = 0; i < 5; i += 1) {
    const angle = i * Math.PI * 0.4;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * r * 0.44, y + Math.sin(angle) * r * 0.44, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function goalRect(width, height) {
  return { x: width * 0.2, y: height * 0.1, w: width * 0.6, h: height * 0.22 };
}

function keeperRect(width, height) {
  const goal = goalRect(width, height);
  const w = width * 0.105;
  const h = height * 0.12;
  const travel = goal.w - w - width * 0.08;
  const movingX = goal.x + width * 0.04 + ((Math.sin(game.keeperT) + 1) / 2) * travel;
  const chaseX = game.flying ? game.ball.x - w / 2 : movingX;
  const x = movingX * 0.78 + Math.max(goal.x, Math.min(goal.x + goal.w - w, chaseX)) * 0.22;
  return { x, y: goal.y + goal.h * 0.48, w, h };
}

function blockerRects(width, height) {
  const baseY = height * 0.48;
  const w = width * 0.045;
  const h = height * 0.095;
  return [0, 1].map((index) => {
    const span = width * (0.18 + index * 0.03);
    const center = width * (0.34 + index * 0.16);
    const phase = game.blockerT * (1.28 + index * 0.22) + index * 1.7;
    return {
      x: center + Math.sin(phase) * span - w / 2,
      y: baseY - index * height * 0.065 + Math.cos(phase * 1.4) * height * 0.018,
      w,
      h
    };
  });
}

function circleRect(circle, rect) {
  const x = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
  const y = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
  return Math.hypot(circle.x - x, circle.y - y) <= circle.r;
}

function pointerToCanvas(ev) {
  const canvas = $('#penaltyGame');
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (ev.clientX - rect.left) * scaleX,
    y: (ev.clientY - rect.top) * scaleY
  };
}

function clampAim(point) {
  const { width, height } = penaltyCanvasSize();
  return {
    x: Math.max(width * 0.08, Math.min(width * 0.92, point.x)),
    y: Math.max(height * 0.06, Math.min(height * 0.55, point.y))
  };
}

function setPenaltyAim(ev) {
  game.aim = clampAim(pointerToCanvas(ev));
}

function shootPenalty() {
  if (game.flying) return;
  const dx = game.aim.x - game.ball.x;
  const dy = game.aim.y - game.ball.y;
  const distance = Math.hypot(dx, dy) || 1;
  const powerPenalty = Math.min(1, Math.max(0, (distance - 180) / 420));
  game.spin = ((Math.random() - 0.5) * 0.022) + ((game.aim.x - game.ball.x) / penaltyCanvasSize().width) * 0.01;
  game.ball.vx = dx / (45 - powerPenalty * 6);
  game.ball.vy = dy / (45 - powerPenalty * 6);
  game.flying = true;
  game.dragging = false;
  game.message = 'A puerta';
  updateGameHud();
}

$('#refreshBtn').addEventListener('click', forceRefresh);
$('#openLobatoBtn').addEventListener('click', openLobato);
$('#closeLobatoBtn').addEventListener('click', closeLobato);
$('#lobatoModal').addEventListener('click', (ev) => {
  if (ev.target.id === 'lobatoModal') closeLobato();
});
$('#openGameBtn').addEventListener('click', openGame);
$('#closeGameBtn').addEventListener('click', closeGame);
$('#gameModal').addEventListener('click', (ev) => {
  if (ev.target.id === 'gameModal') closeGame();
});
$('#penaltyGame').addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  if (game.flying) return;
  game.dragging = true;
  $('#penaltyGame').setPointerCapture(ev.pointerId);
  setPenaltyAim(ev);
});
$('#penaltyGame').addEventListener('pointermove', (ev) => {
  if (!game.dragging || game.flying) return;
  ev.preventDefault();
  setPenaltyAim(ev);
});
$('#penaltyGame').addEventListener('pointerup', (ev) => {
  if (!game.dragging || game.flying) return;
  ev.preventDefault();
  setPenaltyAim(ev);
  shootPenalty();
});
$('#penaltyGame').addEventListener('pointercancel', () => {
  game.dragging = false;
});
window.addEventListener('resize', () => {
  if (!game.open) return;
  resizePenaltyCanvas();
  drawPenaltyGame();
});
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
