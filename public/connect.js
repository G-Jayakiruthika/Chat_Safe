'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bg = window.createBackground($('bg'), { reducedMotion });
  const isDark = () => document.documentElement.dataset.theme !== 'light';
  bg.setColor([34, 211, 238], isDark() ? 0.6 : 0.35);

  $('themeToggle').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('chatsafe.theme', next); } catch { /* ignore */ }
    bg.setColor([34, 211, 238], next === 'dark' ? 0.6 : 0.35);
  });

  const origin = location.origin + location.pathname.replace(/[^/]*$/, '');
  document.querySelectorAll('.hookUrl').forEach((el) => { el.textContent = `${origin}webhooks/meta`; });
  $('tgCmd').textContent =
    `curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \\\n  -d url=${origin}webhooks/telegram \\\n  -d secret_token=<TELEGRAM_WEBHOOK_SECRET>`;
  document.querySelectorAll('[data-copy]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($(b.dataset.copy).textContent);
        b.textContent = 'Copied ✔';
      } catch { /* clipboard blocked */ }
    }));

  /** Cards for every channel. `status` comes from /api/integrations (null in browser-only mode). */
  const CHANNELS = [
    {
      id: 'whatsapp-personal',
      icon: '💚',
      name: 'WhatsApp (personal)',
      how: 'WhatsApp has no bot access for personal chats, so use your phone\'s share menu: long-press the message → Share → Chat_Safe (Android, after "Install app"). On iPhone, copy the message and paste it into Kavach.',
      action: { label: 'Open Kavach', href: 'app.html' },
      always: true,
    },
    {
      id: 'whatsapp',
      icon: '🟢',
      name: 'WhatsApp Business',
      how: 'Forward the suspicious message to the Chat_Safe WhatsApp Business number. The reply comes back in the same chat.',
      linkLabel: 'Chat on WhatsApp',
    },
    { id: 'telegram', icon: '✈️', name: 'Telegram', how: 'Open the Chat_Safe bot, press Start, then forward any message.', linkLabel: 'Open bot' },
    { id: 'instagram', icon: '📸', name: 'Instagram DM', how: 'Send the suspicious DM or a description to the Chat_Safe Instagram account.', linkLabel: 'Message on Instagram' },
    { id: 'messenger', icon: '💬', name: 'Messenger', how: 'Message the Chat_Safe Facebook Page.', linkLabel: 'Open Messenger' },
    {
      id: 'share',
      icon: '📲',
      name: 'Any app · Share sheet',
      how: 'Install Chat_Safe from the browser menu ("Install app" / "Add to Home screen"). Then share text from SMS, Gmail, Telegram or WhatsApp straight to Chat_Safe and it scans automatically.',
      action: { label: 'How to install', href: 'index.html#faq' },
      always: true,
    },
  ];

  function render(status) {
    const cards = CHANNELS.map((c, i) => {
      const s = status?.[c.id];
      const enabled = c.always || Boolean(s?.enabled);
      const card = document.createElement('article');
      card.className = `channel glass${enabled ? ' on' : ''}`;
      card.style.animationDelay = `${i * 70}ms`;
      const head = document.createElement('div');
      head.className = 'channel-head';
      const icon = document.createElement('span');
      icon.className = 'channel-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = c.icon;
      const h = document.createElement('h2');
      h.textContent = c.name;
      const badge = document.createElement('span');
      badge.className = `badge ${enabled ? 'ok' : 'off'}`;
      badge.textContent = c.always ? 'Ready' : enabled ? 'Connected' : status === null ? 'Server only' : 'Not set up yet';
      head.append(icon, h, badge);
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = c.how;
      card.append(head, p);
      const href = c.action?.href || s?.link;
      if (href && enabled) {
        const a = document.createElement('a');
        a.className = 'button primary';
        a.href = href;
        if (/^https?:/.test(href)) {
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
        }
        a.textContent = c.action?.label || c.linkLabel;
        card.append(a);
      }
      return card;
    });
    $('channels').replaceChildren(...cards);
  }

  render(undefined);
  window.ChatSafeAPI.call('integrations')
    .then((status) => {
      if (status === null) {
        $('modeNote').hidden = false;
        $('modeNote').textContent = 'This is the browser-only version (GitHub Pages). Chat-app bots need the server version on Cloud Run.';
      }
      render(status);
    })
    .catch(() => render(null));
})();
