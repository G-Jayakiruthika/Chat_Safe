'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const I18N = window.CHATSAFE_I18N;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOOD_RGB = { idle: [34, 211, 238], safe: [52, 211, 153], suspicious: [251, 191, 36], high: [251, 146, 60], critical: [248, 113, 113] };

  /** Fallback list so the picker works even before /api/languages answers. */
  let languages = [{ code: 'en', name: 'English', native: 'English', speech: 'en-IN' }];
  let lang = 'en';
  let agentTurn = 0;
  let decoyTurn = 0;
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

  const t = (key, vars = {}) => {
    const s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  };
  const currentLang = () => languages.find((l) => l.code === lang) || languages[0];
  const store = (k, v) => { try { localStorage.setItem(`chatsafe.${k}`, v); } catch { /* storage blocked */ } };
  const load = (k) => { try { return localStorage.getItem(`chatsafe.${k}`); } catch { return null; } };

  /* ---------- Visual engines ---------- */
  const kavach = window.createKavach($('kavach'), { reducedMotion });
  const bg = window.createBackground($('bg'), { reducedMotion });
  const isDark = () => document.documentElement.dataset.theme !== 'light';

  function setMood(mood) {
    kavach.setMood(mood);
    bg.setColor(MOOD_RGB[mood] || MOOD_RGB.idle, isDark() ? 0.6 : 0.35);
  }
  function setAgentState(state) {
    kavach.setState(state);
    $('agentState').textContent = t(`state_${state}`);
  }

  /* ---------- Language ---------- */
  function applyLanguage(code) {
    lang = languages.some((l) => l.code === code) ? code : 'en';
    const info = currentLang();
    document.documentElement.lang = lang;
    // Menus are English for RTL languages, so the layout stays LTR; replies use dir="auto".
    document.documentElement.dir = I18N[lang] && info.rtl ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    const note = $('uiNote');
    note.hidden = Boolean(I18N[lang]);
    note.textContent = note.hidden ? '' : t('uiNote', { lang: `${info.native} (${info.name})` });
    $('micLabel').textContent = t(recognizer ? 'micStop' : 'micStart');
    updateThemeLabel();
    store('lang', lang);
  }

  async function loadLanguages() {
    try {
      const res = await fetch('/api/languages');
      if (res.ok) languages = (await res.json()).languages;
    } catch { /* keep English fallback */ }
    $('lang').replaceChildren(...languages.map((l) => new Option(`${l.native} — ${l.name}`, l.code)));
    const saved = load('lang');
    $('lang').value = languages.some((l) => l.code === saved) ? saved : 'en';
    applyLanguage($('lang').value);
  }

  /* ---------- Theme & text size ---------- */
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

  /* ---------- Networking ---------- */
  async function api(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  }

  /* ---------- Voice out (text-to-speech) ---------- */
  let voices = [];
  const refreshVoices = () => { voices = 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : []; };
  if ('speechSynthesis' in window) {
    refreshVoices();
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  }
  const voiceFor = (code) => {
    const tag = currentLang().speech.toLowerCase();
    return voices.find((v) => v.lang.toLowerCase() === tag) || voices.find((v) => v.lang.toLowerCase().startsWith(`${code}-`));
  };

  /**
   * Speak text with lip-sync. Resolves when finished (or immediately if no voice is available).
   * @param {string} text
   */
  function speak(text) {
    return new Promise((resolve) => {
      if (!text || !('speechSynthesis' in window)) { resolve(false); return; }
      const voice = voiceFor(lang);
      if (!voice && lang !== 'en') {
        addAgentLine('kavach', t('noVoice', { lang: currentLang().name }), 'note');
        resolve(false);
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = currentLang().speech;
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.onstart = () => setAgentState('speaking');
      u.onboundary = () => kavach.pulse();
      u.onend = u.onerror = () => { setAgentState('idle'); resolve(true); };
      window.speechSynthesis.speak(u);
    });
  }

  /* ---------- Voice in (speech-to-text) ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;

  function toggleMic() {
    if (!SR) { addAgentLine('kavach', t('noMic'), 'note'); return; }
    if (recognizer) { recognizer.stop(); return; }
    window.speechSynthesis?.cancel();
    const rec = new SR();
    recognizer = rec;
    rec.lang = currentLang().speech;
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
      if (e.error === 'language-not-supported' || e.error === 'not-allowed') addAgentLine('kavach', t('noMic'), 'note');
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
    $('agentInput').value = '';
    setAgentState('thinking');
    const typing = typingBubble();
    try {
      const r = await api('/api/agent', { text, lang, turn: agentTurn++ });
      typing.remove();
      setMood(r.mood === 'safe' && r.mode === 'chat' ? 'idle' : r.mood);
      addAgentLine('kavach', r.reply, r.mode === 'scan' ? `lvl-${r.mood}` : '');
      if (r.analysis) renderResult(r.analysis, false);
      if ($('autoSpeak').checked) await speak(r.reply);
    } catch (err) {
      typing.remove();
      addAgentLine('kavach', err.message, 'note');
    } finally {
      if (kavach && !window.speechSynthesis?.speaking) setAgentState('idle');
    }
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

  async function onAnalyze(event) {
    event.preventDefault();
    const text = $('message').value.trim();
    const status = $('xrayStatus');
    if (!text) { status.textContent = t('empty'); $('message').focus(); return; }
    $('analyzeBtn').disabled = true;
    $('scanBox').classList.add('scanning');
    setAgentState('thinking');
    status.textContent = t('checking');
    try {
      const r = await api('/api/analyze', { text, lang });
      renderResult(r);
      status.textContent = '';
      if ($('autoSpeak').checked) await speak(r.verdict);
    } catch (err) {
      status.textContent = err.message;
    } finally {
      $('analyzeBtn').disabled = false;
      $('scanBox').classList.remove('scanning');
      if (!window.speechSynthesis?.speaking) setAgentState('idle');
    }
  }

  /* ---------- Pay-Check ---------- */
  async function onPayCheck(event) {
    event.preventDefault();
    const out = $('payResult');
    const upi = $('upi').value.trim();
    if (!upi) { $('upi').focus(); return; }
    out.textContent = t('checking');
    try {
      const r = await api('/api/upi-check', { upi });
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
      if ($('autoSpeak').checked) speak(`${r.message} ${r.advice}`);
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
      const r = await api('/api/decoy', { text, lang, turn: decoyTurn++ });
      addDecoyLine('paati', r.reply);
    } catch (err) {
      addDecoyLine('paati', err.message);
    }
  }

  /* ---------- Tabs (WAI-ARIA pattern) ---------- */
  function setupTabs() {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const select = (tab) => {
      tabs.forEach((x) => {
        const on = x === tab;
        x.setAttribute('aria-selected', String(on));
        x.tabIndex = on ? 0 : -1;
        $(x.getAttribute('aria-controls')).hidden = !on;
      });
      tab.focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        const isRtl = document.documentElement.dir === 'rtl';
        const delta = { ArrowRight: isRtl ? -1 : 1, ArrowLeft: isRtl ? 1 : -1 }[e.key];
        if (delta) { e.preventDefault(); select(tabs[(i + delta + tabs.length) % tabs.length]); }
        if (e.key === 'Home') { e.preventDefault(); select(tabs[0]); }
        if (e.key === 'End') { e.preventDefault(); select(tabs[tabs.length - 1]); }
      });
    });
  }

  /* ---------- Wire up ---------- */
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
  $('xrayForm').addEventListener('submit', onAnalyze);
  $('payForm').addEventListener('submit', onPayCheck);
  $('paatiForm').addEventListener('submit', onPaati);
  $('lang').addEventListener('change', (e) => applyLanguage(e.target.value));
  $('themeToggle').addEventListener('click', toggleTheme);
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
    if (lastResult) speak([lastResult.verdict, lastResult.explanation, ...lastResult.nextSteps].filter(Boolean).join('. '));
  });
  $('copyComplaint').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('complaint').value);
      $('xrayStatus').textContent = t('copied');
    } catch {
      $('complaint').select();
    }
  });
  document.querySelectorAll('[data-sample]').forEach((b) =>
    b.addEventListener('click', () => { $('message').value = SAMPLES[b.dataset.sample]; $('message').focus(); }));

  if (load('big')) { document.body.classList.add('big'); $('bigText').setAttribute('aria-pressed', 'true'); }
  if (load('speak') === '0') $('autoSpeak').checked = false;
  kavach.setDark(isDark());
  setMood('idle');
  setupTabs();
  addAgentLine('kavach', I18N.en.agentIntro);
  loadLanguages().then(() => {
    $('agentLog').replaceChildren();
    addAgentLine('kavach', t('agentIntro'));
  });
})();
