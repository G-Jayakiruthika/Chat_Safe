'use strict';

(() => {
  const $ = (id) => document.getElementById(id);

  /** UI strings. Keys match data-i18n attributes. */
  const I18N = {
    en: {},
    ta: {
      skip: 'முக்கிய பகுதிக்குச் செல்', tagline: 'ஒவ்வொரு இந்தியருக்கும் மோசடி எக்ஸ்-ரே — உங்கள் மொழியில்',
      bigText: 'A+ பெரிய எழுத்து', contrast: 'அதிக வேறுபாடு',
      tabXray: '🔍 செய்தியைச் சரிபார்', tabPay: '✅ பணம் அனுப்பும் முன் சரிபார்', tabPaati: '👵 பாட்டி டிகாய்',
      msgLabel: 'WhatsApp / SMS / Telegram செய்தியை அல்லது அழைத்தவர் சொன்னதை ஒட்டவும்',
      msgHelp: 'தமிழ், English, हिन्दी, Tanglish எல்லாம் வேலை செய்யும். எதுவும் சேமிக்கப்படாது.',
      tryExample: 'உதாரணம்:', sStock: 'பங்கு டிப்ஸ் குழு', sArrest: 'டிஜிட்டல் கைது', sTask: 'பகுதி நேர வேலை', sSafe: 'சாதாரண செய்தி',
      analyze: 'மோசடியா என்று சரிபார்', speak: '🎤 பேசுங்கள்', readAloud: '🔊 சத்தமாகப் படி',
      redFlags: 'கண்டறிந்த எச்சரிக்கை அறிகுறிகள்', doNow: 'இப்போது என்ன செய்ய வேண்டும்',
      upiFound: 'இந்த செய்தியில் உள்ள பண ஐடிகள்', complaint: 'தயார் 1930 புகார்', copy: 'நகலெடு',
      family: '👨‍👩‍👧 குடும்பத்துக்கு WhatsApp எச்சரிக்கை', fileOnline: 'cybercrime.gov.in-ல் புகார்', call1930: '📞 1930 அழை',
      payIntro: 'பங்கு டிப்ஸ், IPO, "டிரேடிங் அக்கவுண்ட்"க்கு பணம் கேட்கிறார்களா? 1 அக் 2025 முதல் SEBI பதிவு பெற்றவர்கள் "@valid" UPI ஐடி மூலம் மட்டுமே பணம் பெற முடியும்.',
      upiLabel: 'பணம் அனுப்பச் சொன்ன UPI ஐடி', checkUpi: 'UPI ஐடியைச் சரிபார்',
      paatiIntro: 'கமலா பாட்டியை சந்தியுங்கள் — மோசடிக்காரர்களின் நேரத்தை வீணடிக்கும் AI பாட்டி. அவர் எந்த உண்மை விவரத்தையும் சொல்ல மாட்டார்.',
      scammerLabel: 'மோசடிக்காரரின் சமீபத்திய செய்தி', paatiReply: 'பாட்டியின் பதில்',
      footer: 'CALLSAFE வழிகாட்டல் மட்டுமே. அவசரத்தில் 1930 (சைபர் மோசடி) அல்லது 112-ஐ அழையுங்கள்.',
      checking: 'சரிபார்க்கிறது…', empty: 'முதலில் ஒரு செய்தியை ஒட்டவும்.', copied: 'நகலெடுக்கப்பட்டது ✔',
      listening: 'கேட்கிறது… பேசுங்கள்', score: 'ஆபத்து மதிப்பெண்',
      level_safe: 'பாதுகாப்பு', level_suspicious: 'சந்தேகம்', level_high: 'அதிக ஆபத்து', level_critical: 'மிக ஆபத்து',
      them: 'மோசடிக்காரர்', paati: 'பாட்டி',
    },
    hi: {
      skip: 'मुख्य भाग पर जाएं', tagline: 'हर भारतीय के लिए स्कैम एक्स-रे — आपकी भाषा में',
      bigText: 'A+ बड़े अक्षर', contrast: 'हाई कॉन्ट्रास्ट',
      tabXray: '🔍 संदेश जांचें', tabPay: '✅ पैसे भेजने से पहले जांचें', tabPaati: '👵 दादी डिकॉय',
      msgLabel: 'WhatsApp / SMS / Telegram संदेश या कॉल करने वाले की बात यहाँ डालें',
      msgHelp: 'हिन्दी, English, தமிழ், Hinglish सब चलेगा। कुछ भी सेव नहीं होता।',
      tryExample: 'उदाहरण:', sStock: 'स्टॉक टिप ग्रुप', sArrest: 'डिजिटल अरेस्ट', sTask: 'पार्ट-टाइम जॉब', sSafe: 'सामान्य संदेश',
      analyze: 'स्कैम जांचें', speak: '🎤 बोलकर बताएं', readAloud: '🔊 पढ़कर सुनाएं',
      redFlags: 'मिले चेतावनी संकेत', doNow: 'अभी क्या करें',
      upiFound: 'इस संदेश में पेमेंट आईडी', complaint: 'तैयार 1930 शिकायत', copy: 'कॉपी करें',
      family: '👨‍👩‍👧 परिवार को WhatsApp अलर्ट', fileOnline: 'cybercrime.gov.in पर शिकायत', call1930: '📞 1930 पर कॉल',
      payIntro: 'स्टॉक टिप, IPO या "ट्रेडिंग अकाउंट" के लिए पैसे मांगे जा रहे हैं? 1 अक्टूबर 2025 से SEBI-पंजीकृत ब्रोकर सिर्फ "@valid" UPI आईडी से पैसे ले सकते हैं।',
      upiLabel: 'जिस UPI आईडी पर पैसे भेजने को कहा गया', checkUpi: 'UPI आईडी जांचें',
      paatiIntro: 'मिलिए कमला दादी से — एक AI दादी जो ठगों का समय बर्बाद करती है। वह कभी कोई असली जानकारी नहीं देती।',
      scammerLabel: 'ठग का ताज़ा संदेश', paatiReply: 'दादी का जवाब',
      footer: 'CALLSAFE केवल मार्गदर्शन है। आपात स्थिति में 1930 (साइबर फ्रॉड) या 112 पर कॉल करें।',
      checking: 'जांच हो रही है…', empty: 'पहले कोई संदेश डालें।', copied: 'कॉपी हो गया ✔',
      listening: 'सुन रहा है… बोलिए', score: 'जोखिम स्कोर',
      level_safe: 'सुरक्षित', level_suspicious: 'संदिग्ध', level_high: 'उच्च जोखिम', level_critical: 'गंभीर खतरा',
      them: 'ठग', paati: 'दादी',
    },
  };
  const EN_DEFAULTS = {
    checking: 'Checking…', empty: 'Please paste a message first.', copied: 'Copied ✔', listening: 'Listening… speak now',
    score: 'Risk score', level_safe: 'Safe', level_suspicious: 'Suspicious', level_high: 'High risk', level_critical: 'Critical',
    them: 'Scammer', paati: 'Paati',
  };
  const SPEECH_LANG = { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN' };

  const SAMPLES = {
    stock:
      'Welcome to SEBI VIP Stock Tips group! Our institutional account gives guaranteed returns of 8% daily. ' +
      'Only 5 seats left today — deposit ₹25,000 to rajesh.trader@ybl immediately to unlock IPO allotment. Join https://t.me/vipprofitclub',
    arrest:
      'This is Inspector Sharma from CBI Mumbai. A FedEx parcel in your name has drugs and 5 passports. ' +
      'An arrest warrant is issued. Stay on this video call, do not tell anyone in your family. ' +
      'Transfer ₹1,50,000 to RBI verification account 501002345678 IFSC HDFC0001234 within 30 minutes or you go to jail.',
    task:
      'Hi! Part time job from home. Like YouTube videos and earn ₹3000 daily. First do prepaid task of ₹500 to start. Contact 98765 43210 on WhatsApp.',
    safe: 'Hi Amma, reached Chennai safely. Will call you after dinner. Please take your BP tablet on time.',
  };

  let lang = 'en';
  let lastResult = null;
  let decoyTurn = 0;
  const t = (key) => I18N[lang][key] || EN_DEFAULTS[key] || key;

  /* ---------- i18n & settings ---------- */
  const originals = new Map();
  document.querySelectorAll('[data-i18n]').forEach((el) => originals.set(el, el.textContent));

  function applyLanguage(next) {
    lang = I18N[next] ? next : 'en';
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = I18N[lang][el.dataset.i18n] || originals.get(el);
    });
    try { localStorage.setItem('callsafe.lang', lang); } catch { /* storage may be blocked */ }
  }

  function toggleSetting(btn, cls) {
    const on = document.body.classList.toggle(cls);
    btn.setAttribute('aria-pressed', String(on));
    try { localStorage.setItem(`callsafe.${cls}`, on ? '1' : ''); } catch { /* ignore */ }
  }

  /* ---------- networking ---------- */
  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  }

  const setStatus = (el, msg) => { el.textContent = msg; };

  function fillList(ul, items) {
    ul.replaceChildren(...items.map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }));
  }

  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = SPEECH_LANG[lang];
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }

  /* ---------- Scam X-Ray ---------- */
  function renderResult(r) {
    lastResult = r;
    const gauge = $('gauge');
    gauge.className = `gauge lvl-${r.level}`;
    gauge.style.setProperty('--pct', String(r.score));
    gauge.setAttribute('aria-valuenow', String(r.score));
    gauge.setAttribute('aria-valuetext', `${t('score')} ${r.score} / 100 — ${t(`level_${r.level}`)}`);
    $('scoreText').textContent = String(r.score);
    $('levelText').textContent = t(`level_${r.level}`);
    $('levelText').className = `level lvl-${r.level}`;
    $('verdict').textContent = r.verdict;
    $('scamType').textContent = r.scamType;
    $('explanation').textContent = r.explanation;
    fillList($('redFlags'), r.redFlags.length ? r.redFlags : ['—']);
    fillList($('nextSteps'), r.nextSteps);

    const upiList = $('upiList');
    upiList.replaceChildren(...r.upiChecks.map((u) => {
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
    const alertText = `⚠ CALLSAFE: ${r.verdict} (${r.score}/100, ${r.scamType}). Please call me before sending any money.`;
    $('familyAlert').href = `https://wa.me/?text=${encodeURIComponent(alertText)}`;

    $('engine').textContent = `Engine: ${r.engine}${r.aiError ? ` · ${r.aiError}` : ''}${r.cached ? ' · cached' : ''}`;
    $('result').hidden = false;
    $('verdict').focus();
  }

  async function onAnalyze(event) {
    event.preventDefault();
    const text = $('message').value.trim();
    const status = $('xrayStatus');
    if (!text) { setStatus(status, t('empty')); $('message').focus(); return; }
    const btn = $('analyzeBtn');
    btn.disabled = true;
    setStatus(status, t('checking'));
    try {
      renderResult(await api('/api/analyze', { text, lang }));
      setStatus(status, '');
    } catch (err) {
      setStatus(status, err.message);
    } finally {
      btn.disabled = false;
    }
  }

  function setupMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const btn = $('micBtn');
    btn.hidden = false;
    let rec = null;
    btn.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = SPEECH_LANG[lang];
      rec.interimResults = false;
      rec.onresult = (e) => {
        const said = Array.from(e.results).map((x) => x[0].transcript).join(' ');
        $('message').value = `${$('message').value} ${said}`.trim();
      };
      rec.onend = () => { rec = null; btn.setAttribute('aria-pressed', 'false'); setStatus($('xrayStatus'), ''); };
      btn.setAttribute('aria-pressed', 'true');
      setStatus($('xrayStatus'), t('listening'));
      rec.start();
    });
  }

  /* ---------- Pay-Check ---------- */
  async function onPayCheck(event) {
    event.preventDefault();
    const out = $('payResult');
    const upi = $('upi').value.trim();
    if (!upi) { $('upi').focus(); return; }
    setStatus(out, t('checking'));
    try {
      const r = await api('/api/upi-check', { upi });
      const box = document.createElement('div');
      box.className = `result lvl-${r.verdict === 'validated-format' ? 'safe' : 'critical'}`;
      const h = document.createElement('h2');
      h.textContent = r.message;
      const p = document.createElement('p');
      p.textContent = r.advice;
      const a = document.createElement('a');
      a.href = r.sebiCheckUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'button secondary';
      a.textContent = 'SEBI Check ↗';
      box.append(h, p, a);
      out.replaceChildren(box);
      speak(`${r.message} ${r.advice}`);
    } catch (err) {
      setStatus(out, err.message);
    }
  }

  /* ---------- Paati decoy ---------- */
  function addChat(who, text) {
    const li = document.createElement('li');
    li.className = who;
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
    addChat('them', text);
    input.value = '';
    try {
      const r = await api('/api/decoy', { text, lang, turn: decoyTurn++ });
      addChat('paati', r.reply);
    } catch (err) {
      addChat('paati', err.message);
    }
  }

  /* ---------- Tabs (WAI-ARIA tabs pattern) ---------- */
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
        const delta = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (delta) { e.preventDefault(); select(tabs[(i + delta + tabs.length) % tabs.length]); }
        if (e.key === 'Home') { e.preventDefault(); select(tabs[0]); }
        if (e.key === 'End') { e.preventDefault(); select(tabs[tabs.length - 1]); }
      });
    });
  }

  /* ---------- wire up ---------- */
  $('xrayForm').addEventListener('submit', onAnalyze);
  $('payForm').addEventListener('submit', onPayCheck);
  $('paatiForm').addEventListener('submit', onPaati);
  $('lang').addEventListener('change', (e) => applyLanguage(e.target.value));
  $('bigText').addEventListener('click', (e) => toggleSetting(e.currentTarget, 'big'));
  $('contrast').addEventListener('click', (e) => toggleSetting(e.currentTarget, 'contrast'));
  $('readAloud').addEventListener('click', () => {
    if (lastResult) speak([lastResult.verdict, lastResult.explanation, ...lastResult.nextSteps].join('. '));
  });
  $('copyComplaint').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('complaint').value);
      setStatus($('xrayStatus'), t('copied'));
    } catch {
      $('complaint').select();
    }
  });
  document.querySelectorAll('[data-sample]').forEach((b) =>
    b.addEventListener('click', () => { $('message').value = SAMPLES[b.dataset.sample]; $('message').focus(); }));

  setupTabs();
  setupMic();

  try {
    const saved = localStorage.getItem('callsafe.lang');
    if (saved) { $('lang').value = saved; applyLanguage(saved); }
    for (const [cls, id] of [['big', 'bigText'], ['contrast', 'contrast']]) {
      if (localStorage.getItem(`callsafe.${cls}`)) toggleSetting($(id), cls);
    }
  } catch { /* storage may be blocked */ }
})();
