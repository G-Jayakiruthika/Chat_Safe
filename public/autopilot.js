'use strict';

/**
 * Autopilot panel.
 *
 * The rest of the app asks the person to do one thing at a time: paste a message,
 * read a verdict, decide what to do next. Autopilot takes the whole pile at once and
 * comes back with the finished work — the reply already written, the complaint
 * already filled in, the family warning ready to forward — with the steps the person
 * switched on marked as handled rather than waiting for them.
 */
(() => {
  const $ = (id) => document.getElementById(id);

  const SWITCHES = { auReply: 'reply', auWarn: 'warn', auReport: 'report', auBlock: 'block' };
  const STORE = 'chatsafe:autopilot';

  const SAMPLE = [
    'Dear customer, your SBI KYC has expired. Account will be blocked today. Update at http://sbi-kyc-verify.in and share the OTP sent to you.',
    'Amma, I will come home by 8. Shall I bring curd rice?',
    'Congratulations! You won ₹25,00,000 in the KBC lucky draw. To release the prize, pay ₹4,999 processing fee to winner.kbc@ybl',
    'Sir this is Inspector Sharma, Mumbai Cyber Cell. A parcel in your name has drugs. Stay on video call. Do not disconnect or we will arrest you.',
    'Your Amazon order #402-33 has been delivered. Thank you for shopping with us.',
  ].join('\n');

  /** levelFor() returns machine words; these are what a reader should see. */
  const LEVEL_WORD = { safe: 'safe', suspicious: 'suspicious', high: 'scam', critical: 'dangerous scam' };

  const ICON = { stop: '✋', reply: '✉️', complaint: '📄', report: '📣', warn: '👨‍👩‍👧', block: '🚫', watch: '👀' };

  /** Remember the switches, so the person sets this up once and never again. */
  const loadPrefs = () => {
    try {
      return JSON.parse(localStorage.getItem(STORE) || '{}');
    } catch {
      return {};
    }
  };
  const savePrefs = () => {
    const out = {};
    for (const id of [...Object.keys(SWITCHES), 'auScan', 'auDigest']) out[id] = Boolean($(id)?.checked);
    try {
      localStorage.setItem(STORE, JSON.stringify(out));
    } catch { /* private mode — the switches simply reset next visit */ }
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  /** One action, rendered as a card the person can act on without reading much. */
  function stepCard(step) {
    const body = [];
    body.push(`<p class="st-why">${escapeHtml(step.why)}</p>`);
    if (step.text) {
      body.push(`<pre class="st-text" dir="auto">${escapeHtml(step.text)}</pre>`);
      body.push(`<button type="button" class="chip st-copy">📋 Copy</button>`);
    }
    for (const l of step.links || []) {
      const ext = l.url.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : '';
      body.push(`<a class="chip st-link" href="${escapeHtml(l.url)}"${ext}>${escapeHtml(l.label)} →</a>`);
    }
    return `
      <li class="st st-${step.tone}${step.auto ? ' st-auto' : ''}">
        <span class="st-ico" aria-hidden="true">${ICON[step.id] || '•'}</span>
        <div class="st-main">
          <h4 class="st-title">${escapeHtml(step.title)}${step.auto ? ' <em class="st-tag">done for you</em>' : ''}</h4>
          ${body.join('')}
        </div>
      </li>`;
  }

  function render(out, data) {
    const { plan, worst, counts, scanned } = data;
    const bad = (counts.critical || 0) + (counts.high || 0) + (counts.suspicious || 0);
    const tally = Object.entries(counts)
      .map(([k, v]) => `<span class="tl tl-${k}">${v} ${escapeHtml(LEVEL_WORD[k] || k)}</span>`)
      .join('');

    out.innerHTML = `
      <div class="auto-sum">
        <p class="auto-count"><strong>${scanned}</strong> checked · <strong>${bad}</strong> need action</p>
        <div class="auto-tally">${tally}</div>
      </div>
      <div class="auto-worst lvl-${escapeHtml(worst.level)}">
        <p class="aw-tag">${escapeHtml(worst.verdict)} · ${escapeHtml(worst.scamType || '')}</p>
        <p class="aw-text" dir="auto">${escapeHtml(worst.text)}</p>
      </div>
      <p class="auto-plan-head">${plan.autoCount
        ? `Chat_Safe handled <strong>${plan.autoCount}</strong> of these for you. The rest is one tap each.`
        : 'Here is everything to do, already written out.'}</p>
      <ol class="auto-plan">${plan.steps.map(stepCard).join('')}</ol>`;
    out.hidden = false;

    out.querySelectorAll('.st-copy').forEach((b) => {
      b.addEventListener('click', async () => {
        const text = b.parentElement.querySelector('.st-text')?.textContent || '';
        try {
          await navigator.clipboard.writeText(text);
          b.textContent = '✓ Copied';
          setTimeout(() => (b.textContent = '📋 Copy'), 1600);
        } catch {
          b.textContent = 'Select and copy';
        }
      });
    });
  }

  function init() {
    const form = $('autoForm');
    if (!form) return;
    const input = $('autoInput');
    const out = $('autoOut');
    const badge = $('autoBadge');
    const run = $('autoRun');

    const prefs = loadPrefs();
    for (const [id, val] of Object.entries(prefs)) if ($(id)) $(id).checked = Boolean(val);
    form.querySelectorAll('input[type="checkbox"]').forEach((c) => c.addEventListener('change', savePrefs));

    const showBadge = () => {
      const n = Object.keys(SWITCHES).filter((id) => $(id)?.checked).length;
      badge.textContent = n ? `${n} task${n > 1 ? 's' : ''} automated` : 'nothing automated yet';
      badge.hidden = false;
    };
    showBadge();
    form.addEventListener('change', showBadge);

    $('autoSample').addEventListener('click', () => {
      input.value = SAMPLE;
      input.focus();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const messages = input.value.split(/\n{1,}/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
      if (!messages.length) return;

      run.disabled = true;
      const label = run.textContent;
      run.textContent = '🤖 Working…';
      out.hidden = false;
      out.innerHTML = `<p class="auto-working">Checking ${messages.length} message${messages.length > 1 ? 's' : ''}…</p>`;

      const autoActions = Object.entries(SWITCHES).filter(([id]) => $(id)?.checked).map(([, v]) => v);
      const connected = (window.CONNECTED_APPS || []).length ? window.CONNECTED_APPS : ['app'];

      try {
        const data = await window.ChatSafeAPI.call('autopilot', {
          messages,
          lang: document.getElementById('lang')?.value || 'auto',
          connected,
          autoActions,
        });
        render(out, data);
        window.Sound?.play?.(data.worst.level === 'safe' ? 'safe' : 'alert');
      } catch (err) {
        out.innerHTML = `<p class="auto-working">Could not run Autopilot: ${escapeHtml(err?.message || 'unknown error')}</p>`;
      } finally {
        run.disabled = false;
        run.textContent = label;
      }
    });
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
  else init();
})();
