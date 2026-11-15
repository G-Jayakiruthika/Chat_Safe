'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const I18N = window.CHATSAFE_I18N;
  const API = window.ChatSafeAPI;
  const Sound = window.ChatSafeSound;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOOD_RGB = window.KAVACH_MOOD_COLORS;
  const CATEGORIES = ['investment', 'digital_arrest', 'kyc_otp', 'courier', 'task_job', 'reward_bill', 'family_voice', 'sextortion_loan'];

  let languages = [{ code: 'en', name: 'English', native: 'English', speech: 'en-IN' }];
  let lang = 'en'; // chosen language; 'auto' = detect from each message
  let replyLang = 'en'; // language Kavach actually answered in
  let agentTurn = 0;
  let decoyTurn = 0;
  let tipTurn = 1;
  let lastResult = null;

  const SAMPLES = {
    stock:
      'Welcome to SEBI VIP Stock Tips group! Our institutional account gives guaranteed returns of 8% daily. ' +
      'Only 5 seats left today — deposit ₹25,000 to rajesh.trader@ybl immediately to unlock IPO allotment. Join https://t.me/vipprofitclub',
    arrest:
      'This is Inspector Sharma from CBI Mumbai. A FedEx parcel in your name has drugs and 5 passports. ' +
      'An arrest warrant is issued. Stay on this video call, do not tell anyone in your family. ' +
      'Transfer ₹1,50,000 to RBI verification account 501002345678 IFSC HDFC0001234 within 30 minutes or you go to jail.',
    task: 'Hi! Part time job from home. Like YouTube videos and earn ₹3000 daily. First do prepaid task of ₹500 to start. Contact 98765 43210 on WhatsApp.',
    safe: 'Hi Amma, reached Chennai safely. Will call you after dinner. Please take your BP tablet on time.',
  };

  const uiLang = () => (lang === 'auto' ? 'en' : lang);
  const t = (key, vars = {}) => {
    const s = (I18N[uiLang()] && I18N[uiLang()][key]) || I18N.en[key] || key;
    return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  };
  const langInfo = (code) => languages.find((l) => l.code === code) || languages[0];
  const store = (k, v) => { try { localStorage.setItem(`chatsafe.${k}`, v); } catch { /* storage blocked */ } };
  const load = (k) => { try { return localStorage.getItem(`chatsafe.${k}`); } catch { return null; } };

  /* ---------- Visual engines ---------- */
  const kavach = window.createKavach($('kavach'), { reducedMotion, onPoke: () => { Sound.play('blip'); sayTip(); } });
  const bg = window.createBackground($('bg'), { reducedMotion });
  const caseStore = window.createHistory();
  const isDark = () => document.documentElement.dataset.theme !== 'light';

  function setMood(mood) {
    kavach.setMood(mood);
    bg.setColor(MOOD_RGB[mood] || MOOD_RGB.idle, isDark() ? 0.6 : 0.35);
  }
  function setAgentState(state) {
    kavach.setState(state);
    $('agentState').textContent = t(`state_${state}`);
  }
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  /* ---------- Language ---------- */
  function applyLanguage(code) {
    lang = code === 'auto' || languages.some((l) => l.code === code) ? code : 'en';
    const info = langInfo(uiLang());
    document.documentElement.lang = uiLang();
    document.documentElement.dir = I18N[uiLang()] && info.rtl ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    const notes = [];
    if (lang !== 'auto' && !I18N[lang]) notes.push(t('uiNote', { lang: `${info.native} (${info.name})` }));
    if (API.mode() === 'local') notes.push(t('offlineMode'));
    $('uiNote').hidden = notes.length === 0;
    $('uiNote').textContent = notes.join(' ');
    $('micLabel').textContent = t(recognizer ? 'micStop' : 'micStart');
    updateThemeLabel();
    renderHud();
    renderCases();
    store('lang', lang);
  }

  async function loadLanguages() {
    try {
      languages = (await API.call('languages')).languages;
    } catch { /* keep English fallback */ }
    const opts = [new Option(t('autoDetect'), 'auto'), ...languages.map((l) => new Option(`${l.native} — ${l.name}`, l.code))];
    $('lang').replaceChildren(...opts);
    const saved = load('lang');
    $('lang').value = saved === 'auto' || languages.some((l) => l.code === saved) ? saved : 'en';
    applyLanguage($('lang').value);
  }

  /* ---------- Theme ---------- */
  function updateThemeLabel() {
    $('themeToggle').setAttribute('aria-label', t(isDark() ? 'themeLight' : 'themeDark'));
  }
  function toggleTheme() {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store('theme', next);
    kavach.setDark(next === 'dark');
    setMood(kavach.mood);
    updateThemeLabel();
  }

  /* ---------- Voice out ---------- */
  let voices = [];
  const refreshVoices = () => { voices = 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : []; };
  if ('speechSynthesis' in window) {
    refreshVoices();
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  }
  const voiceFor = (code) => {
    const tag = langInfo(code).speech.toLowerCase();
    return voices.find((v) => v.lang.toLowerCase() === tag) || voices.find((v) => v.lang.toLowerCase().startsWith(`${code}-`));
  };

  /** Speak with lip-sync; resolves when done. */
  function speak(text, code = replyLang) {
    return new Promise((resolve) => {
      if (!text || !('speechSynthesis' in window)) { resolve(false); return; }
      const voice = voiceFor(code);
      if (!voice && code !== 'en') {
        toast(t('noVoice', { lang: langInfo(code).name }));
        resolve(false);
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = langInfo(code).speech;
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.onstart = () => setAgentState('speaking');
      u.onboundary = () => kavach.pulse();
      u.onend = u.onerror = () => { setAgentState('idle'); resolve(true); };
      window.speechSynthesis.speak(u);
    });
  }

  /* ---------- Voice in ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;

  function toggleMic() {
    if (!SR) { toast(t('noMic')); return; }
    if (recognizer) { recognizer.stop(); return; }
    window.speechSynthesis?.cancel();
    Sound.play('blip');
    const rec = new SR();
    recognizer = rec;
    rec.lang = langInfo(uiLang()).speech;
    rec.interimResults = true;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      $('agentInput').value = (finalText + interim).trim();
    };
    rec.onerror = (e) => {
      if (e.error === 'language-not-supported' || e.error === 'not-allowed') toast(t('noMic'));
    };
    rec.onend = () => {
      recognizer = null;
      $('mic').setAttribute('aria-pressed', 'false');
      $('micLabel').textContent = t('micStart');
      setAgentState('idle');
      if (finalText.trim()) askAgent(finalText.trim());
    };
    $('mic').setAttribute('aria-pressed', 'true');
    $('micLabel').textContent = t('micStop');
    setAgentState('listening');
    rec.start();
  }

  /* ---------- Agent conversation ---------- */
  function addAgentLine(who, text, extraClass = '') {
    const li = document.createElement('li');
    li.className = `${who} ${extraClass}`.trim();
    li.dir = 'auto';
    const label = document.createElement('span');
    label.className = 'who';
    label.textContent = t(who);
    li.append(label, text);
    $('agentLog').append(li);
    $('agentLog').scrollTop = $('agentLog').scrollHeight;
    return li;
  }

  function typingBubble() {
    const li = document.createElement('li');
    li.className = 'kavach typing';
    li.setAttribute('aria-label', t('state_thinking'));
    li.append(...[0, 1, 2].map(() => document.createElement('span')));
    $('agentLog').append(li);
    $('agentLog').scrollTop = $('agentLog').scrollHeight;
    return li;
  }

  async function askAgent(text) {
    addAgentLine('you', text);
    caseStore.add('you', text, 'idle', lang);
    renderCases();
    $('agentInput').value = '';
    Sound.play('send');
    setAgentState('thinking');
    const typing = typingBubble();
    try {
      const r = await API.call('agent', { text, lang, turn: agentTurn++ });
      typing.remove();
      replyLang = r.lang || uiLang();
      const mood = r.mode === 'chat' ? 'idle' : r.mood;
      setMood(mood);
      Sound.play(r.mode === 'scan' ? (r.mood === 'high' || r.mood === 'critical' ? 'alert' : 'safe') : 'blip');
      addAgentLine('kavach', r.reply, r.mode === 'scan' ? `lvl-${r.mood}` : '');
      caseStore.add('kavach', r.reply, r.mode === 'scan' ? r.mood : 'idle', replyLang);
      renderCases();
      if (r.analysis) {
        learn(r.analysis.categoryIds);
        renderResult(r.analysis, false);
      }
      if ($('autoSpeak').checked) await speak(r.reply, replyLang);
    } catch (err) {
      typing.remove();
      addAgentLine('kavach', err.message, 'note');
    } finally {
      if (!window.speechSynthesis?.speaking) setAgentState('idle');
    }
  }

  function sayTip() {
    API.call('agent', { text: 'Give me one short cyber-safety tip', lang: uiLang(), turn: tipTurn++ })
      .then((r) => {
        addAgentLine('kavach', r.reply);
        if ($('autoSpeak').checked) speak(r.reply, r.lang);
      })
      .catch(() => {});
  }

  function newChat() {
    caseStore.startNew();
    $('agentLog').replaceChildren();
    addAgentLine('kavach', t('agentIntro'));
    setMood('idle');
    renderCases();
  }

  /* ---------- "Scam types learned" HUD ---------- */
  const learnedSet = new Set((load('learned') || '').split(',').filter((x) => CATEGORIES.includes(x)));

  function renderHud() {
    $('hudCount').textContent = `${learnedSet.size}/${CATEGORIES.length}`;
    $('hudList').replaceChildren(...CATEGORIES.map((id) => {
      const li = document.createElement('li');
      li.className = learnedSet.has(id) ? 'on' : '';
      li.textContent = t(`cat_${id}`);
      return li;
    }));
  }

  function learn(ids = []) {
    for (const id of ids) {
      if (!CATEGORIES.includes(id) || learnedSet.has(id)) continue;
      learnedSet.add(id);
      Sound.play('unlock');
      toast(t('unlocked', { name: t(`cat_${id}`) }));
    }
    store('learned', [...learnedSet].join(','));
    renderHud();
  }

  /* ---------- Case files (saved chats) ---------- */
  function highlighted(text, match) {
    const frag = document.createDocumentFragment();
    if (!match) { frag.append(text); return frag; }
    const mark = document.createElement('mark');
    mark.textContent = text.slice(match[0], match[1]);
    frag.append(text.slice(0, match[0]), mark, text.slice(match[1]));
    return frag;
  }

  function renderCases() {
    const q = $('caseSearch').value;
    const results = caseStore.search(q);
    $('caseCount').textContent = results.length ? t('results', { n: results.length }) : q.trim() ? t('noMatch', { q }) : t('noCases');
    const items = [];
    let lastGroup = '';
    for (const { case: c, snippet, match } of results) {
      const group = window.dayLabel(c.updated);
      if (group !== lastGroup) {
        const h = document.createElement('li');
        h.className = 'group';
        h.textContent = group;
        items.push(h);
        lastGroup = group;
      }
      const li = document.createElement('li');
      li.className = `case${c.id === caseStore.currentId ? ' current' : ''}`;
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'case-open';
      const dot = document.createElement('span');
      dot.className = `dot lvl-${c.mood}`;
      dot.setAttribute('aria-hidden', 'true');
      const title = document.createElement('strong');
      title.dir = 'auto';
      title.textContent = c.title;
      const time = document.createElement('time');
      time.dateTime = new Date(c.updated).toISOString();
      time.textContent = new Date(c.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const snip = document.createElement('span');
      snip.className = 'snippet';
      snip.dir = 'auto';
      snip.append(highlighted(snippet, match));
      open.append(dot, title, time, snip);
      open.addEventListener('click', () => openCase(c.id));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'case-del';
      del.setAttribute('aria-label', `Delete chat: ${c.title}`);
      del.textContent = '✕';
      del.addEventListener('click', () => { caseStore.remove(c.id); renderCases(); });
      li.append(open, del);
      items.push(li);
    }
    $('caseList').replaceChildren(...items);
    renderStrip();
  }

  /** A short, tappable row of recent chats under the conversation (Yaas-style picker). */
  function renderStrip() {
    const recent = caseStore.search('').slice(0, 8);
    const strip = $('caseStrip');
    strip.hidden = recent.length === 0;
    strip.replaceChildren(...recent.map(({ case: c }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'case-chip';
      if (c.id === caseStore.currentId) b.setAttribute('aria-current', 'true');
      const dot = document.createElement('span');
      dot.className = `dot lvl-${c.mood}`;
      dot.setAttribute('aria-hidden', 'true');
      const t = document.createElement('span');
      t.className = 't';
      t.dir = 'auto';
      t.textContent = c.title;
      const d = document.createElement('span');
      d.className = 'd';
      d.textContent = window.dayLabel(c.updated);
      b.append(t, d);
      b.prepend(dot);
      b.addEventListener('click', () => openCase(c.id));
      return b;
    }));
  }

  function openCase(id) {
    const c = caseStore.open(id);
    if (!c) return;
    $('agentLog').replaceChildren();
    for (const m of c.messages) addAgentLine(m.who, m.text, m.who === 'kavach' && m.mood !== 'idle' ? `lvl-${m.mood}` : '');
    setMood(c.mood);
    renderCases();
    toggleCases(false);
    closeSearch();
  }

  function toggleCases(force) {
    const drawer = $('cases');
    const open = force ?? drawer.hidden;
    drawer.hidden = !open;
    $('historyBtn').setAttribute('aria-expanded', String(open));
    if (open) {
      renderCases();
      $('caseSearch').focus();
    }
  }

  function openSearch() {
    $('searchBar').hidden = false;
    document.body.classList.add('searching');
    $('caseSearch').focus();
    $('caseSearch').select();
  }

  function closeSearch() {
    $('searchBar').hidden = true;
    document.body.classList.remove('searching');
  }

  function exportCases() {
    const blob = new Blob([caseStore.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chat_safe-cases-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- Scam X-Ray ---------- */
  function fillList(ul, items) {
    ul.replaceChildren(...items.map((text, i) => {
      const li = document.createElement('li');
      li.textContent = text;
      li.style.animationDelay = `${i * 80}ms`;
      return li;
    }));
  }

  function animateScore(to) {
    const el = $('scoreText');
    const gauge = $('gauge');
    if (reducedMotion) { el.textContent = String(to); gauge.style.setProperty('--pct', String(to)); return; }
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / 900);
      const v = Math.round(to * (1 - (1 - k) ** 3));
      el.textContent = String(v);
      gauge.style.setProperty('--pct', String(v));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderResult(r, focus = true) {
    lastResult = r;
    const gauge = $('gauge');
    gauge.className = `gauge lvl-${r.level}`;
    gauge.setAttribute('aria-valuenow', String(r.score));
    gauge.setAttribute('aria-valuetext', `${t('score')} ${r.score} / 100 — ${t(`level_${r.level}`)}`);
    animateScore(r.score);
    $('levelText').textContent = t(`level_${r.level}`);
    $('levelText').className = `level lvl-${r.level}`;
    $('verdict').textContent = r.verdict;
    $('scamType').textContent = r.scamType;
    $('explanation').textContent = r.explanation;
    fillList($('redFlags'), r.redFlags.length ? r.redFlags : ['—']);
    fillList($('nextSteps'), r.nextSteps);
    $('upiList').replaceChildren(...r.upiChecks.map((u) => {
      const li = document.createElement('li');
      li.className = u.verdict === 'validated-format' ? 'good' : 'bad';
      const strong = document.createElement('strong');
      strong.textContent = u.input;
      li.append(strong, document.createElement('br'), `${u.message} ${u.advice}`);
      return li;
    }));
    $('upiBlock').hidden = r.upiChecks.length === 0;
    $('complaintBlock').hidden = !r.complaint;
    $('complaint').value = r.complaint;
    const alertText = `⚠ Chat_Safe: ${r.verdict} (${r.score}/100, ${r.scamType}). Please call me before sending any money.`;
    $('familyAlert').href = `https://wa.me/?text=${encodeURIComponent(alertText)}`;
    $('engine').textContent = `Engine: ${r.engine}${r.aiError ? ` · ${r.aiError}` : ''}${r.cached ? ' · cached' : ''}`;
    const card = $('result');
    card.className = `result lvl-${r.level}`;
    card.hidden = false;
    setMood(r.level);
    if (focus) $('verdict').focus();
  }

  async function analyzeText(text) {
    const status = $('xrayStatus');
    $('analyzeBtn').disabled = true;
    $('scanBox').classList.add('scanning');
    setAgentState('thinking');
    Sound.play('scan');
    status.textContent = t('checking');
    try {
      const r = await API.call('analyze', { text, lang });
      renderResult(r);
      learn(r.categoryIds);
      Sound.play(r.level === 'high' || r.level === 'critical' ? 'alert' : 'safe');
      status.textContent = '';
      if ($('autoSpeak').checked) await speak(r.verdict, r.lang);
    } catch (err) {
      status.textContent = err.message;
    } finally {
      $('analyzeBtn').disabled = false;
      $('scanBox').classList.remove('scanning');
      if (!window.speechSynthesis?.speaking) setAgentState('idle');
    }
  }

  /* ---------- Pay-Check ---------- */
  async function payCheck(upi) {
    const out = $('payResult');
    out.textContent = t('checking');
    try {
      const r = await API.call('upi-check', { upi });
      const good = r.verdict === 'validated-format';
      const box = document.createElement('div');
      box.className = `result lvl-${good ? 'safe' : 'critical'}`;
      const h = document.createElement('h3');
      h.textContent = `${good ? '✅' : '❌'} ${r.message}`;
      const p = document.createElement('p');
      p.textContent = r.advice;
      const a = document.createElement('a');
      Object.assign(a, { href: r.sebiCheckUrl, target: '_blank', rel: 'noopener noreferrer', className: 'button secondary', textContent: 'SEBI Check ↗' });
      box.append(h, p, a);
      out.replaceChildren(box);
      setMood(good ? 'safe' : 'critical');
      Sound.play(good ? 'safe' : 'alert');
      if ($('autoSpeak').checked) speak(`${r.message} ${r.advice}`, 'en');
    } catch (err) {
      out.textContent = err.message;
    }
  }

  /* ---------- Paati decoy ---------- */
  function addDecoyLine(who, text) {
    const li = document.createElement('li');
    li.className = who;
    li.dir = 'auto';
    const label = document.createElement('span');
    label.className = 'who';
    label.textContent = t(who);
    li.append(label, text);
    $('chatLog').append(li);
  }

  async function onPaati(event) {
    event.preventDefault();
    const input = $('scammerMsg');
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    addDecoyLine('them', text);
    input.value = '';
    try {
      const r = await API.call('decoy', { text, lang, turn: decoyTurn++ });
      addDecoyLine('paati', r.reply);
    } catch (err) {
      addDecoyLine('paati', err.message);
    }
  }

  /* ---------- Tabs ---------- */
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  function selectTab(tab, focus = true) {
    tabs.forEach((x) => {
      const on = x === tab;
      x.setAttribute('aria-selected', String(on));
      x.tabIndex = on ? 0 : -1;
      $(x.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (e) => {
      const delta = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (delta) { e.preventDefault(); selectTab(tabs[(i + delta + tabs.length) % tabs.length]); }
      if (e.key === 'Home') { e.preventDefault(); selectTab(tabs[0]); }
      if (e.key === 'End') { e.preventDefault(); selectTab(tabs[tabs.length - 1]); }
    });
  });

  /* ---------- Keyboard shortcuts ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.speechSynthesis?.cancel();
      if (!$('searchBar').hidden) { closeSearch(); return; }
      if (!$('cases').hidden) { toggleCases(false); $('historyBtn').focus(); }
      return;
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || e.ctrlKey || e.metaKey || e.altKey;
    if (typing || $('helpDialog').open) return;
    const actions = {
      m: toggleMic,
      '/': () => $('agentInput').focus(),
      s: sayTip,
      h: () => toggleCases(),
      f: openSearch,
      n: newChat,
      t: toggleTheme,
      d: () => window.ChatSafeDemo?.start(),
      '?': () => $('helpDialog').showModal(),
    };
    const fn = actions[e.key.toLowerCase()];
    if (fn) { e.preventDefault(); fn(); }
  });

  /* ---------- Wire up ---------- */
  $('resetView').addEventListener('click', () => { kavach.resetView(); Sound.play('blip'); });
  $('mic').addEventListener('click', toggleMic);
  $('agentForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('agentInput').value.trim();
    if (text) askAgent(text);
    else $('agentInput').focus();
  });
  $('agentInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('agentForm').requestSubmit(); }
  });
  document.querySelectorAll('[data-ask]').forEach((b) => b.addEventListener('click', () => askAgent(t(b.dataset.ask))));
  $('xrayForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('message').value.trim();
    if (text) analyzeText(text);
    else { $('xrayStatus').textContent = t('empty'); $('message').focus(); }
  });
  $('payForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const upi = $('upi').value.trim();
    if (upi) payCheck(upi);
    else $('upi').focus();
  });
  $('paatiForm').addEventListener('submit', onPaati);
  $('lang').addEventListener('change', (e) => applyLanguage(e.target.value));
  $('themeToggle').addEventListener('click', toggleTheme);
  $('newChat').addEventListener('click', newChat);
  $('demoBtn').addEventListener('click', () => window.ChatSafeDemo?.start());
  $('helpBtn').addEventListener('click', () => $('helpDialog').showModal());
  $('historyBtn').addEventListener('click', () => toggleCases());
  $('closeCases').addEventListener('click', () => { toggleCases(false); $('historyBtn').focus(); });
  $('caseSearch').addEventListener('input', renderCases);
  $('searchForm').addEventListener('submit', (e) => { e.preventDefault(); toggleCases(true); });
  $('openSearch').addEventListener('click', openSearch);
  $('closeSearch').addEventListener('click', () => { closeSearch(); $('openSearch').focus(); });
  $('exportCases').addEventListener('click', exportCases);
  $('clearCases').addEventListener('click', () => {
    if (window.confirm(t('confirmClear'))) { caseStore.clear(); newChat(); }
  });
  $('soundBtn').addEventListener('click', (e) => {
    const muted = Sound.toggle();
    e.currentTarget.textContent = muted ? '🔇' : '🔊';
    e.currentTarget.setAttribute('aria-pressed', String(muted));
    e.currentTarget.setAttribute('aria-label', muted ? 'Unmute sounds' : 'Mute sounds');
  });
  $('bigText').addEventListener('click', (e) => {
    const on = document.body.classList.toggle('big');
    e.currentTarget.setAttribute('aria-pressed', String(on));
    store('big', on ? '1' : '');
  });
  $('autoSpeak').addEventListener('change', (e) => {
    store('speak', e.target.checked ? '1' : '0');
    if (!e.target.checked) window.speechSynthesis?.cancel();
  });
  $('readAloud').addEventListener('click', () => {
    if (lastResult) speak([lastResult.verdict, lastResult.explanation, ...lastResult.nextSteps].filter(Boolean).join('. '), lastResult.lang);
  });
  $('copyComplaint').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('complaint').value);
      toast(t('copied'));
    } catch {
      $('complaint').select();
    }
  });
  document.querySelectorAll('[data-sample]').forEach((b) =>
    b.addEventListener('click', () => { $('message').value = SAMPLES[b.dataset.sample]; $('message').focus(); }));

  if (load('big')) { document.body.classList.add('big'); $('bigText').setAttribute('aria-pressed', 'true'); }
  if (load('speak') === '0') $('autoSpeak').checked = false;
  if (Sound.muted) { $('soundBtn').textContent = '🔇'; $('soundBtn').setAttribute('aria-pressed', 'true'); }
  kavach.setDark(isDark());
  setMood('idle');
  renderHud();

  // Small surface for the guided demo (demo.js).
  window.ChatSafeApp = {
    askAgent,
    analyzeText,
    payCheck,
    newChat,
    selectTab: (id) => selectTab($(id), false),
    setLanguage: (code) => { $('lang').value = code; applyLanguage(code); },
    openCases: () => toggleCases(true),
    closeCases: () => toggleCases(false),
    searchCases: (q) => { $('caseSearch').value = q; renderCases(); },
    setSample: (key) => { $('message').value = SAMPLES[key]; },
    setAutoSpeak: (on) => { $('autoSpeak').checked = on; },
    get autoSpeak() { return $('autoSpeak').checked; },
    get lang() { return lang; },
  };

  API.detect().finally(() => {
    loadLanguages().then(() => {
      $('agentLog').replaceChildren();
      addAgentLine('kavach', t('agentIntro'));
      // Android share sheet: Share → Chat_Safe from WhatsApp, SMS, Telegram…
      const params = new URLSearchParams(location.search);
      const shared = [params.get('title'), params.get('text'), params.get('url')].filter(Boolean).join(' ').trim();
      if (shared) {
        window.history.replaceState(null, '', location.pathname);
        askAgent(shared.slice(0, 4000));
      }
      if (params.get('demo') === '1') window.ChatSafeDemo?.start();
    });
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
