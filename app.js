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
  const chart = $('#historyChart');
  const rows = state.dashboard?.leaderboard || [];
  const finishedMatches = (state.dashboard?.actual?.matches || [])
    .filter((match) => match.finished)
    .sort(compareMatchesByKickoff);
  const matchNumbers = [...new Set(finishedMatches.map((match) => Number(match.matchNumber)))];
  const matchByNumber = new Map(finishedMatches.map((match) => [Number(match.matchNumber), match]));
  if (!rows.length || !matchNumbers.length) {
    chart.innerHTML = `<div class="empty">La gráfica aparecerá cuando haya partidos finalizados.</div>`;
    return;
  }

  const width = Math.max(620, Math.round(chart.getBoundingClientRect().width || 900));
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
  const tickEvery = Math.max(1, Math.ceil(matchNumbers.length / 6));

  const series = rows.map((row, index) => {
    let acc = 0;
    const byMatch = new Map();
    for (const event of row.timeline || []) {
      const matchNumber = Number(event.matchNumber);
      byMatch.set(matchNumber, (byMatch.get(matchNumber) || 0) + (event.points || 0));
    }
    const points = matchNumbers.map((matchNumber, pointIndex) => {
      acc += byMatch.get(matchNumber) || 0;
      if (pointIndex === matchNumbers.length - 1) acc = row.total || acc;
      return `${xFor(matchNumber).toFixed(1)},${yFor(acc).toFixed(1)}`;
    });
    return { row, color: colors[index % colors.length], points: points.join(' '), finalScore: row.total || acc };
  });

  chart.innerHTML = `
    <svg class="history-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolución de puntos por partido">
      <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="chart-axis"></line>
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="chart-axis"></line>
      ${[0, .5, 1].map((step) => {
        const y = yFor(maxScore * step);
        return `<g><line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" class="chart-grid"></line><text x="8" y="${y + 4}" class="chart-label">${Math.round(maxScore * step)}</text></g>`;
      }).join('')}
      ${matchNumbers.map((matchNumber, index) => {
        if (index % tickEvery !== 0 && index !== matchNumbers.length - 1) return '';
        return `<text x="${xFor(matchNumber)}" y="${height - 12}" text-anchor="middle" class="chart-label chart-date">${esc(shortMatchDate(matchByNumber.get(matchNumber)?.kickoff))}</text>`;
      }).join('')}
      ${series.map((item) => `<polyline points="${item.points}" fill="none" stroke="${item.color}" class="chart-line"></polyline>`).join('')}
      ${series.map((item) => {
        const last = item.points.split(' ').at(-1).split(',');
        return `<circle cx="${last[0]}" cy="${last[1]}" r="4.5" fill="${item.color}"></circle>`;
      }).join('')}
    </svg>
    <div class="chart-legend" style="grid-template-columns: repeat(${Math.min(series.length, 5)}, minmax(160px, 1fr));">
      ${series.map((item) => `<span><i style="background:${item.color}"></i>${esc(item.row.name)} <strong>${item.finalScore}</strong></span>`).join('')}
    </div>
  `;
}

function shortMatchDate(value) {
  const parsed = parseDateValue(value);
  return parsed ? parsed.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Madrid' }) : '';
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
      <td><span class="stage-chip">${leaderboardCategoryScore(p, 'groupMatches')}</span></td>
      <td><span class="stage-chip">${leaderboardCategoryScore(p, 'groupPositions')}</span></td>
      <td><span class="stage-chip">${leaderboardCategoryScore(p, 'match:round32')}</span></td>
      <td><span class="stage-chip">${leaderboardCategoryScore(p, 'match:round16')}</span></td>
      <td><span class="stage-chip">${leaderboardCategoryScore(p, 'match:quarter')}</span></td>
      <td><span class="stage-chip">${leaderboardCategoryScore(p, 'match:semi')}</span></td>
      <td><span class="stage-chip">${leaderboardCategoryScore(p, 'match:final')}</span></td>
      <td><span class="stage-chip">${leaderboardCategoryScore(p, 'honor')}</span></td>
      <td><span class="stage-chip">${leaderboardCategoryScore(p, 'awards')}</span></td>
    </tr>
  `).join('');
  $('#leaderboardTable tbody').innerHTML = html || `<tr><td colspan="13" class="empty">No hay participantes que coincidan con la búsqueda.</td></tr>`;
  document.querySelectorAll('#leaderboardTable tbody tr[data-id]').forEach((row) => {
    row.addEventListener('click', () => {
      selectedParticipantId = row.dataset.id;
      selectedPredictionParticipantId = row.dataset.id;
      renderLeaderboard();
      renderParticipantDetails();
    });
  });
  renderPhaseMaxPoints();
}

function rankMedal(rank) {
  return { 1: '🥇', 2: '🥈', 3: '🥉' }[rank] || '';
}

function leaderboardCategoryScore(player, key) {
  return (player.events || [])
    .filter((event) => detailGroupKey(event) === key)
    .reduce((sum, event) => sum + (event.points || 0), 0);
}

function renderPhaseMaxPoints() {
  const points = state.dashboard?.points;
  if (!points) {
    $('#phaseMaxPoints').innerHTML = '';
    return;
  }
  const maxExact = (stage) => Math.max(points.match?.[stage]?.exact || 0, points.match?.[stage]?.sign || 0);
  const awardMax = ['goldenBoot', 'goldenBall'].reduce((sum, key) => {
    const award = points[key] || {};
    return sum + Object.values(award).reduce((inner, value) => inner + (value || 0), 0);
  }, 0);
  const honorMax = (points.champion || 0) + (points.runnerUp || 0) + (points.thirdPlace || 0);
  const items = [
    { label: 'Partidos fase de grupos', value: 72 * maxExact('group') },
    { label: 'Posiciones fase de grupos', value: 48 * (points.groupPosition || 0) },
    { label: 'Dieciseisavos: partidos y avances', value: (16 * maxExact('round32')) + (32 * (points.qualifiedRound32 || 0)) },
    { label: 'Octavos: partidos y avances', value: (8 * maxExact('round16')) + (16 * (points.qualifiedRound16 || 0)) },
    { label: 'Cuartos: partidos y avances', value: (4 * maxExact('quarter')) + (8 * (points.qualifiedQuarter || 0)) },
    { label: 'Semifinales: partidos y avances', value: (2 * maxExact('semi')) + (4 * (points.qualifiedSemi || 0)) },
    { label: 'Final: partido y campeón', value: maxExact('final') + (2 * (points.qualifiedFinal || 0)) },
    { label: 'Cuadro de honor', value: honorMax },
    { label: 'Premios individuales', value: awardMax }
  ].filter((item) => item.value > 0);

  $('#phaseMaxPoints').innerHTML = `
    <div class="phase-max-title">Máximos por fase</div>
    <div class="phase-max-grid">
      ${items.map((item) => `
        <div class="phase-max-item">
          <span>${esc(item.label)}</span>
          <strong>${item.value}</strong>
        </div>
      `).join('')}
    </div>
  `;
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
  $('#participantDetails').innerHTML = predictionButton + (events.length ? groupedDetailEvents(events) : `<div class="empty">Todavía no tiene aciertos computados.</div>`);
  document.querySelector('.prediction-open-detail')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    openPredictions(ev.currentTarget.dataset.id);
  });
}

function toggleDetailGroup(button) {
  const group = button.closest('.detail-group');
  if (!group) return;
  const willOpen = !group.classList.contains('open');
  document.querySelectorAll('#participantDetails .detail-group.open').forEach((other) => {
    if (other !== group) {
      other.classList.remove('open');
      other.querySelector('.detail-group-header')?.setAttribute('aria-expanded', 'false');
    }
  });
  group.classList.toggle('open', willOpen);
  button.setAttribute('aria-expanded', String(willOpen));
  if (!willOpen) return;
  requestAnimationFrame(() => {
    const container = $('#participantDetails');
    if (!container) return;
    container.scrollTop = Math.max(0, group.offsetTop - 8);
  });
}

function groupedDetailEvents(events) {
  const groups = new Map(detailGroupDefinitions().map((group) => [group.key, []]));
  for (const event of events) {
    const key = detailGroupKey(event);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return [...groups.entries()].sort((a, b) => detailGroupOrder(a[0]) - detailGroupOrder(b[0])).map(([key, rows], index) => {
    const total = rows.reduce((sum, event) => sum + (event.points || 0), 0);
    const label = detailGroupLabel(key);
    const open = index === 0;
    return `
      <article class="detail-group ${open ? 'open' : ''}">
        <button class="detail-group-header" type="button" aria-expanded="${open ? 'true' : 'false'}" onclick="toggleDetailGroup(this)">
          <span class="detail-toggle">▸</span>
          <h3>${esc(label)}</h3>
          <span>${total} pts</span>
        </button>
        <div class="detail-group-body">
          ${rows.length ? rows.map((e) => detailEventHtml(e)).join('') : `<div class="detail-empty">Sin puntos todavía.</div>`}
        </div>
      </article>
    `;
  }).join('');
}

function detailGroupDefinitions() {
  return [
    ['groupMatches', 'Partidos fase de grupos'],
    ['groupPositions', 'Posiciones fase de grupos'],
    ['match:round32', 'Dieciseisavos: partidos y avances'],
    ['match:round16', 'Octavos: partidos y avances'],
    ['match:quarter', 'Cuartos: partidos y avances'],
    ['match:semi', 'Semifinales: partidos y avances'],
    ['match:final', 'Final: partido y campeón'],
    ['honor', 'Cuadro de honor'],
    ['awards', 'Premios individuales']
  ].map(([key, label], order) => ({ key, label, order }));
}

function detailGroupKey(event) {
  if (event.type === 'match') return event.stage === 'group' ? 'groupMatches' : `match:${event.stage}`;
  if (event.type === 'groupPosition') return 'groupPositions';
  if (event.type === 'qualifier') return qualifierDetailGroup(event.label);
  if (event.type === 'podium') return 'honor';
  if (event.type === 'award') return 'awards';
  return event.stage || event.type || 'other';
}

function qualifierDetailGroup(label) {
  const key = normalizeText(label);
  if (key === 'clasificado para dieciseisavos') return 'match:round32';
  if (key === 'clasificado para octavos') return 'match:round16';
  if (key === 'clasificado para cuartos') return 'match:quarter';
  if (key === 'clasificado para semifinales') return 'match:semi';
  if (key === 'clasificado para la final') return 'match:final';
  return `qualifier:${key}`;
}

function detailGroupLabel(key) {
  return detailGroupDefinitions().find((group) => group.key === key)?.label || stageName(key.split(':').at(-1)) || key;
}

function detailGroupOrder(key) {
  return detailGroupDefinitions().find((group) => group.key === key)?.order ?? 999;
}

function detailEventHtml(e) {
  return `
    <div class="detail-event">
      <strong>${esc(displayTeamsText(e.label || e.type))} <span class="points-pill">+${e.points}</span></strong>
      <div class="detail-meta">Predicción: ${esc(displayTeamsText(e.prediction || ''))}${e.actual ? ` · Real: ${esc(displayTeamsText(e.actual))}` : ''}</div>
      ${e.details ? `<div class="detail-meta">${esc(displayTeamsText(e.details))}</div>` : ''}
    </div>
  `;
}

function renderMatches() {
  const matches = state.dashboard?.actual?.matches || [];
  const visible = matches.filter((m) => m.homeTeam || m.awayTeam).sort(compareMatchesByKickoff);
  const lastFinished = [...visible].reverse().find((m) => m.finished);
  $('#matchesList').innerHTML = visible.length ? visible.map((m) => `
    <div class="match ${m.finished ? 'finished' : ''}" data-match-number="${esc(m.matchNumber)}">
      <div>
        <div class="match-title">${esc(displayTeam(m.homeTeam) || 'Por definir')} - ${esc(displayTeam(m.awayTeam) || 'Por definir')}</div>
        <div class="match-meta">#${esc(m.matchNumber)} · ${esc(stageName(m.stage))}${m.group ? ` · Grupo ${esc(m.group)}` : ''}${m.venue ? ` · ${esc(m.venue)}` : ''}</div>
        <div class="match-meta">${esc(matchDateLabel(m))}${m.finished ? ' · Finalizado' : ''}</div>
      </div>
      <div class="score">${m.homeScore ?? '–'}-${m.awayScore ?? '–'}</div>
    </div>
  `).join('') : `<div class="empty">La API aún no ha devuelto partidos normalizables.</div>`;
  if (lastFinished) {
    requestAnimationFrame(() => {
      const list = $('#matchesList');
      const target = list?.querySelector(`[data-match-number="${CSS.escape(String(lastFinished.matchNumber))}"]`);
      if (!list || !target) return;
      list.scrollTop = target.offsetTop - (list.clientHeight / 2) + (target.clientHeight / 2);
    });
  }
}

function renderPlayoffBracket() {
  const matches = state.dashboard?.actual?.matches || [];
  const byNumber = new Map(matches.map((match) => [Number(match.matchNumber), match]));
  const width = 1320;
  const height = 660;
  const columns = [70, 240, 395, 555, 660, 765, 925, 1080, 1250];
  const r32Y = [70, 140, 210, 280, 380, 450, 520, 590];
  const r16Y = [105, 245, 415, 555];
  const qfY = [175, 485];
  const sfY = [330];
  const leftR32 = [74, 77, 73, 75, 83, 84, 81, 82];
  const rightR32 = [76, 78, 79, 80, 86, 88, 85, 87];
  const leftR16 = [89, 90, 93, 94];
  const rightR16 = [91, 92, 95, 96];
  const left = {
    r32: leftR32.map((n, i) => bracketNode(n, columns[0], r32Y[i], byNumber.get(n))),
    r16: leftR16.map((n, i) => bracketNode(n, columns[1], r16Y[i], byNumber.get(n))),
    qf: range(97, 98).map((n, i) => bracketNode(n, columns[2], qfY[i], byNumber.get(n))),
    sf: [bracketNode(101, columns[3], sfY[0], byNumber.get(101))]
  };
  const right = {
    r32: rightR32.map((n, i) => bracketNode(n, columns[8], r32Y[i], byNumber.get(n), true)),
    r16: rightR16.map((n, i) => bracketNode(n, columns[7], r16Y[i], byNumber.get(n), true)),
    qf: range(99, 100).map((n, i) => bracketNode(n, columns[6], qfY[i], byNumber.get(n), true)),
    sf: [bracketNode(102, columns[5], sfY[0], byNumber.get(102), true)]
  };
  const final = bracketNode(104, columns[4], 142, byNumber.get(104), false, 190, 70);
  const nodes = [...left.r32, ...left.r16, ...left.qf, ...left.sf, final, ...right.sf, ...right.qf, ...right.r16, ...right.r32];
  const links = [
    ...bracketLinks(left.r32, left.r16),
    ...bracketLinks(left.r16, left.qf),
    ...bracketLinks(left.qf, left.sf),
    ...bracketLinks(right.r32, right.r16),
    ...bracketLinks(right.r16, right.qf),
    ...bracketLinks(right.qf, right.sf)
  ];
  $('#playoffBracket').innerHTML = `
    <svg class="playoff-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Cuadro de eliminatorias del Mundial 2026">
      <defs>
        <radialGradient id="pitchGlow" cx="50%" cy="58%" r="62%">
          <stop offset="0%" stop-color="rgba(255,248,219,.14)"></stop>
          <stop offset="58%" stop-color="rgba(120,0,22,.20)"></stop>
          <stop offset="100%" stop-color="rgba(8,0,3,.82)"></stop>
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="8" class="playoff-bg"></rect>
      <ellipse cx="${width / 2}" cy="${height + 28}" rx="520" ry="210" fill="url(#pitchGlow)"></ellipse>
      ${playoffTitle(70, 28, 'Dieciseisavos')}
      ${playoffTitle(240, 28, 'Octavos')}
      ${playoffTitle(395, 28, 'Cuartos')}
      ${playoffTitle(555, 28, 'Semifinal')}
      ${playoffTitle(660, 78, 'Final')}
      ${playoffTitle(765, 28, 'Semifinal')}
      ${playoffTitle(925, 28, 'Cuartos')}
      ${playoffTitle(1080, 28, 'Octavos')}
      ${playoffTitle(1250, 28, 'Dieciseisavos')}
      ${links.join('')}
      ${nodes.map(playoffNodeSvg).join('')}
    </svg>
  `;
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function bracketNode(matchNumber, x, y, match, right = false, w = 132, h = 46) {
  return { matchNumber, x, y, match, right, w, h };
}

function bracketLinks(fromNodes, toNodes) {
  return fromNodes.map((from, index) => {
    const to = toNodes[Math.floor(index / 2)];
    const fromX = from.right ? from.x - from.w / 2 : from.x + from.w / 2;
    const toX = to.right ? to.x + to.w / 2 : to.x - to.w / 2;
    const midX = (fromX + toX) / 2;
    return `<path d="M ${fromX} ${from.y} H ${midX} V ${to.y} H ${toX}" class="playoff-line"></path>`;
  });
}

function playoffNodeSvg(node) {
  const { match } = node;
  const x = node.x - node.w / 2;
  const y = node.y - node.h / 2;
  const home = displayTeam(match?.homeTeam) || 'Por definir';
  const away = displayTeam(match?.awayTeam) || 'Por definir';
  const homeLine = bracketTeamLine(home, match, 'home');
  const awayLine = bracketTeamLine(away, match, 'away');
  return `
    <g class="playoff-node ${node.matchNumber === 104 ? 'final' : ''} ${match?.finished ? 'finished' : ''}">
      <rect x="${x}" y="${y}" width="${node.w}" height="${node.h}" rx="8"></rect>
      <text x="${node.x}" y="${node.y - 7}" text-anchor="middle">${esc(shortTeam(homeLine))}</text>
      <text x="${node.x}" y="${node.y + 12}" text-anchor="middle">${esc(shortTeam(awayLine))}</text>
    </g>
  `;
}

function bracketTeamLine(team, match, side) {
  if (!match?.finished) return team;
  const score = side === 'home' ? match.homeScore : match.awayScore;
  const penalty = side === 'home' ? match.homePenaltyScore : match.awayPenaltyScore;
  const hasPenalty = penalty !== null && penalty !== undefined && penalty !== '';
  return `${team} ${score ?? '-'}${hasPenalty ? ` (${penalty})` : ''}`;
}

function playoffTitle(x, y, label) {
  return `<text x="${x}" y="${y}" text-anchor="middle" class="playoff-title">${esc(label)}</text>`;
}

function shortTeam(team) {
  return String(team || '').length > 18 ? `${String(team).slice(0, 16)}…` : team;
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
            <div class="mini-match-main">
              <span>${esc(displayTeam(m.homeTeam) || 'Por definir')} - ${esc(displayTeam(m.awayTeam) || 'Por definir')}</span>
              <small>${esc(matchDateLabel(m))}</small>
            </div>
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
  syncModalState();
  requestAnimationFrame(() => $('#closePredictionsBtn').focus());
}

function closePredictions() {
  $('#predictionsModal').classList.remove('open');
  $('#predictionsModal').setAttribute('aria-hidden', 'true');
  syncModalState();
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
  const checks = [
    [teams.home, actual?.homeTeam],
    [teams.away, actual?.awayTeam]
  ].filter(([team]) => isConcreteTeam(team));
  return !checks.length || checks.every(([predicted, real]) => sameTeamName(predicted, real));
}

function sameTeamName(a, b) {
  const left = normalizeText(TEAM_ES[a] || a);
  const right = normalizeText(TEAM_ES[b] || b);
  return Boolean(left && right && left === right);
}

function isConcreteTeam(value) {
  const text = String(value || '').trim();
  const norm = normalizeText(text);
  if (!text) return false;
  if (norm.includes('grupo') || norm.includes('finalista') || norm.includes('escribe un jugador')) return false;
  if (/^[wl](f|\d*)$/i.test(text)) return false;
  if (/^w[0-9]+$/i.test(text) || /^l[0-9]+$/i.test(text)) return false;
  if (/^\d+[a-l]$/i.test(text)) return false;
  if (/^\d+[a-l]{2,}$/i.test(text)) return false;
  if (/^[a-l]$/i.test(text)) return false;
  if (/^[0-9]+º/.test(text)) return false;
  if (/^[0-9]+\|/.test(text)) return false;
  return true;
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
  const teamsMatch = matchTeamsPrediction(prediction, actual);
  const exact = teamsMatch && Number(prediction.homeGoals) === Number(actual.homeScore) && Number(prediction.awayGoals) === Number(actual.awayScore);
  const sign = teamsMatch && scoreSign(prediction.homeGoals, prediction.awayGoals) === scoreSign(actual.homeScore, actual.awayScore);
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
  const teams = table.map((row, index) => ({ ...row, position: row.position || index + 1 }));
  const seen = new Set();
  for (const row of teams) {
    if (row.team) seen.add(normalizeText(row.team));
  }
  for (const match of matches || []) {
    if (match.stage !== 'group' || match.group !== group) continue;
    for (const team of [match.homeTeam, match.awayTeam]) {
      const key = normalizeText(team);
      if (!team || seen.has(key)) continue;
      seen.add(key);
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
  renderPlayoffBracket();
  renderQualified();
  renderGroups();
}

function openGame() {
  game.open = true;
  resetPenaltyBall();
  updateGameHud();
  $('#gameModal').classList.add('open');
  $('#gameModal').setAttribute('aria-hidden', 'false');
  syncModalState();
  requestAnimationFrame(() => $('#closeGameBtn').focus());
  resizePenaltyCanvas();
  startGameLoop();
}

function closeGame() {
  game.open = false;
  $('#gameModal').classList.remove('open');
  $('#gameModal').setAttribute('aria-hidden', 'true');
  syncModalState();
  if (game.raf) cancelAnimationFrame(game.raf);
  game.raf = null;
}

function openLobato() {
  $('#lobatoModal').classList.add('open');
  $('#lobatoModal').setAttribute('aria-hidden', 'false');
  syncModalState();
  requestAnimationFrame(() => $('#closeLobatoBtn').focus());
}

function closeLobato() {
  $('#lobatoModal').classList.remove('open');
  $('#lobatoModal').setAttribute('aria-hidden', 'true');
  syncModalState();
}

function syncModalState() {
  document.body.classList.toggle('modal-open', Boolean(document.querySelector('.modal.open')));
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

let cheerTimer = null;
function cheerSpain() {
  const hero = document.querySelector('.hero');
  hero.classList.remove('cheering');
  window.clearTimeout(cheerTimer);
  requestAnimationFrame(() => {
    hero.classList.add('cheering');
    cheerTimer = window.setTimeout(() => hero.classList.remove('cheering'), 1700);
  });
}

$('#refreshBtn').addEventListener('click', forceRefresh);
$('#cheerSpainBtn').addEventListener('click', cheerSpain);
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
let chartResizeTimer = null;
window.addEventListener('resize', () => {
  window.clearTimeout(chartResizeTimer);
  chartResizeTimer = window.setTimeout(renderHistoryChart, 120);
});
$('#searchInput').addEventListener('input', (ev) => {
  filter = ev.target.value;
  renderLeaderboard();
});

$('#participantDetails').addEventListener('click', (ev) => {
  const button = ev.target.closest('.detail-group-header');
  if (!button) return;
  if (button.hasAttribute('onclick')) return;
  ev.preventDefault();
  toggleDetailGroup(button);
});

$('#groupSelect').addEventListener('change', (ev) => {
  selectedGroup = ev.target.value;
  renderGroups();
});

$('#closePredictionsBtn').addEventListener('click', closePredictions);
$('#predictionsModal').addEventListener('click', (ev) => {
  if (ev.target.id === 'predictionsModal') closePredictions();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if ($('#lobatoModal').classList.contains('open')) closeLobato();
  else if ($('#gameModal').classList.contains('open')) closeGame();
  else if ($('#predictionsModal').classList.contains('open')) closePredictions();
});

loadDashboard();
setInterval(loadDashboard, 5 * 60 * 1000);
