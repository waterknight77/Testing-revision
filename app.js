// ============================================================
// A-LEVEL MATHS REVISION APP
// ============================================================

// ── STORAGE HELPERS ──────────────────────────────────────────
const store = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

function getHistory(qId) { return store.get('hist:' + qId) || []; }
function saveHistory(qId, entry) {
  const h = getHistory(qId);
  h.unshift(entry);
  store.set('hist:' + qId, h.slice(0, 20));
}
function getNotes(qId) { return store.get('notes:' + qId) || ''; }
function saveNotes(qId, text) { store.set('notes:' + qId, text); }
function getMMQuestions() { return store.get('mm:questions') || []; }
function saveMMQuestions(qs) { store.set('mm:questions', qs); }
function getAllHistory() {
  const all = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('hist:')) {
      const h = store.get(k);
      if (h && h.length) {
        h.forEach(e => all.push({ qId: k.slice(5), ...e }));
      }
    }
  }
  return all.sort((a, b) => b.ts - a.ts);
}

function getFlag(qId)      { return store.get('flag:' + qId) || false; }
function setFlag(qId, val) { store.set('flag:' + qId, val); }
function getAllFlags() {
  const flags = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('flag:') && store.get(k)) flags.push(k.slice(5));
  }
  return flags;
}

// ── SETTINGS ─────────────────────────────────────────────────
const SETTINGS_KEY = 'app:settings';
const defaultSettings = {
  requireTimer: true,   // must start timer before marking
  timerBuffer:  20,     // extra seconds buffer on suggested time
};
function getSettings() { return { ...defaultSettings, ...(store.get(SETTINGS_KEY) || {}) }; }
function saveSettings(s) { store.set(SETTINGS_KEY, s); }

// ── CLEAN BAD DATA ────────────────────────────────────────────
// Runs once on load — removes corrupted history entries
function cleanBadData() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k.startsWith('hist:')) continue;
    const h = store.get(k);
    if (!Array.isArray(h)) { localStorage.removeItem(k); continue; }
    const clean = h.filter(e =>
      e && typeof e.ts === 'number' &&
      (e.pct === undefined || (Number.isFinite(e.pct) && e.pct >= 0 && e.pct <= 100))
    );
    if (clean.length !== h.length) store.set(k, clean);
  }
}
cleanBadData();

// ── SUGGESTED TIME ────────────────────────────────────────────
// Edexcel papers are 2 hours (120 min) for ~100 marks.
// So roughly 1.2 min per mark, + buffer.
function suggestedSecs(marks) {
  const s = getSettings();
  return Math.round(marks * 1.2 * 60) + s.timerBuffer;
}
function fmtSecs(s) {
  return `${Math.floor(s/60)}m ${s%60}s`;
}


const views = {};
document.querySelectorAll('.view').forEach(v => { views[v.id.replace('view-', '')] = v; });
const navLinks = document.querySelectorAll('.nav-link');

function switchView(name) {
  Object.values(views).forEach(v => v.classList.remove('active-view'));
  navLinks.forEach(l => l.classList.remove('active'));
  if (views[name]) views[name].classList.add('active-view');
  const link = document.querySelector(`[data-view="${name}"]`);
  if (link) link.classList.add('active');
  if (name === 'home') updateDashboard();
  if (name === 'practice') renderTopicsGrid();
  if (name === 'pastpapers') renderPastPapers();
  if (name === 'madasmaths') renderMadAsMaths();
  if (name === 'stats') renderProgress();
  if (name === 'flagged') renderFlaggedView();
  if (name === 'settings') renderSettingsView();
}

navLinks.forEach(l => l.addEventListener('click', e => { e.preventDefault(); switchView(l.dataset.view); }));

// ── DATE ─────────────────────────────────────────────────────
document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// ── TIMER FACTORY (stopwatch + countdown) ─────────────────────
function makeTimer(displayEl) {
  let secs = 0, interval = null, running = false;
  let mode = 'up';   // 'up' = stopwatch, 'down' = countdown
  let limitSecs = 0; // only used in countdown mode
  let onExpire = null;

  function fmt(s) {
    const abs = Math.abs(s);
    return `${String(Math.floor(abs / 60)).padStart(2,'0')}:${String(abs % 60).padStart(2,'0')}`;
  }

  function updateDisplay() {
    const val = mode === 'up' ? secs : limitSecs - secs;
    displayEl.textContent = fmt(val);
    // colour feedback in countdown mode
    if (mode === 'down') {
      const rem = limitSecs - secs;
      displayEl.classList.toggle('timer-warning', rem <= limitSecs * 0.25 && rem > 60);
      displayEl.classList.toggle('timer-danger',  rem <= 60);
    } else {
      displayEl.classList.remove('timer-warning','timer-danger');
    }
  }

  function tick() {
    secs++;
    updateDisplay();
    if (mode === 'down' && secs >= limitSecs) {
      clearInterval(interval); running = false;
      displayEl.textContent = '00:00';
      displayEl.classList.add('timer-danger');
      if (onExpire) onExpire();
    }
  }

  return {
    setMode(m, mins, expireFn) {
      mode = m; limitSecs = (mins || 8) * 60; onExpire = expireFn || null;
      this.reset();
    },
    start() { if (!running) { running = true; interval = setInterval(tick, 1000); } },
    pause() { running = false; clearInterval(interval); },
    reset() { this.pause(); secs = 0; updateDisplay(); },
    value() { return secs; },
    isRunning() { return running; },
    getMode() { return mode; },
  };
}

// ── SCORE RING ─────────────────────────────────────────────────
function scoreRingSVG(pct, color) {
  const r = 14, circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return `<svg viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">
    <circle class="score-ring-bg" cx="17" cy="17" r="${r}"/>
    <circle class="score-ring-fg" cx="17" cy="17" r="${r}" stroke="${color}"
      stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/>
    <text x="17" y="21" text-anchor="middle" class="score-ring-text">${pct}%</text>
  </svg>`;
}

function avgScore(qId) {
  const h = getHistory(qId);
  if (!h.length) return null;
  const scores = h.filter(e => e.pct !== undefined);
  if (!scores.length) return null;
  return Math.round(scores.reduce((s, e) => s + e.pct, 0) / scores.length);
}

function bookColor(book) {
  return { y1p: 'var(--y1p)', y1s: 'var(--y1s)', y2p: 'var(--y2p)', y2s: 'var(--y2s)' }[book] || 'var(--accent)';
}

// ── DASHBOARD ─────────────────────────────────────────────────
function updateDashboard() {
  const allH = getAllHistory();
  document.getElementById('stat-done').textContent = allH.length;

  const scored = allH.filter(e => e.pct !== undefined);
  document.getElementById('stat-avg').textContent = scored.length
    ? Math.round(scored.reduce((s, e) => s + e.pct, 0) / scored.length) + '%' : '—';

  const totalSecs = allH.reduce((s, e) => s + (e.secs || 0), 0);
  document.getElementById('stat-time').textContent = totalSecs < 3600
    ? Math.floor(totalSecs / 60) + 'm'
    : (totalSecs / 3600).toFixed(1) + 'h';

  // streak
  const days = new Set(allH.map(e => new Date(e.ts).toDateString()));
  let streak = 0, d = new Date();
  while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
  document.getElementById('stat-streak').textContent = streak;

  // recent activity
  const ra = document.getElementById('recent-activity');
  if (!allH.length) {
    ra.innerHTML = '<div class="empty-state">No activity yet — start practising!</div>';
  } else {
    ra.innerHTML = allH.slice(0, 6).map(e => {
      const dt = new Date(e.ts);
      // find human-readable question label
      let qLabel = e.qId;
      for (const t of TOPICS) {
        const q = t.questions?.find(q => q.id === e.qId);
        if (q) { qLabel = `${t.title} Q${t.questions.indexOf(q)+1}`; break; }
      }
      const pctStr = e.pct !== undefined
        ? `<span class="history-score ${e.pct >= 70 ? 'good' : e.pct >= 40 ? 'mid' : 'bad'}">${e.pct}%</span>` : '';
      return `<div class="history-entry">
        <span class="history-date">${dt.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
        <span style="font-size:0.82rem;color:var(--text-dim);flex:1">${qLabel}</span>
        ${pctStr}
      </div>`;
    }).join('');
  }

  // weak topics — clickable, navigate to topic
  const wt = document.getElementById('weak-topics');
  const topicAvgs = {};
  TOPICS.forEach(t => {
    const sc = t.questions.map(q => avgScore(q.id)).filter(s => s !== null);
    if (sc.length) topicAvgs[t.id] = { title: t.title, avg: Math.round(sc.reduce((a,b)=>a+b,0)/sc.length) };
  });
  const weak = Object.entries(topicAvgs).sort((a,b) => a[1].avg - b[1].avg).slice(0, 6);
  if (!weak.length) {
    wt.innerHTML = '<div class="empty-state">Complete questions to see weak areas</div>';
  } else {
    wt.innerHTML = weak.map(([id, {title, avg}]) =>
      `<div class="progress-bar-row dash-topic-link" data-topicid="${id}" style="cursor:pointer" title="Open ${title}">
        <span class="pbr-label">${title}</span>
        <div class="pbr-bar"><div class="pbr-fill" style="width:${avg}%;background:${avg<40?'var(--accent3)':avg<70?'var(--accent)':'var(--accent4)'}"></div></div>
        <span class="pbr-val">${avg}%</span>
      </div>`
    ).join('');
    wt.querySelectorAll('.dash-topic-link').forEach(el => {
      el.addEventListener('click', () => {
        switchView('practice');
        setTimeout(() => openTopicPanel(el.dataset.topicid), 50);
      });
    });
  }

  // flagged questions panel
  const flags = getAllFlags();
  const fp = document.getElementById('flagged-panel');
  if (!fp) return;
  if (!flags.length) {
    fp.innerHTML = '<div class="empty-state">No flagged questions</div>';
  } else {
    fp.innerHTML = flags.slice(0, 8).map(qId => {
      let qLabel = qId, topicId = null, qIdx = 0;
      for (const t of TOPICS) {
        const qi = t.questions?.findIndex(q => q.id === qId);
        if (qi >= 0) { qLabel = `${t.title} Q${qi+1}`; topicId = t.id; qIdx = qi; break; }
      }
      return `<div class="history-entry dash-flag-link" data-topicid="${topicId}" data-qidx="${qIdx}" style="cursor:pointer">
        <span style="color:var(--accent);margin-right:4px">⚑</span>
        <span style="font-size:0.82rem;color:var(--text-dim);flex:1">${qLabel}</span>
      </div>`;
    }).join('');
    fp.querySelectorAll('.dash-flag-link').forEach(el => {
      el.addEventListener('click', () => {
        if (!el.dataset.topicid || el.dataset.topicid === 'null') return;
        switchView('practice');
        setTimeout(() => {
          openTopicPanel(el.dataset.topicid);
          currentQIdx = parseInt(el.dataset.qidx) || 0;
          renderCurrentQuestion();
        }, 80);
      });
    });
  }
}

// ── TOPICS GRID ───────────────────────────────────────────────
let activeBooks = new Set(['y1p', 'y1s', 'y2p', 'y2s']);

document.querySelectorAll('.chip').forEach(c => {
  c.addEventListener('click', () => {
    const f = c.dataset.filter;
    if (activeBooks.has(f)) { activeBooks.delete(f); c.classList.remove('active-chip'); }
    else { activeBooks.add(f); c.classList.add('active-chip'); }
    renderTopicsGrid();
  });
});

function renderTopicsGrid() {
  const search = (document.getElementById('topic-search')?.value || '').toLowerCase();
  const grid = document.getElementById('topics-grid');
  const filtered = TOPICS.filter(t => activeBooks.has(t.book) && (!search || t.title.toLowerCase().includes(search)));

  const groups = {};
  filtered.forEach(t => {
    const g = t.book;
    if (!groups[g]) groups[g] = [];
    groups[g].push(t);
  });

  const bookLabels = { y1p: 'Year 1 — Pure', y1s: 'Year 1 — Statistics & Mechanics', y2p: 'Year 2 — Pure', y2s: 'Year 2 — Statistics & Mechanics' };
  const order = ['y1p', 'y1s', 'y2p', 'y2s'];

  let html = '';
  order.forEach(b => {
    if (!groups[b]) return;
    html += `<div class="topic-group-title">${bookLabels[b]}</div>`;
    groups[b].forEach(t => {
      const avg = (() => {
        const sc = t.questions.map(q => avgScore(q.id)).filter(s => s !== null);
        return sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null;
      })();
      const done = t.questions.filter(q => getHistory(q.id).length > 0).length;
      const flagCount = t.questions.filter(q => getFlag(q.id)).length;
      // last attempted across all questions in this topic
      const lastTs = t.questions.flatMap(q => getHistory(q.id).map(h => h.ts)).sort((a,b)=>b-a)[0];
      const lastStr = lastTs ? new Date(lastTs).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : null;
      const col = bookColor(b);
      html += `<div class="topic-card" data-id="${t.id}" style="--book-color:${col}">
        ${avg !== null ? `<div class="topic-score">${scoreRingSVG(avg, col)}</div>` : ''}
        <div class="topic-name">${t.title}</div>
        <div class="topic-meta">
          <span>${t.questions.length} questions</span>
          <span>${done}/${t.questions.length} done</span>
          ${flagCount ? `<span class="flag-badge">⚑ ${flagCount}</span>` : ''}
        </div>
        ${lastStr ? `<div class="last-attempted">Last: ${lastStr}</div>` : ''}
      </div>`;
    });
  });

  if (!html) html = '<div class="empty-state" style="grid-column:1/-1">No topics match your filter.</div>';
  grid.innerHTML = html;

  grid.querySelectorAll('.topic-card').forEach(card => {
    card.addEventListener('click', () => openTopicPanel(card.dataset.id));
  });
}

document.getElementById('topic-search')?.addEventListener('input', renderTopicsGrid);

// ── TOPIC QUESTION PANEL ──────────────────────────────────────
let currentTopic = null, currentQIdx = 0;
const qTimer = makeTimer(document.getElementById('q-timer'));
let qTimerMode = 'up';

// Timer mode toggle
document.getElementById('q-mode-up')?.addEventListener('click', () => {
  qTimerMode = 'up';
  qTimer.setMode('up');
  document.getElementById('q-mode-up').classList.add('tmode-active');
  document.getElementById('q-mode-down').classList.remove('tmode-active');
  document.getElementById('q-countdown-mins').style.opacity = '0.3';
});
document.getElementById('q-mode-down')?.addEventListener('click', () => {
  qTimerMode = 'down';
  const mins = parseInt(document.getElementById('q-countdown-mins').value) || 8;
  qTimer.setMode('down', mins, () => {
    document.getElementById('q-timer').textContent = 'TIME!';
  });
  document.getElementById('q-mode-down').classList.add('tmode-active');
  document.getElementById('q-mode-up').classList.remove('tmode-active');
  document.getElementById('q-countdown-mins').style.opacity = '1';
});

function openTopicPanel(topicId) {
  currentTopic = TOPICS.find(t => t.id === topicId);
  if (!currentTopic) return;
  currentQIdx = 0;
  qTimer.reset();
  document.getElementById('qpanel-topic-name').textContent = currentTopic.title;
  document.getElementById('question-panel').classList.remove('hidden');
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  if (!currentTopic) return;
  const q = currentTopic.questions[currentQIdx];
  document.getElementById('q-position').textContent = `Q${currentQIdx + 1} of ${currentTopic.questions.length}`;
  document.getElementById('q-notes').value = getNotes(q.id);
  document.getElementById('score-form').classList.add('hidden');
  document.getElementById('score-got').value = '';
  document.getElementById('score-max').value = '';
  document.getElementById('q-hint-area').classList.add('hidden');
  document.getElementById('q-answer-box')?.classList.add('hidden');

  // Flag button state
  const flagBtn = document.getElementById('btn-flag-q');
  flagBtn.classList.toggle('flagged', getFlag(q.id));

  document.getElementById('question-display').innerHTML = `
    <h3>Question ${currentQIdx + 1}</h3>
    <p>${q.text}</p>
    <div style="display:flex;align-items:center;gap:12px;margin-top:12px;flex-wrap:wrap">
      <span class="marks">[${q.marks} marks]</span>
      <span class="suggested-time">⏱ Suggested: ~${fmtSecs(suggestedSecs(q.marks))}</span>
      ${q.source ? `<span style="font-size:0.75rem;color:var(--text-muted)">Source: ${q.source}</span>` : ''}
    </div>
  `;

  // Show/hide hint button
  const hintBtn = document.getElementById('btn-show-hint');
  if (q.hint) {
    hintBtn.style.display = '';
    document.getElementById('q-hint-text').textContent = q.hint;
  } else {
    hintBtn.style.display = 'none';
  }

  renderQHistory(q.id, 'q-history');
  if (window.MathJax) MathJax.typesetPromise([document.getElementById('question-display')]).catch(() => {});
}

function renderQHistory(qId, containerId) {
  const h = getHistory(qId);
  const el = document.getElementById(containerId);
  if (!h.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.08em">Attempt History</div>' +
    h.map(e => {
      const d = new Date(e.ts);
      const pctStr = e.pct !== undefined
        ? `<span class="history-score ${e.pct >= 70 ? 'good' : e.pct >= 40 ? 'mid' : 'bad'}">${e.pct}%</span>`
        : '<span class="history-score" style="color:var(--text-muted)">Unscored</span>';
      const timeStr = e.secs ? `<span class="history-time">${Math.floor(e.secs / 60)}m ${e.secs % 60}s</span>` : '';
      return `<div class="history-entry">
        <span class="history-date">${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
        <span style="font-size:0.78rem;color:var(--text-dim)">${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
        ${timeStr}
        ${pctStr}
        ${e.notes ? `<span style="font-size:0.75rem;color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${e.notes}">📝 ${e.notes.slice(0, 40)}</span>` : ''}
      </div>`;
    }).join('');
}

document.getElementById('back-to-topics').addEventListener('click', () => {
  qTimer.reset();
  document.getElementById('question-panel').classList.add('hidden');
  renderTopicsGrid();
});

document.getElementById('btn-start-timer').addEventListener('click', () => {
  if (qTimerMode === 'down') {
    const mins = parseInt(document.getElementById('q-countdown-mins').value) || 8;
    qTimer.setMode('down', mins, () => { document.getElementById('q-timer').textContent = 'TIME!'; });
  }
  qTimer.start();
});
document.getElementById('btn-pause-timer').addEventListener('click', () => qTimer.pause());
document.getElementById('btn-reset-timer').addEventListener('click', () => {
  if (qTimerMode === 'down') {
    const mins = parseInt(document.getElementById('q-countdown-mins').value) || 8;
    qTimer.setMode('down', mins);
  }
  qTimer.reset();
});

document.getElementById('btn-flag-q').addEventListener('click', () => {
  if (!currentTopic) return;
  const q = currentTopic.questions[currentQIdx];
  const newVal = !getFlag(q.id);
  setFlag(q.id, newVal);
  document.getElementById('btn-flag-q').classList.toggle('flagged', newVal);
  renderTopicsGrid();
});

document.getElementById('btn-show-hint').addEventListener('click', () => {
  document.getElementById('q-hint-area').classList.toggle('hidden');
});

document.getElementById('btn-prev-q').addEventListener('click', () => {
  if (currentQIdx > 0) { currentQIdx--; qTimer.reset(); renderCurrentQuestion(); }
});
document.getElementById('btn-next-q').addEventListener('click', () => {
  if (currentTopic && currentQIdx < currentTopic.questions.length - 1) { currentQIdx++; qTimer.reset(); renderCurrentQuestion(); }
});

document.getElementById('btn-mark-done').addEventListener('click', () => {
  if (!currentTopic) return;
  const s = getSettings();
  // Enforce timer requirement
  if (s.requireTimer && !qTimer.isRunning() && qTimer.value() === 0) {
    showTimerWarning('q-timer-warning');
    return;
  }
  qTimer.pause();
  const q = currentTopic.questions[currentQIdx];
  saveNotes(q.id, document.getElementById('q-notes').value);
  document.getElementById('score-form').classList.remove('hidden');
  document.getElementById('score-got').value = '';
  // Lock max marks to question's mark value
  const maxEl = document.getElementById('score-max');
  maxEl.value = q.marks;
  maxEl.readOnly = true;
  maxEl.style.opacity = '0.6';
  document.getElementById('score-got').focus();
  // Show answer
  const answerBox = document.getElementById('q-answer-box');
  if (answerBox) {
    if (q.answer) {
      answerBox.classList.remove('hidden');
      document.getElementById('q-answer-text').innerHTML = q.answer;
      if (window.MathJax) MathJax.typesetPromise([answerBox]).catch(() => {});
    } else answerBox.classList.add('hidden');
  }
});

document.getElementById('btn-save-score').addEventListener('click', () => {
  if (!currentTopic) return;
  const q = currentTopic.questions[currentQIdx];
  const gotEl = document.getElementById('score-got');
  const got = parseInt(gotEl.value);
  const max = q.marks; // always use question's own marks
  if (isNaN(got) || got < 0 || got > max) {
    gotEl.style.borderColor = 'var(--accent3)';
    gotEl.focus();
    gotEl.title = `Enter a number between 0 and ${max}`;
    setTimeout(() => { gotEl.style.borderColor = ''; }, 2000);
    return;
  }
  const pct = Math.round((got / max) * 100);
  const notes = document.getElementById('q-notes').value;
  saveNotes(q.id, notes);
  saveHistory(q.id, { ts: Date.now(), secs: qTimer.value(), pct, got, max, notes });
  qTimer.reset();
  document.getElementById('score-form').classList.add('hidden');
  document.getElementById('q-answer-box')?.classList.add('hidden');
  document.getElementById('q-timer-warning')?.classList.add('hidden');
  renderCurrentQuestion();
  renderTopicsGrid();
});

// auto-save notes on blur
document.getElementById('q-notes').addEventListener('blur', () => {
  if (currentTopic) saveNotes(currentTopic.questions[currentQIdx].id, document.getElementById('q-notes').value);
});

// ── PAST PAPERS ───────────────────────────────────────────────
let currentPaper = null, currentPPIdx = 0;

function renderPastPapers() {
  const yearF = document.getElementById('pp-year').value;
  const paperF = document.getElementById('pp-paper').value;
  const filtered = PAST_PAPERS.filter(p =>
    (!yearF || p.year == yearF) &&
    (!paperF || p.paper === paperF)
  );

  const grid = document.getElementById('papers-grid');
  if (!filtered.length) { grid.innerHTML = '<div class="empty-state">No papers match your filter.</div>'; return; }

  grid.innerHTML = filtered.map(p => {
    const done = p.questions.filter(q => getHistory(q.id).length > 0).length;
    const pct = Math.round((done / p.questions.length) * 100);
    return `<div class="paper-card" data-id="${p.id}">
      <div class="paper-card-title">${p.title}</div>
      <div class="paper-card-meta">
        <span>📅 ${p.year}</span>
        <span>📝 ${p.questions.length} questions</span>
        <span>${done}/${p.questions.length} done</span>
      </div>
      ${p.link ? `<a href="${p.link}" target="_blank" style="font-size:0.75rem;color:var(--accent2);text-decoration:none" onclick="event.stopPropagation()">↗ Download paper</a>` : ''}
      <div class="paper-card-progress"><div class="paper-card-progress-bar" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.paper-card').forEach(c => {
    c.addEventListener('click', () => openPPPanel(c.dataset.id));
  });
}

['pp-year', 'pp-paper'].forEach(id => document.getElementById(id).addEventListener('change', renderPastPapers));

function openPPPanel(paperId) {
  currentPaper = PAST_PAPERS.find(p => p.id === paperId);
  if (!currentPaper) return;
  currentPPIdx = 0;
  ppTimer.reset();
  document.getElementById('pp-qpanel-name').textContent = currentPaper.title;
  document.getElementById('pp-question-panel').classList.remove('hidden');
  renderCurrentPPQuestion();
}

function renderCurrentPPQuestion() {
  if (!currentPaper) return;
  const q = currentPaper.questions[currentPPIdx];
  document.getElementById('pp-q-position').textContent = `Q${currentPPIdx + 1} of ${currentPaper.questions.length}`;
  document.getElementById('pp-notes').value = getNotes(q.id);
  document.getElementById('pp-score-form').classList.add('hidden');

  const flagBtn = document.getElementById('pp-btn-flag');
  if (flagBtn) flagBtn.classList.toggle('flagged', getFlag(q.id));

  const pdfUrl  = currentPaper.pdfUrl || null;
  const solUrl  = currentPaper.solUrl || null;
  const pageUrl = pdfUrl && q.page ? `${pdfUrl}#page=${q.page}` : pdfUrl;

  document.getElementById('pp-question-display').innerHTML = `
    <div class="pp-q-header">
      <div>
        <h3>Question ${q.num} <span class="marks">[${q.marks} marks]</span>
          <span class="suggested-time" style="margin-left:8px">⏱ ~${fmtSecs(suggestedSecs(q.marks))}</span>
        </h3>
        <span class="pp-topic-badge">${q.topic}</span>
        ${q.page ? `<span style="font-size:0.7rem;color:var(--text-muted);margin-left:8px;font-family:'Space Mono',monospace">≈ p.${q.page}</span>` : ''}
      </div>
      <div class="pp-paper-links">
        ${pageUrl  ? `<a href="${pageUrl}"  target="_blank" class="btn btn-secondary" style="font-size:0.8rem;text-decoration:none;padding:6px 12px">📄 Open Paper</a>` : ''}
        ${solUrl   ? `<a href="${solUrl}"   target="_blank" class="btn btn-secondary" style="font-size:0.8rem;text-decoration:none;padding:6px 12px">✓ Mark Scheme</a>` : ''}
        ${!pageUrl ? `<a href="${currentPaper.link}" target="_blank" class="btn btn-secondary" style="font-size:0.8rem;text-decoration:none;padding:6px 12px">↗ Get Paper</a>` : ''}
      </div>
    </div>
    <div class="pp-q-body">
      <p class="pp-q-desc">${q.text}</p>
      <div class="pp-q-howto">
        Work through <strong>Question ${q.num}</strong> on your tablet or paper, then log your time and score below.
        ${q.page ? `The question starts on approximately <strong>page ${q.page}</strong> of the paper.` : ''}
      </div>
    </div>
    ${pageUrl ? `
    <details class="pp-pdf-embed-toggle" id="pp-pdf-details">
      <summary>📄 View paper inline (page ${q.page || 1})</summary>
      <iframe src="${pageUrl}" class="pp-pdf-iframe" title="${currentPaper.title}"></iframe>
    </details>` : ''}
  `;

  renderQHistory(q.id, 'pp-q-history');
}

const ppTimer = makeTimer(document.getElementById('pp-timer'));
let ppTimerMode = 'up';

document.getElementById('pp-mode-up')?.addEventListener('click', () => {
  ppTimerMode = 'up'; ppTimer.setMode('up');
  document.getElementById('pp-mode-up').classList.add('tmode-active');
  document.getElementById('pp-mode-down').classList.remove('tmode-active');
});
document.getElementById('pp-mode-down')?.addEventListener('click', () => {
  ppTimerMode = 'down';
  const mins = parseInt(document.getElementById('pp-countdown-mins').value) || 8;
  ppTimer.setMode('down', mins);
  document.getElementById('pp-mode-down').classList.add('tmode-active');
  document.getElementById('pp-mode-up').classList.remove('tmode-active');
});

document.getElementById('back-to-papers').addEventListener('click', () => {
  ppTimer.reset();
  document.getElementById('pp-question-panel').classList.add('hidden');
  renderPastPapers();
});

document.getElementById('pp-btn-start').addEventListener('click', () => {
  if (ppTimerMode === 'down') {
    const mins = parseInt(document.getElementById('pp-countdown-mins').value) || 8;
    ppTimer.setMode('down', mins);
  }
  ppTimer.start();
});
document.getElementById('pp-btn-pause').addEventListener('click', () => ppTimer.pause());
document.getElementById('pp-btn-reset').addEventListener('click', () => ppTimer.reset());

document.getElementById('pp-btn-flag')?.addEventListener('click', () => {
  if (!currentPaper) return;
  const q = currentPaper.questions[currentPPIdx];
  const newVal = !getFlag(q.id);
  setFlag(q.id, newVal);
  document.getElementById('pp-btn-flag').classList.toggle('flagged', newVal);
});

document.getElementById('pp-btn-prev').addEventListener('click', () => {
  if (currentPPIdx > 0) { currentPPIdx--; ppTimer.reset(); renderCurrentPPQuestion(); }
});
document.getElementById('pp-btn-next').addEventListener('click', () => {
  if (currentPaper && currentPPIdx < currentPaper.questions.length - 1) { currentPPIdx++; ppTimer.reset(); renderCurrentPPQuestion(); }
});

document.getElementById('pp-btn-mark').addEventListener('click', () => {
  if (!currentPaper) return;
  const s = getSettings();
  if (s.requireTimer && !ppTimer.isRunning() && ppTimer.value() === 0) {
    showTimerWarning('pp-timer-warning');
    return;
  }
  ppTimer.pause();
  const q = currentPaper.questions[currentPPIdx];
  saveNotes(q.id, document.getElementById('pp-notes').value);
  document.getElementById('pp-score-form').classList.remove('hidden');
  document.getElementById('pp-score-got').value = '';
  const maxEl = document.getElementById('pp-score-max');
  maxEl.value = q.marks;
  maxEl.readOnly = true;
  maxEl.style.opacity = '0.6';
  document.getElementById('pp-score-got').focus();
});

document.getElementById('pp-btn-save').addEventListener('click', () => {
  if (!currentPaper) return;
  const q = currentPaper.questions[currentPPIdx];
  const gotEl = document.getElementById('pp-score-got');
  const got = parseInt(gotEl.value);
  const max = q.marks;
  if (isNaN(got) || got < 0 || got > max) {
    gotEl.style.borderColor = 'var(--accent3)';
    gotEl.focus();
    setTimeout(() => { gotEl.style.borderColor = ''; }, 2000);
    return;
  }
  const pct = Math.round((got / max) * 100);
  const notes = document.getElementById('pp-notes').value;
  saveNotes(q.id, notes);
  saveHistory(q.id, { ts: Date.now(), secs: ppTimer.value(), pct, got, max, notes });
  ppTimer.reset();
  document.getElementById('pp-score-form').classList.add('hidden');
  document.getElementById('pp-timer-warning')?.classList.add('hidden');
  renderCurrentPPQuestion();
  renderPastPapers();
});

document.getElementById('pp-notes').addEventListener('blur', () => {
  if (currentPaper) saveNotes(currentPaper.questions[currentPPIdx].id, document.getElementById('pp-notes').value);
});

// ── MADASMATHS — TOPIC BROWSER ────────────────────────────────
// Renders topic cards with expandable direct PDF links.
// No tracking needed — just one-click to open papers.

const MM_CAT_COLOR = {
  'Pure': 'var(--y1p)',
  'Statistics': 'var(--y1s)',
  'Mechanics': 'var(--accent2)',
  'Practice Papers': 'var(--y2p)',
};

function renderMadAsMaths() {
  const catF    = document.getElementById('mm-cat-filter')?.value || '';
  const searchF = (document.getElementById('mm-search')?.value || '').toLowerCase();

  const filtered = MADASMATHS_TOPICS.filter(t =>
    (!catF    || t.category === catF) &&
    (!searchF || t.title.toLowerCase().includes(searchF) || t.category.toLowerCase().includes(searchF))
  );

  const grid = document.getElementById('mm-topic-grid');
  if (!filtered.length) { grid.innerHTML = '<div class="empty-state">No topics match.</div>'; return; }

  // Group by category
  const order = ['Pure', 'Statistics', 'Mechanics', 'Practice Papers'];
  const groups = {};
  filtered.forEach(t => (groups[t.category] = groups[t.category] || []).push(t));

  let html = '';
  order.forEach(cat => {
    if (!groups[cat]) return;
    const col = MM_CAT_COLOR[cat] || 'var(--accent)';
    html += `<div class="topic-group-title" style="color:${col}">${cat}</div>`;
    groups[cat].forEach(t => {
      const isPaperSeries = t.pdfs.length > 4; // paper series have 21-26 entries
      html += `<div class="mm-topic-card" data-id="${t.id}" style="--bc:${col}">
        <div class="mm-card-header">
          <span class="mm-card-title">${t.title}</span>
          <span class="mm-card-count">${t.pdfs.length} PDF${t.pdfs.length !== 1 ? 's' : ''}</span>
          <span class="mm-card-chevron">▸</span>
        </div>
        <div class="mm-card-body hidden">
          ${t.pageUrl ? `<a href="${t.pageUrl}" target="_blank" class="mm-page-link">🌐 Browse on MadAsMaths ↗</a>` : ''}
          ${isPaperSeries
            ? `<div class="mm-paper-grid">${t.pdfs.map(p => `
                <span class="mm-paper-pair">
                  <a href="${p.url}" target="_blank" class="mm-pdf-btn">📄 ${p.label}</a>
                  ${p.sol ? `<a href="${p.sol}" target="_blank" class="mm-pdf-btn mm-sol-btn">✓ Solutions</a>` : ''}
                </span>`).join('')}</div>`
            : `<div class="mm-pdf-list">${t.pdfs.map(p => `
                <a href="${p.url}" target="_blank" class="mm-pdf-row">
                  <span class="mm-pdf-icon">📄</span>
                  <span class="mm-pdf-name">${p.label}</span>
                  <span class="mm-pdf-arrow">↗</span>
                </a>`).join('')}
              ${t.papers.map(p => `
                <a href="${p.url}" target="_blank" class="mm-pdf-row mm-paper-row">
                  <span class="mm-pdf-icon">📝</span>
                  <span class="mm-pdf-name">${p.label}</span>
                  <span class="mm-pdf-arrow">↗</span>
                </a>`).join('')}</div>`
          }
        </div>
      </div>`;
    });
  });

  grid.innerHTML = html;

  // Expand/collapse on click
  grid.querySelectorAll('.mm-topic-card').forEach(card => {
    card.querySelector('.mm-card-header').addEventListener('click', () => {
      const body = card.querySelector('.mm-card-body');
      const chevron = card.querySelector('.mm-card-chevron');
      const open = !body.classList.contains('hidden');
      body.classList.toggle('hidden', open);
      chevron.textContent = open ? '▸' : '▾';
      card.classList.toggle('mm-card-open', !open);
    });
  });
}

document.getElementById('mm-cat-filter')?.addEventListener('change', renderMadAsMaths);
document.getElementById('mm-search')?.addEventListener('input', renderMadAsMaths);

// ── PROGRESS VIEW ─────────────────────────────────────────────
function renderProgress() {
  const content = document.getElementById('progress-content');
  const books = [
    { key: 'y1p', label: 'Year 1 Pure', color: 'var(--y1p)' },
    { key: 'y1s', label: 'Year 1 Statistics & Mechanics', color: 'var(--y1s)' },
    { key: 'y2p', label: 'Year 2 Pure', color: 'var(--y2p)' },
    { key: 'y2s', label: 'Year 2 Statistics & Mechanics', color: 'var(--y2s)' },
  ];

  let html = '';
  books.forEach(b => {
    const topics = TOPICS.filter(t => t.book === b.key);
    html += `<div class="progress-section">
      <div class="progress-section-title" style="color:${b.color}">${b.label}</div>`;
    topics.forEach(t => {
      const sc = t.questions.map(q => avgScore(q.id)).filter(s => s !== null);
      const avg = sc.length ? Math.round(sc.reduce((a, x) => a + x, 0) / sc.length) : null;
      const done = t.questions.filter(q => getHistory(q.id).length > 0).length;
      const fillColor = avg === null ? 'var(--border)' : avg >= 70 ? 'var(--accent4)' : avg >= 40 ? b.color : 'var(--accent3)';
      html += `<div class="progress-bar-row">
        <span class="pbr-label" title="${t.title}">${t.title}</span>
        <div class="pbr-bar"><div class="pbr-fill" style="width:${avg || 0}%;background:${fillColor}"></div></div>
        <span class="pbr-val">${avg !== null ? avg + '%' : done + '/' + t.questions.length}</span>
      </div>`;
    });
    html += '</div>';
  });

  // Past paper progress
  html += `<div class="progress-section">
    <div class="progress-section-title" style="color:var(--accent2)">Past Papers</div>`;
  PAST_PAPERS.forEach(p => {
    const done = p.questions.filter(q => getHistory(q.id).length > 0).length;
    const pct = Math.round((done / p.questions.length) * 100);
    html += `<div class="progress-bar-row">
      <span class="pbr-label" title="${p.title}">${p.title}</span>
      <div class="pbr-bar"><div class="pbr-fill" style="width:${pct}%;background:var(--accent2)"></div></div>
      <span class="pbr-val">${done}/${p.questions.length}</span>
    </div>`;
  });
  html += '</div>';

  content.innerHTML = html;
}

// ── EXPORT ────────────────────────────────────────────────────
document.getElementById('btn-export').addEventListener('click', () => {
  const allH = getAllHistory();
  const csv = ['Question ID,Date,Score %,Time (s),Notes']
    .concat(allH.map(e => `"${e.qId}","${new Date(e.ts).toISOString()}","${e.pct ?? ''}","${e.secs ?? ''}","${(e.notes || '').replace(/"/g, '""')}"` ))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'maths-progress.csv'; a.click();
  URL.revokeObjectURL(url);
});

// ── FLAGGED VIEW ───────────────────────────────────────────────
function renderFlaggedView() {
  const flags = getAllFlags();
  const list = document.getElementById('flagged-list');
  if (!list) return;

  if (!flags.length) {
    list.innerHTML = '<div class="empty-state" style="margin-top:40px">No flagged questions — use the ⚑ button while practising to flag questions for review.</div>';
    return;
  }

  // Group flagged questions by topic/paper
  const groups = { topic: [], paper: [] };
  flags.forEach(qId => {
    for (const t of TOPICS) {
      const qi = t.questions?.findIndex(q => q.id === qId);
      if (qi >= 0) { groups.topic.push({ qId, topic: t, qIdx: qi, q: t.questions[qi] }); return; }
    }
    for (const p of PAST_PAPERS) {
      const qi = p.questions?.findIndex(q => q.id === qId);
      if (qi >= 0) { groups.paper.push({ qId, paper: p, qIdx: qi, q: p.questions[qi] }); return; }
    }
  });

  let html = '';

  if (groups.topic.length) {
    html += '<div class="progress-section-title" style="color:var(--accent);margin-bottom:12px">Topic Practice</div>';
    html += '<div class="flagged-grid">';
    groups.topic.forEach(({ qId, topic, qIdx, q }) => {
      const avg = avgScore(qId);
      const h = getHistory(qId);
      const lastTs = h[0]?.ts;
      const lastStr = lastTs ? new Date(lastTs).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'}) : 'Never';
      html += `<div class="flagged-card" data-topicid="${topic.id}" data-qidx="${qIdx}">
        <div class="flagged-card-top">
          <span class="flagged-card-title">${topic.title}</span>
          <button class="flag-remove-btn" data-qid="${qId}" title="Remove flag">✕</button>
        </div>
        <div class="flagged-card-q">Q${qIdx+1}: ${q.text.replace(/<[^>]+>/g,'').substring(0,100)}…</div>
        <div class="flagged-card-meta">
          <span>[${q.marks} marks]</span>
          <span>Last: ${lastStr}</span>
          ${avg !== null ? `<span class="${avg>=70?'good':avg>=40?'mid':'bad'}">${avg}% avg</span>` : '<span style="color:var(--text-muted)">Unscored</span>'}
        </div>
      </div>`;
    });
    html += '</div>';
  }

  if (groups.paper.length) {
    html += '<div class="progress-section-title" style="color:var(--accent2);margin:24px 0 12px">Past Papers</div>';
    html += '<div class="flagged-grid">';
    groups.paper.forEach(({ qId, paper, qIdx, q }) => {
      const avg = avgScore(qId);
      const h = getHistory(qId);
      const lastStr = h[0]?.ts ? new Date(h[0].ts).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'}) : 'Never';
      html += `<div class="flagged-card flagged-card-pp" data-paperid="${paper.id}" data-qidx="${qIdx}">
        <div class="flagged-card-top">
          <span class="flagged-card-title">${paper.title} — Q${q.num}</span>
          <button class="flag-remove-btn" data-qid="${qId}" title="Remove flag">✕</button>
        </div>
        <div class="flagged-card-q">${q.topic} [${q.marks} marks]</div>
        <div class="flagged-card-meta">
          <span>Last: ${lastStr}</span>
          ${avg !== null ? `<span class="${avg>=70?'good':avg>=40?'mid':'bad'}">${avg}% avg</span>` : '<span style="color:var(--text-muted)">Unscored</span>'}
        </div>
      </div>`;
    });
    html += '</div>';
  }

  list.innerHTML = html;

  // Click card → jump to question
  list.querySelectorAll('.flagged-card[data-topicid]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.classList.contains('flag-remove-btn')) return;
      switchView('practice');
      setTimeout(() => {
        openTopicPanel(card.dataset.topicid);
        currentQIdx = parseInt(card.dataset.qidx) || 0;
        renderCurrentQuestion();
      }, 60);
    });
  });

  list.querySelectorAll('.flagged-card[data-paperid]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.classList.contains('flag-remove-btn')) return;
      switchView('pastpapers');
      setTimeout(() => {
        openPPPanel(card.dataset.paperid);
        currentPPIdx = parseInt(card.dataset.qidx) || 0;
        renderCurrentPPQuestion();
      }, 60);
    });
  });

  // Remove flag buttons
  list.querySelectorAll('.flag-remove-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      setFlag(btn.dataset.qid, false);
      renderFlaggedView();
      renderTopicsGrid();
    });
  });
}

document.getElementById('btn-clear-flags')?.addEventListener('click', () => {
  if (!confirm('Clear all flagged questions?')) return;
  getAllFlags().forEach(qId => setFlag(qId, false));
  renderFlaggedView();
  renderTopicsGrid();
});

// ── DRAWING CANVAS ────────────────────────────────────────────
let drawCanvas = null, drawCtx = null;
let isDrawing = false, lastX = 0, lastY = 0;
let drawTool = 'pen';
let drawColor = '#e8e4d9';
let drawSize = 3;
let drawHistory = [];
const MAX_UNDO = 40;

function doUndo() {
  if (drawHistory.length && drawCtx) {
    drawCtx.putImageData(drawHistory.pop(), 0, 0);
  }
}

// Global Ctrl+Z handler
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && drawCanvas) {
    // Only undo canvas if focus is NOT in a text input/textarea
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      doUndo();
    }
  }
});

function initCanvas(canvasEl) {
  drawCanvas = canvasEl;
  drawCtx = canvasEl.getContext('2d');
  resizeCanvas();

  canvasEl.addEventListener('pointerdown', e => {
    isDrawing = true;
    const {x, y} = canvasPos(e);
    lastX = x; lastY = y;
    drawHistory.push(drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
    if (drawHistory.length > MAX_UNDO) drawHistory.shift();
    drawCtx.beginPath();
    drawCtx.arc(x, y, (drawTool === 'eraser' ? drawSize * 4 : drawSize) / 2, 0, Math.PI * 2);
    drawCtx.fillStyle = drawTool === 'eraser' ? '#0f0f13' : drawColor;
    drawCtx.fill();
    e.preventDefault();
  });

  canvasEl.addEventListener('pointermove', e => {
    if (!isDrawing) return;
    const {x, y} = canvasPos(e);
    const pressure = e.pressure > 0 ? e.pressure : 1;
    const size = drawTool === 'eraser' ? drawSize * 4 : drawSize * pressure;
    drawCtx.beginPath();
    drawCtx.moveTo(lastX, lastY);
    drawCtx.lineTo(x, y);
    drawCtx.strokeStyle = drawTool === 'eraser' ? '#0f0f13' : drawColor;
    drawCtx.lineWidth = size;
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';
    drawCtx.stroke();
    lastX = x; lastY = y;
    e.preventDefault();
  });

  canvasEl.addEventListener('pointerup',    () => { isDrawing = false; });
  canvasEl.addEventListener('pointerleave', () => { isDrawing = false; });
  canvasEl.addEventListener('pointerdown',  e => { try { canvasEl.setPointerCapture(e.pointerId); } catch {} });
}

function canvasPos(e) {
  const rect = drawCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (drawCanvas.width  / rect.width),
    y: (e.clientY - rect.top)  * (drawCanvas.height / rect.height),
  };
}

function resizeCanvas() {
  if (!drawCanvas) return;
  const saved = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
  drawCanvas.width  = drawCanvas.offsetWidth  || 800;
  drawCanvas.height = drawCanvas.offsetHeight || 400;
  drawCtx.putImageData(saved, 0, 0);
}

function buildDrawingPanel(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="draw-toolbar">
      <div class="draw-tools">
        <button class="draw-tool-btn active" id="draw-pen-${containerId}" title="Pen">✏️</button>
        <button class="draw-tool-btn" id="draw-eraser-${containerId}" title="Eraser">⬜</button>
      </div>
      <div class="draw-colors">
        ${['#e8e4d9','#c8a96e','#6e9ec8','#6ec8a0','#c86e9e','#e05555','#ffffff'].map(c =>
          `<button class="draw-color-btn" style="background:${c}" data-color="${c}"></button>`
        ).join('')}
      </div>
      <div class="draw-sizes">
        <label style="font-size:0.72rem;color:var(--text-muted)">Size</label>
        <input type="range" id="draw-size-${containerId}" min="1" max="24" value="${drawSize}" style="width:80px;accent-color:var(--accent)" />
        <span id="draw-size-val-${containerId}" style="font-size:0.72rem;color:var(--text-muted);font-family:'Space Mono',monospace;min-width:24px">${drawSize}</span>
      </div>
      <div class="draw-actions">
        <button class="btn btn-secondary draw-action-btn" id="draw-undo-${containerId}" title="Undo (Ctrl+Z)">↩ Undo</button>
        <button class="btn btn-secondary draw-action-btn" id="draw-clear-${containerId}" title="Clear">✕ Clear</button>
        <button class="btn btn-secondary draw-action-btn" id="draw-save-${containerId}" title="Save PNG">⬇ Save</button>
      </div>
    </div>
    <canvas id="draw-canvas-${containerId}" class="draw-canvas"></canvas>
    <div class="draw-resize-handle" id="draw-resize-${containerId}" title="Drag to resize">⠿</div>
  `;

  const canvas = container.querySelector(`#draw-canvas-${containerId}`);
  initCanvas(canvas);

  // ── Resize handle (drag to change height) ──
  const handle = container.querySelector(`#draw-resize-${containerId}`);
  let resizing = false, startY = 0, startH = 0;
  handle.addEventListener('pointerdown', e => {
    resizing = true;
    startY = e.clientY;
    startH = canvas.offsetHeight;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', e => {
    if (!resizing) return;
    const newH = Math.max(200, startH + (e.clientY - startY));
    canvas.style.height = newH + 'px';
    resizeCanvas();
  });
  handle.addEventListener('pointerup', () => { resizing = false; });

  // ── Tool buttons ──
  const penBtn    = container.querySelector(`#draw-pen-${containerId}`);
  const eraserBtn = container.querySelector(`#draw-eraser-${containerId}`);
  penBtn.addEventListener('click', () => {
    drawTool = 'pen'; penBtn.classList.add('active'); eraserBtn.classList.remove('active');
    canvas.style.cursor = 'crosshair';
  });
  eraserBtn.addEventListener('click', () => {
    drawTool = 'eraser'; eraserBtn.classList.add('active'); penBtn.classList.remove('active');
    canvas.style.cursor = 'cell';
  });

  // ── Colours ──
  container.querySelectorAll('.draw-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      drawColor = btn.dataset.color; drawTool = 'pen';
      penBtn.classList.add('active'); eraserBtn.classList.remove('active');
      container.querySelectorAll('.draw-color-btn').forEach(b => b.classList.remove('active-color'));
      btn.classList.add('active-color');
      canvas.style.cursor = 'crosshair';
    });
  });
  container.querySelector(`.draw-color-btn[data-color="${drawColor}"]`)?.classList.add('active-color');

  // ── Size slider ──
  const slider = container.querySelector(`#draw-size-${containerId}`);
  const sizeLabel = container.querySelector(`#draw-size-val-${containerId}`);
  slider.addEventListener('input', () => { drawSize = parseInt(slider.value); sizeLabel.textContent = drawSize; });

  // ── Undo ──
  container.querySelector(`#draw-undo-${containerId}`).addEventListener('click', doUndo);

  // ── Clear ──
  container.querySelector(`#draw-clear-${containerId}`).addEventListener('click', () => {
    if (!confirm('Clear the canvas?')) return;
    drawHistory.push(drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  });

  // ── Save PNG ──
  container.querySelector(`#draw-save-${containerId}`).addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = drawCanvas.toDataURL('image/png');
    a.download = 'maths-working.png';
    a.click();
  });

  canvas.style.cursor = 'crosshair';
}

function wireDrawToggle(toggleBtnId, containerId) {
  const btn = document.getElementById(toggleBtnId);
  const container = document.getElementById(containerId);
  if (!btn || !container) return;
  let built = false;
  btn.addEventListener('click', () => {
    const hidden = container.classList.toggle('hidden');
    btn.classList.toggle('active-draw', !hidden);
    if (!hidden && !built) { built = true; buildDrawingPanel(containerId); }
    if (!hidden) setTimeout(resizeCanvas, 50);
  });
}

wireDrawToggle('btn-draw-q',  'draw-panel-q');
wireDrawToggle('btn-draw-pp', 'draw-panel-pp');

// ── TIMER WARNING ─────────────────────────────────────────────
function showTimerWarning(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.classList.remove('hidden');
  el.textContent = '⚑ Start the timer before marking!';
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ── SETTINGS VIEW ─────────────────────────────────────────────
function renderSettingsView() {
  const s = getSettings();
  const content = document.getElementById('settings-content');
  if (!content) return;

  content.innerHTML = `
    <div class="settings-group">
      <div class="settings-group-title">Timer</div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Require timer before marking</div>
          <div class="setting-desc">You must start the timer before you can click Mark &amp; Score. Keeps you honest!</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="setting-require-timer" ${s.requireTimer ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Time buffer (seconds)</div>
          <div class="setting-desc">Extra seconds added to the suggested time per question. Currently <strong>${s.timerBuffer}s</strong>.</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <input type="range" id="setting-buffer" min="0" max="120" step="10" value="${s.timerBuffer}"
            style="width:100px;accent-color:var(--accent)" />
          <span id="setting-buffer-val" style="font-family:'Space Mono',monospace;font-size:0.8rem;color:var(--accent);min-width:32px">${s.timerBuffer}s</span>
        </div>
      </div>

      <div class="setting-row" style="padding-top:4px">
        <div class="setting-info">
          <div class="setting-label">Suggested time formula</div>
          <div class="setting-desc">~1.2 min per mark + buffer. E.g. a 5-mark question → ~${fmtSecs(suggestedSecs(5))} suggested.</div>
        </div>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">Data</div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Clear all progress data</div>
          <div class="setting-desc">Deletes all scores, history, notes and flags. Cannot be undone.</div>
        </div>
        <button class="btn btn-secondary" id="btn-clear-all-data" style="border-color:var(--accent3);color:var(--accent3)">🗑 Reset All Data</button>
      </div>
    </div>
  `;

  // Require timer toggle
  document.getElementById('setting-require-timer').addEventListener('change', e => {
    const s = getSettings(); s.requireTimer = e.target.checked; saveSettings(s);
  });

  // Buffer slider
  const bufSlider = document.getElementById('setting-buffer');
  const bufVal    = document.getElementById('setting-buffer-val');
  bufSlider.addEventListener('input', () => {
    const s = getSettings();
    s.timerBuffer = parseInt(bufSlider.value);
    saveSettings(s);
    bufVal.textContent = s.timerBuffer + 's';
    // refresh desc
    content.querySelector('.setting-desc:last-of-type') &&
      renderSettingsView(); // re-render to update example time
  });

  // Reset all data
  document.getElementById('btn-clear-all-data').addEventListener('click', () => {
    if (!confirm('Are you sure? This will delete ALL your scores, history, notes and flags permanently.')) return;
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('hist:') || k.startsWith('notes:') || k.startsWith('flag:')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    alert('All data cleared!');
    updateDashboard();
  });
}

// ── INIT ──────────────────────────────────────────────────────
switchView('home');