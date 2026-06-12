let state = null;
let selectedParticipantId = null;
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
  const refreshMin = Math.round((state.config?.refreshMs || 300000) / 60000);
  badge.textContent = state.loading ? 'Cargando…' : `Última actualización: ${fmtDate(state.updatedAt)} · cada ${refreshMin} min`;
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
      <td><strong>${esc(p.name)}</strong><div class="muted">${esc(p.file)}</div></td>
      <td><span class="total">${p.total}</span></td>
      <td>${p.exactScores}</td>
      <td><span class="stage-chip">${p.breakdown.group || 0}</span></td>
      <td><span class="stage-chip">${p.breakdown.round32 || 0}</span></td>
      <td><span class="stage-chip">${p.breakdown.round16 || 0}</span></td>
      <td><span class="stage-chip">${p.breakdown.quarter || 0}</span></td>
      <td><span class="stage-chip">${p.breakdown.semi || 0}</span></td>
      <td><span class="stage-chip">${p.breakdown.honor || 0}</span></td>
      <td><span class="stage-chip">${p.breakdown.awards || 0}</span></td>
    </tr>
  `).join('');
  $('#leaderboardTable tbody').innerHTML = html || `<tr><td colspan="11" class="empty">No hay participantes que coincidan con la búsqueda.</td></tr>`;
  document.querySelectorAll('#leaderboardTable tbody tr[data-id]').forEach((row) => {
    row.addEventListener('click', () => {
      selectedParticipantId = row.dataset.id;
      renderLeaderboard();
      renderParticipantDetails();
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
  $('#detailSubtitle').textContent = `${person.name}: ${person.total} puntos, ${person.exactScores} marcadores exactos.`;
  const events = person.events || [];
  $('#participantDetails').innerHTML = events.length ? events.map((e) => `
    <div class="detail-event">
      <strong>${esc(e.label || e.type)} <span class="points-pill">+${e.points}</span></strong>
      <div class="detail-meta">Predicción: ${esc(e.prediction || '')}${e.actual ? ` · Real: ${esc(e.actual)}` : ''}</div>
      ${e.details ? `<div class="detail-meta">${esc(e.details)}</div>` : ''}
    </div>
  `).join('') : `<div class="empty">Todavía no tiene aciertos computados.</div>`;
}

function renderMatches() {
  const matches = state.dashboard?.actual?.matches || [];
  const visible = matches
    .filter((m) => m.homeTeam || m.awayTeam)
    .sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? 1 : -1;
      return (a.matchNumber || 0) - (b.matchNumber || 0);
    })
    .slice(0, 12);
  $('#matchesList').innerHTML = visible.length ? visible.map((m) => `
    <div class="match">
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
  const letters = Object.keys(groups).sort();
  $('#groupsGrid').innerHTML = letters.length ? letters.map((letter) => `
    <article class="group-card">
      <h3>Grupo ${esc(letter)}</h3>
      <div class="group-row muted"><span>#</span><span>Equipo</span><span>Pts</span><span>DG</span></div>
      ${(groups[letter] || []).map((t, i) => `
        <div class="group-row">
          <span>${i + 1}</span><span>${esc(t.team)}</span><span>${t.points ?? 0}</span><span>${t.goalDifference ?? 0}</span>
        </div>
      `).join('')}
    </article>
  `).join('') : `<div class="empty">Sin grupos todavía. Se llenarán cuando la API devuelva clasificación o se puedan calcular por resultados.</div>`;
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

loadDashboard();
setInterval(loadDashboard, 5 * 60 * 1000);
