'use strict';

/**
 * "Scam or Safe" — the reason to open Chat_Safe when nothing has gone wrong.
 *
 * A deck of real-looking messages is dealt one at a time. The player swipes or taps
 * one of two large buttons: shield for safe, siren for scam. The answer lands
 * immediately with the one rule that gives it away, so the game teaches while it is
 * played rather than afterwards. Hearts, a streak and a daily set of five bring
 * people back the next day — the same loop that keeps a phone game alive, pointed
 * at a skill that is worth having.
 *
 * Nothing here needs reading ability beyond the message itself: the verdict is a
 * colour, the result is a face, and the rule is spoken aloud when sound is on.
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const STORE = 'chatsafe:game';
  const LIVES = 3;
  const DAILY = 5;

  /** Harmless messages that look official enough to make the choice real. */
  const SAFE_POOL = [
    { text: 'Your Amazon order #402-7781 has been delivered. Rate your experience in the app.', why: 'It asks for nothing — no money, no OTP, no link to a form.' },
    { text: 'Amma, reaching home by 8. Shall I bring curd rice?', why: 'A normal family message. No money, no pressure, no urgency.' },
    { text: 'Rs 2,000.00 debited from A/c XX4417 on 12-Nov by UPI. Not you? Call 1800-425-3800.', why: 'A bank alert tells you what happened. It never asks you to share an OTP.' },
    { text: 'Your electricity bill of ₹842 is due on 20 Nov. Pay in the TNEB app or at any counter.', why: 'It points you to the official app, not to a link or a personal UPI id.' },
    { text: 'Dr Menon clinic: your appointment is confirmed for Tuesday 10:30 am. Reply 1 to reschedule.', why: 'A confirmation, not a demand. Nothing is at risk if you ignore it.' },
    { text: 'OTP 448120 for your HDFC login. Do not share with anyone, including bank staff.', why: 'A real OTP message warns you not to share it — it never asks you to.' },
    { text: 'Your LPG cylinder will be delivered today between 2pm and 5pm by Suresh (9xxxxx1123).', why: 'A delivery note with no payment demand and no link.' },
  ];

  /** Scam messages, each tied to the rule that exposes it. */
  const SCAM_POOL = [
    { text: 'Dear customer, your SBI KYC expired. Account blocked in 2 hours. Update now: http://sbi-kyc-verify.in', why: 'Banks never send a KYC link by SMS, and never give you a deadline in hours.' },
    { text: 'This is Inspector Sharma, CBI. A parcel in your name has drugs. Stay on video call. Do not tell your family.', why: 'Police never arrest on a video call, and never tell you to hide it from family.' },
    { text: 'Congratulations! You won ₹25,00,000 in the KBC draw. Pay ₹4,999 release fee to winner.kbc@ybl', why: 'A real prize never asks you to pay first. Paying to receive money is always a scam.' },
    { text: 'Part time job: like 50 YouTube videos daily, earn ₹3,000. First deposit ₹1,000 to unlock tasks.', why: 'A real job pays you. It never asks you to deposit money to start.' },
    { text: 'VIP stock group — guaranteed 8% profit daily. Only 5 seats. Send ₹25,000 to rajesh.trader@ybl now.', why: 'No one on earth can guarantee daily profit. Guaranteed returns means stolen money.' },
    { text: 'Your courier is held at customs. Pay ₹1,250 customs duty on this link or it will be returned today.', why: 'Customs is paid to the government, never over a link sent by SMS.' },
    { text: 'Mummy this is my new number, my phone broke. I need ₹18,000 urgently, I will return tomorrow.', why: 'Always call the old number first. A new number asking for money is the oldest trick there is.' },
    { text: 'Your loan of ₹50,000 is pre-approved. Install this APK to claim: bit.ly/loanfast-apk', why: 'Installing an app from a link gives a stranger your whole phone.' },
    { text: 'Electricity will be disconnected tonight at 9:30. Call 8xxxxxxx12 immediately to avoid it.', why: 'The board sends a bill, not a threat with a personal mobile number.' },
  ];

  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(STORE) || '{}');
    } catch {
      return {};
    }
  };
  const save = (d) => {
    try {
      localStorage.setItem(STORE, JSON.stringify(d));
    } catch { /* private mode: the game still plays, it just forgets */ }
  };
  const today = () => new Date().toISOString().slice(0, 10);

  function shuffle(a) {
    const out = a.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** A round is half scams, half safe, shuffled, so neither answer is ever the habit. */
  function deal(n) {
    const scams = shuffle(SCAM_POOL).slice(0, Math.ceil(n / 2)).map((c) => ({ ...c, scam: true }));
    const safes = shuffle(SAFE_POOL).slice(0, Math.floor(n / 2)).map((c) => ({ ...c, scam: false }));
    return shuffle([...scams, ...safes]);
  }

  function init() {
    const root = $('gameBoard');
    if (!root) return;

    const card = $('gCard');
    const text = $('gText');
    const result = $('gResult');
    const hearts = $('gHearts');
    const streakEl = $('gStreak');
    const scoreEl = $('gScore');
    const progress = $('gProgress');
    const done = $('gDone');

    let deck = [];
    let i = 0;
    let lives = LIVES;
    let streak = 0;
    let score = 0;
    let locked = false;

    const state = load();
    const best = state.best || 0;

    const paint = () => {
      hearts.textContent = '❤️'.repeat(lives) + '🖤'.repeat(LIVES - lives);
      hearts.setAttribute('aria-label', `${lives} lives left`);
      streakEl.textContent = String(streak);
      scoreEl.textContent = String(score);
      progress.style.setProperty('--p', `${(i / deck.length) * 100}%`);
      progress.setAttribute('aria-valuenow', String(i));
    };

    const show = () => {
      const c = deck[i];
      card.className = 'g-card';
      card.style.transform = '';
      text.textContent = c.text;
      text.setAttribute('dir', 'auto');
      result.hidden = true;
      locked = false;
      paint();
    };

    const finish = () => {
      const won = lives > 0;
      const record = score > best;
      if (record) save({ ...load(), best: score });
      const day = today();
      const st = load();
      const streakDays = st.lastDay === day ? st.days || 1 : st.lastDay === new Date(Date.now() - 864e5).toISOString().slice(0, 10) ? (st.days || 0) + 1 : 1;
      save({ ...st, lastDay: day, days: streakDays, best: Math.max(best, score) });

      root.hidden = true;
      done.hidden = false;
      done.innerHTML = `
        <div class="g-end ${won ? 'g-win' : 'g-lose'}">
          <p class="g-face" aria-hidden="true">${won ? '🛡️' : '💔'}</p>
          <p class="g-end-score">${score} / ${deck.length}</p>
          <p class="g-end-line">${won ? 'You spotted them.' : 'Three slipped past — try again.'}${record ? ' <strong>New best!</strong>' : ''}</p>
          <p class="g-end-sub">Day streak: <strong>${streakDays}</strong> · Best score: <strong>${Math.max(best, score)}</strong></p>
          <button type="button" class="primary" id="gAgain">▶ Play again</button>
        </div>`;
      $('gAgain').addEventListener('click', start);
      window.Sound?.play?.(won ? 'safe' : 'alert');
    };

    const answer = (saidScam) => {
      if (locked) return;
      locked = true;
      const c = deck[i];
      const right = saidScam === c.scam;

      if (right) {
        score++;
        streak++;
      } else {
        lives--;
        streak = 0;
      }
      card.classList.add(right ? 'g-right' : 'g-wrong');
      card.style.transform = `translateX(${saidScam ? -14 : 14}px)`;

      result.hidden = false;
      result.className = `g-result ${right ? 'ok' : 'no'}`;
      result.innerHTML = `
        <p class="g-verdict"><span aria-hidden="true">${right ? '✅' : '❌'}</span>
          ${right ? 'Correct' : 'Not quite'} — this one is <strong>${c.scam ? 'a SCAM' : 'SAFE'}</strong></p>
        <p class="g-why">${c.why}</p>`;
      paint();
      window.Sound?.play?.(right ? 'safe' : 'alert');
      if (window.Avatar?.setMood) window.Avatar.setMood(c.scam ? 'critical' : 'safe');

      setTimeout(() => {
        i++;
        if (lives <= 0 || i >= deck.length) finish();
        else show();
      }, right ? 1500 : 2600);
    };

    function start() {
      deck = deal(DAILY * 2);
      i = 0;
      lives = LIVES;
      streak = 0;
      score = 0;
      root.hidden = false;
      done.hidden = true;
      progress.setAttribute('aria-valuemax', String(deck.length));
      show();
    }

    $('gScam').addEventListener('click', () => answer(true));
    $('gSafe').addEventListener('click', () => answer(false));
    addEventListener('keydown', (e) => {
      if (root.hidden || !root.closest('[role="tabpanel"]')?.classList.contains('active')) return;
      if (e.key === 'ArrowLeft') answer(true);
      if (e.key === 'ArrowRight') answer(false);
    });

    // Swipe: left is scam, right is safe, matching the buttons underneath.
    let x0 = null;
    card.addEventListener('pointerdown', (e) => {
      if (locked) return;
      x0 = e.clientX;
      card.setPointerCapture(e.pointerId);
    });
    card.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 26}deg)`;
      card.classList.toggle('tilt-scam', dx < -40);
      card.classList.toggle('tilt-safe', dx > 40);
    });
    const endSwipe = (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      x0 = null;
      card.classList.remove('tilt-scam', 'tilt-safe');
      if (Math.abs(dx) > 90) answer(dx < 0);
      else card.style.transform = '';
    };
    card.addEventListener('pointerup', endSwipe);
    card.addEventListener('pointercancel', () => {
      x0 = null;
      card.style.transform = '';
      card.classList.remove('tilt-scam', 'tilt-safe');
    });

    start();
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
  else init();
})();
