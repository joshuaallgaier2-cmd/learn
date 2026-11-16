// The one page of learn.flisk.si, in the look of chat.flisk.si: a sidebar, a three-way switch (Learn, Practice, Exam)
// and one box. The server writes the whole page (it reads without scripts); client() below adds the answers, the
// computer and the progress marks.
import { COURSES, LAB_CARDS, PARTS } from './labs.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// JSON inside a <script>: no "</script>" or "<!--" can close it early.
const inlineJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

// Providers a learner can connect here with one key. Fleet keeps the key; this site never stores it.
export const PROVIDERS = [
  { id: 'e2b', label: 'E2B', url: 'https://e2b.dev/dashboard', note: 'Free credit.' },
  { id: 'daytona', label: 'Daytona', url: 'https://app.daytona.io/dashboard/keys', note: 'Free credit.' },
  { id: 'upstash', label: 'Upstash Box', url: 'https://console.upstash.com', note: 'Free plan.' },
  { id: 'isorun', label: 'Isorun', url: 'https://app.isorun.ai', note: 'Free credit.' },
];

const MODES = {
  learn: { label: 'Learn', title: 'What do you want to learn?', hint: 'Ask about Flisk or AI engineering', needs: 'Answers from the Flisk docs, with the pages named.' },
  practice: { label: 'Practice', title: 'What do you want to practice?', hint: 'Name a skill, or pick a lab below', needs: 'Every lab runs on your own computer from Fleet.' },
  exam: { label: 'Exam', title: 'Ready to prove it?', hint: 'Name a topic to be tested on', needs: 'Tasks on a fresh computer, scored by Flisk Wolf.' },
};
const EXAMPLES = ['How do I add a backend service?', 'What is service.json?', 'How do I run database migrations?', 'How do I see why a service is unhealthy?'];
const labCode = (id) => id.split('-')[0];
const labCard = Object.fromEntries(LAB_CARDS.map((l) => [l.id, l]));

const CSS = `
:root{--bg:#000;--panel:#0B0B0D;--raise:#151518;--line:#26262A;--line2:#3A3A40;--ink:#EDEDEE;--dim:#8D8D92;--btn:#EDEDEE;--btn-ink:#000;--ok:#5CBF7C;--bad:#E5727A;--radius:0px;--sans:Geist,Inter,system-ui,-apple-system,'Segoe UI',sans-serif;--mono:'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
html[data-theme=ivory]{--bg:#F7F6F2;--panel:#fff;--raise:#F0EEE7;--line:#E3E0D6;--line2:#D3D0C5;--ink:#1B1B18;--dim:#6B6960;--btn:#1B1B18;--btn-ink:#fff;--ok:#2F7D4A;--bad:#B3261E;--radius:4px}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
a{color:inherit}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
code,pre,.mono{font-family:var(--mono);font-size:13px}
.app{display:grid;grid-template-columns:264px minmax(0,1fr);min-height:100vh}
.side{border-right:1px solid var(--line);background:var(--panel);padding:18px 14px;display:flex;flex-direction:column;gap:18px;position:sticky;top:0;height:100vh;overflow:auto}
.brand{font-weight:600;font-size:17px;letter-spacing:-.01em;text-decoration:none}
.brand span{color:var(--dim)}
.side h2{font:500 11px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--dim);margin:0 0 8px}
.course{margin:0 0 14px;padding:0;list-style:none}
.course li a{display:flex;justify-content:space-between;gap:8px;padding:5px 8px;text-decoration:none;color:var(--dim);border-radius:var(--radius);font-size:14px}
.course li a:hover{background:var(--raise);color:var(--ink)}
.course li a b{font:400 12px var(--mono)}
.course li a[data-all="1"] b{color:var(--ok)}
.course-name{font-size:13px;font-weight:600;padding:0 8px 4px}
.side .more a{display:block;padding:5px 8px;color:var(--dim);text-decoration:none;font-size:14px}
.side .more a:hover{color:var(--ink)}
.account{margin-top:auto;border-top:1px solid var(--line);padding-top:14px;font-size:14px;display:grid;gap:8px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:36px;padding:0 14px;border:1px solid var(--btn);background:var(--btn);color:var(--btn-ink);border-radius:var(--radius);font-weight:500;font-size:14px;text-decoration:none;cursor:pointer}
.btn.ghost{background:transparent;color:var(--ink);border-color:var(--line2)}
.btn.ghost:hover{border-color:var(--ink)}
.btn[disabled]{opacity:.5;cursor:default}
.linkbtn{background:none;border:0;padding:0;color:var(--dim);text-decoration:underline;cursor:pointer;font-size:13px}
main{min-width:0;padding:22px clamp(16px,4vw,48px) 64px}
.top{display:flex;justify-content:flex-end;align-items:center;gap:14px;min-height:28px;font-size:13px;color:var(--dim)}
.col{max-width:820px;margin:0 auto}
.welcome{padding:9vh 0 26px;text-align:center}
.welcome h1{font-weight:300;font-size:clamp(30px,5vw,48px);letter-spacing:-.03em;line-height:1.1;margin:0 0 8px}
.welcome p{color:var(--dim);margin:0}
.talking .welcome,.talking .chips{display:none}
.notice{border:1px solid var(--line2);padding:10px 14px;margin:0 0 18px;border-radius:var(--radius)}
.switch{display:inline-grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line2);border-radius:var(--radius);margin:0 0 14px}
.switch a{padding:7px 22px;text-decoration:none;color:var(--dim);font-weight:500;font-size:14px;text-align:center}
.switch a+a{border-left:1px solid var(--line2)}
.switch a[aria-current=page]{background:var(--btn);color:var(--btn-ink)}
.box{border:1px solid var(--line2);background:var(--panel);border-radius:var(--radius);padding:12px;display:grid;gap:10px}
.box:focus-within{border-color:var(--ink)}
.box textarea{width:100%;border:0;background:transparent;resize:none;outline:0;min-height:52px;font-size:16px}
.box-row{display:flex;justify-content:space-between;align-items:center;gap:12px;color:var(--dim);font-size:13px}
.send{width:36px;height:36px;border-radius:50%;border:0;background:var(--btn);color:var(--btn-ink);cursor:pointer;display:grid;place-items:center;flex:none}
.send[disabled]{opacity:.4;cursor:default}
.chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:18px 0 0}
.chip{border:1px solid var(--line2);background:transparent;border-radius:var(--radius);padding:6px 12px;font-size:13px;color:var(--dim);cursor:pointer;text-decoration:none}
.chip:hover{color:var(--ink);border-color:var(--ink)}
.thread{display:grid;gap:22px;margin:0 0 22px}
.q{justify-self:end;max-width:80%;background:var(--raise);padding:9px 14px;border-radius:var(--radius)}
.a p{margin:0 0 10px}.a ol,.a ul{margin:0 0 10px;padding-left:22px}.a li{margin:0 0 4px}
.a pre{margin:0 0 10px;padding:10px 12px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:auto;white-space:pre-wrap}
.a code{background:var(--raise);padding:1px 5px}
.a pre code{background:none;padding:0}
.cite{font:500 11px var(--mono);border:1px solid var(--line2);padding:0 4px;text-decoration:none;color:var(--dim);vertical-align:1px;margin-left:2px}
.cite:hover{color:var(--ink);border-color:var(--ink)}
.note{color:var(--dim);font-size:13px;margin:0 0 10px}
.passage{border-left:2px solid var(--line2);padding:2px 0 2px 12px;margin:0 0 12px;white-space:pre-wrap;font-size:14px}
.sources{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 12px}
.source{display:inline-flex;gap:6px;align-items:baseline;border:1px solid var(--line);padding:3px 9px;font-size:12px;color:var(--dim);text-decoration:none;border-radius:var(--radius);max-width:100%}
.source:hover{color:var(--ink);border-color:var(--line2)}
.source b{font:500 11px var(--mono);color:var(--ink)}
.next{display:flex;flex-wrap:wrap;gap:8px}
.part{margin:30px 0 0}
.part h2{font-size:15px;margin:0;font-weight:600}
.part h2 small{font:400 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--dim);display:block;margin-bottom:4px}
.part>p{color:var(--dim);margin:2px 0 10px;font-size:14px}
.labs{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.labs a{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:12px;align-items:baseline;padding:11px 8px;border-bottom:1px solid var(--line);text-decoration:none}
.labs a:hover{background:var(--panel)}
.labs .code{font:500 12px var(--mono);color:var(--dim)}
.labs .meta{display:block;color:var(--dim);font-size:13px}
.status{font:500 11px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--dim);white-space:nowrap}
.status[data-s=passed]{color:var(--ok)}
.status[data-s=going]{color:var(--ink)}
.empty{color:var(--dim);padding:18px 8px}
.labhead{padding:26px 0 18px;border-bottom:1px solid var(--line);margin-bottom:22px}
.labhead .crumb{font-size:13px;color:var(--dim)}
.labhead h1{font-weight:400;font-size:clamp(24px,3.4vw,32px);letter-spacing:-.02em;margin:8px 0 6px;line-height:1.2}
.labhead p{margin:0 0 6px;color:var(--dim)}
.labhead ul{margin:6px 0 0;padding-left:18px;color:var(--dim);font-size:14px}
.work{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,420px);gap:28px;align-items:start;max-width:1180px;margin:0 auto}
.steps{list-style:none;margin:0;padding:0;display:grid;gap:14px}
.step{border:1px solid var(--line);background:var(--panel);border-radius:var(--radius);padding:14px 16px}
.step[data-passed="1"]{border-color:var(--ok)}
.step h3{margin:0 0 6px;font-size:15px;font-weight:600;display:flex;gap:10px;align-items:baseline}
.step h3 span{font:500 11px var(--mono);color:var(--dim)}
.step p{margin:0 0 8px;color:var(--dim);font-size:14px}
.step p b{color:var(--ink);font-weight:500}
.cmd{display:block;padding:8px 10px;background:var(--bg);border:1px solid var(--line);border-radius:var(--radius);margin:0 0 8px;white-space:pre-wrap;word-break:break-word}
.step .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.out{margin:10px 0 0;padding:8px 10px;background:var(--bg);border:1px solid var(--line);border-radius:var(--radius);white-space:pre-wrap;word-break:break-word;max-height:260px;overflow:auto}
.verdict{font:500 12px var(--mono);margin:8px 0 0}
.verdict[data-ok="1"]{color:var(--ok)}.verdict[data-ok="0"]{color:var(--bad)}
.computer{border:1px solid var(--line2);background:var(--panel);border-radius:var(--radius);position:sticky;top:16px}
.computer header{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px 12px;border-bottom:1px solid var(--line);font:500 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}
.computer header i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--line2);margin-right:7px}
.computer[data-state=running] header i{background:var(--ok)}
.computer .body{padding:12px;display:grid;gap:10px}
.computer .say{margin:0;font-size:14px;color:var(--dim)}
.computer .say[data-bad="1"]{color:var(--bad)}
.term{margin:0;background:var(--bg);border:1px solid var(--line);border-radius:var(--radius);padding:10px;min-height:150px;max-height:340px;overflow:auto;white-space:pre-wrap;word-break:break-word}
.line{display:flex;gap:8px;align-items:center;border:1px solid var(--line);border-radius:var(--radius);padding:0 10px;background:var(--bg)}
.line span{color:var(--dim);font-family:var(--mono)}
.line input{flex:1;min-width:0;border:0;background:transparent;outline:0;height:36px;font-family:var(--mono);font-size:13px}
.field{display:grid;gap:4px;font-size:13px;color:var(--dim)}
.field input,.field select,.editor textarea{border:1px solid var(--line2);background:var(--bg);border-radius:var(--radius);padding:8px 10px;width:100%}
.editor textarea{min-height:220px;font-family:var(--mono);font-size:13px;resize:vertical}
.editor b{font:500 12px var(--mono)}
.fine{font-size:12px;color:var(--dim);margin:0}
.examcard{border:1px solid var(--line);background:var(--panel);border-radius:var(--radius);padding:18px 20px;margin:26px 0 0;text-align:left}
.examcard h2{font-size:15px;margin:0 0 8px}
.examcard ol{margin:0 0 14px;padding-left:20px;color:var(--dim)}
.tag{font:500 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--line2);padding:2px 7px;color:var(--dim);margin-left:8px;white-space:nowrap;display:inline-block;vertical-align:2px}
[hidden]{display:none!important}
@media (max-width:900px){.linkbtn{min-height:44px;padding:0 4px}}
@media (max-width:1180px){.work{grid-template-columns:minmax(0,1fr);max-width:820px}.computer{position:static;order:-1}}
@media (max-width:900px){.app{grid-template-columns:minmax(0,1fr)}.side{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line);gap:12px}.side nav,.side .more{display:none}.account{margin-top:0;border-top:0;padding-top:0}.work{grid-template-columns:minmax(0,1fr)}.computer{position:static}.welcome{padding-top:5vh}.q{max-width:92%}}
`;

const sidebar = (login) => `
<aside class="side">
  <a class="brand" href="/">learn<span>.flisk</span></a>
  <nav aria-label="Your path">
    <h2>Your path</h2>
    ${COURSES.map((c) => `<div class="course-name">${esc(c.title)}</div><ul class="course">${PARTS.filter((p) => p.course === c.id).map((p) => `<li><a href="/practice#${esc(p.id)}" data-part="${esc(p.id)}"><span>${esc(p.title)}</span><b>0/${p.labs.length}</b></a></li>`).join('')}</ul>`).join('')}
  </nav>
  <div class="more">
    <h2>More</h2>
    <a href="https://flisk.sh/docs/">Flisk docs</a>
    <a href="https://roadmap.flisk.si/">Roadmap: what to learn next</a>
    <a href="https://chat.flisk.si/">Build something in chat</a>
  </div>
  <div class="account">${login
    ? `<span>Signed in as <b>${esc(login)}</b></span><form method="post" action="/auth/logout"><button class="linkbtn">Sign out</button></form>`
    : `<a class="btn ghost" href="/auth/login">Sign in with GitHub</a><span class="fine">Only Practice needs it, to open your computer.</span>`}</div>
</aside>`;

const switcher = (mode) => `<nav class="switch" aria-label="Mode">${Object.entries(MODES).map(([id, m]) => `<a href="/${id}"${id === mode ? ' aria-current="page"' : ''}>${m.label}</a>`).join('')}</nav>`;

const box = (mode) => `
<form class="box" data-box>
  <textarea name="q" rows="2" placeholder="${esc(MODES[mode].hint)}" aria-label="${esc(MODES[mode].hint)}" maxlength="400"${mode === 'exam' ? ' disabled' : ''}></textarea>
  <div class="box-row"><span>${esc(MODES[mode].needs)}</span><button class="send" aria-label="Send"${mode === 'exam' ? ' disabled' : ''}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg></button></div>
</form>`;

const welcome = (mode) => `<div class="welcome"><h1>${esc(MODES[mode].title)}</h1></div>`;

const learnView = () => `
<div class="col" data-view="learn">
  ${welcome('learn')}
  <div class="thread" data-thread aria-live="polite"></div>
  <div style="text-align:center">${switcher('learn')}</div>
  ${box('learn')}
  <div class="chips">${EXAMPLES.map((q) => `<button type="button" class="chip" data-example>${esc(q)}</button>`).join('')}</div>
</div>`;

const labList = () => `
<div class="col" data-view="labs">
  ${welcome('practice')}
  <div style="text-align:center">${switcher('practice')}</div>
  ${box('practice')}
  <p class="empty" data-nolabs hidden>No lab matches that. Clear the box to see them all.</p>
  ${COURSES.map((c) => PARTS.filter((p) => p.course === c.id).map((p, i) => `
  <section class="part" id="${esc(p.id)}" data-partbox>
    <h2><small>${esc(c.title)} · Part ${String(i + 1).padStart(2, '0')}</small>${esc(p.title)}</h2>
    <p>${esc(p.description)}</p>
    <ul class="labs">${p.labs.map((id) => { const l = labCard[id]; return `<li data-labrow="${esc(id)}" data-text="${esc(`${l.title} ${l.goal} ${p.title}`.toLowerCase())}"><a href="/practice/${esc(id)}"><span class="code">${esc(labCode(id))}</span><span><span>${esc(l.title)}</span><span class="meta">${esc(l.level)} · ${l.minutes} min · ${l.steps.length} steps</span></span><span class="status" data-status="${esc(id)}">Not started</span></a></li>`; }).join('')}</ul>
  </section>`).join('')).join('')}
</div>`;

const labView = (lab, login, computers) => `
<div class="work" data-view="lab">
  <div>
    <div class="labhead">
      <div class="crumb"><a href="/practice">All labs</a> · Lab ${esc(labCode(lab.id))} · ${esc(lab.level)} · ${lab.minutes} min</div>
      <h1>${esc(lab.title)}</h1>
      <p>${esc(lab.goal)}</p>
      ${lab.build ? `<p><b style="color:var(--ink);font-weight:500">You build:</b> ${esc(lab.build)}</p>` : ''}
      ${lab.needs.length ? `<ul>${lab.needs.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      ${lab.docs.length ? `<div class="sources" style="margin-top:10px">${lab.docs.map((d) => `<a class="source" href="${esc(d.url)}">${esc(d.label)}</a>`).join('')}</div>` : ''}
    </div>
    <ol class="steps">${lab.steps.map((s, i) => `
      <li class="step" data-step="${esc(s.id)}">
        <h3><span>${String(i + 1).padStart(2, '0')}</span>${esc(s.task)}</h3>
        ${s.explain ? `<p>${esc(s.explain)}</p>` : ''}
        <code class="cmd">${esc(s.cmd)}</code>
        <p><b>You pass when:</b> ${esc(s.expect)}</p>
        <div class="row">
          <button type="button" class="btn" data-check="${esc(s.id)}">Check step ${i + 1}</button>
          ${s.files.map((f) => `<button type="button" class="btn ghost mono" data-file="${esc(f)}">${esc(f)}</button>`).join('')}
        </div>
        <pre class="out" data-out hidden></pre><p class="verdict" data-verdict hidden></p>
      </li>`).join('')}</ol>
    <p class="fine" style="margin-top:14px">The check runs on the computer, not on your word: a step passes when its command exits with 0 there.</p>
  </div>
  <section class="computer" data-computer data-state="off" aria-label="Your computer">
    <header><span><i></i>Your computer · Fleet · <span data-state-text>off</span></span><button type="button" class="linkbtn" data-stop hidden>Stop</button></header>
    <div class="body">
      <p class="say" data-say role="status">${!computers ? 'Computers are not set up on this site yet. Run each command on your own machine and compare with "You pass when".' : login ? 'Open a computer to run this lab. It is yours, from the provider you connected to Fleet.' : 'Sign in with GitHub to open a computer for this lab.'}</p>
      ${!computers ? '' : login ? '<button type="button" class="btn" data-open>Open a computer</button>' : '<a class="btn" href="/auth/login">Sign in with GitHub</a>'}
      <form data-connect hidden>
        <div style="display:grid;gap:10px">
          <p class="say">Fleet has no computer provider for you yet. Paste one key; Fleet keeps it, this site does not.</p>
          <label class="field">Provider<select name="provider">${PROVIDERS.map((p) => `<option value="${p.id}">${esc(p.label)} · ${esc(p.note)}</option>`).join('')}</select></label>
          <label class="field">Key<input name="key" type="password" autocomplete="off" required minlength="8"></label>
          <p class="fine">Get a key: ${PROVIDERS.map((p) => `<a href="${p.url}" target="_blank" rel="noopener">${esc(p.label)}</a>`).join(' · ')}</p>
          <button class="btn">Connect and open</button>
        </div>
      </form>
      <div data-shell hidden style="display:grid;gap:10px">
        <pre class="term" data-term aria-label="Terminal output"></pre>
        <form class="line" data-line><span>$</span><input name="command" autocomplete="off" spellcheck="false" aria-label="Command" placeholder="type a command, press Enter"></form>
        <div class="editor" data-editor hidden style="display:grid;gap:8px">
          <b data-editor-name></b>
          <textarea spellcheck="false" aria-label="File contents"></textarea>
          <div class="row" style="display:flex;gap:8px"><button type="button" class="btn" data-save>Save to the computer</button><button type="button" class="btn ghost" data-close>Close</button></div>
        </div>
        <p class="fine">Commands run in <span class="mono">labs/${esc(lab.id)}</span> and may take up to 60 seconds each. Every command starts a new shell: put keys and settings in a <span class="mono">.env</span> file there, it is loaded each time.</p>
      </div>
    </div>
  </section>
</div>`;

const examView = () => `
<div class="col" data-view="exam">
  ${welcome('exam')}
  <div style="text-align:center">${switcher('exam')}</div>
  ${box('exam')}
  <div class="examcard">
    <h2>Exam is the next piece to be built<span class="tag">not open yet</span></h2>
    <ol>
      <li>You get a fresh computer from Fleet and a set of timed tasks.</li>
      <li>You do the work there. Nothing is multiple choice.</li>
      <li>Flisk Wolf reads what is on the computer and scores it out of 100, with a reason for each task.</li>
    </ol>
    <a class="btn" href="/practice">Practice first</a>
  </div>
</div>`;

// Runs in the browser. It is written as a real function and printed into the page, so it is checked like any other code.
function client(BOOT) {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
  };
  const post = async (path, body) => {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    if (!res) return { error: 'No connection. Try again.' };
    const data = await res.json().catch(() => ({ error: 'The site sent an answer we could not read.' }));
    return { ...data, status: res.status };
  };

  // Look: dark like chat, or Ivory.
  const look = $('[data-look]');
  const setLook = (t) => { document.documentElement.dataset.theme = t; look.textContent = t === 'ivory' ? 'Dark look' : 'Light look'; };
  setLook(store.get('learn:look', 'dark'));
  look.addEventListener('click', () => { const t = document.documentElement.dataset.theme === 'ivory' ? 'dark' : 'ivory'; store.set('learn:look', t); setLook(t); });

  // Progress lives in this browser: { lab id: [step ids passed] }.
  const done = () => store.get('learn:done', {});
  const passedLab = (lab, d) => lab.steps.length > 0 && lab.steps.every((s) => (d[lab.id] || []).includes(s));
  const paint = () => {
    const d = done();
    for (const part of BOOT.parts) {
      const link = $(`[data-part="${part.id}"]`);
      if (!link) continue;
      const n = part.labs.filter((id) => passedLab(BOOT.labs[id], d)).length;
      $('b', link).textContent = `${n}/${part.labs.length}`;
      link.dataset.all = n === part.labs.length ? '1' : '';
    }
    for (const badge of $$('[data-status]')) {
      const lab = BOOT.labs[badge.dataset.status];
      const n = (d[lab.id] || []).filter((s) => lab.steps.includes(s)).length;
      badge.textContent = passedLab(lab, d) ? 'Passed' : n ? `${n} of ${lab.steps.length}` : 'Not started';
      badge.dataset.s = passedLab(lab, d) ? 'passed' : n ? 'going' : '';
    }
    for (const li of $$('[data-step]')) li.dataset.passed = (d[BOOT.lab] || []).includes(li.dataset.step) ? '1' : '';
  };
  const mark = (lab, step, ok) => { const d = done(); const set = new Set(d[lab] || []); if (ok) set.add(step); else set.delete(step); d[lab] = [...set]; store.set('learn:done', d); paint(); };
  paint();

  const form = $('[data-box]');
  const input = form && $('textarea', form);
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  // ---- Learn
  if (BOOT.mode === 'learn') {
    const thread = $('[data-thread]');
    // One line of an answer as nodes: text, `code` and [n] citations that open the page they came from.
    const inline = (parent, text, sources) => {
      let last = 0;
      const re = /`([^`]+)`|\[(\d+(?:\s*,\s*\d+)*)\]/g;
      const clean = text.replace(/\*\*/g, '');
      for (let m; (m = re.exec(clean)); ) {
        parent.append(clean.slice(last, m.index));
        if (m[1]) parent.append(el('code', '', m[1]));
        else for (const n of m[2].split(',').map((x) => Number(x))) {
          const src = sources.find((s) => s.n === n);
          if (!src) continue;
          const a = el('a', 'cite', String(n)); a.href = src.url; a.target = '_blank'; a.rel = 'noopener'; a.title = src.heading ? `${src.title} › ${src.heading}` : src.title;
          parent.append(a);
        }
        last = m.index + m[0].length;
      }
      parent.append(clean.slice(last));
    };
    const rich = (text, sources) => {
      const frag = document.createDocumentFragment();
      let list = null, code = null;
      for (const raw of text.split('\n')) {
        if (/^\s*```/.test(raw)) { if (code) { frag.append(code.parentNode); code = null; } else { code = el('code'); el('pre').append(code); } list = null; continue; }
        if (code) { code.textContent += (code.textContent ? '\n' : '') + raw; continue; }
        const line = raw.trim();
        if (!line) { list = null; continue; }
        const item = /^(\d+)[.)]\s+(.*)$/.exec(line) || /^([-*])\s+(.*)$/.exec(line);
        if (item) {
          const tag = /\d/.test(item[1]) ? 'OL' : 'UL';
          if (!list || list.tagName !== tag) { list = el(tag.toLowerCase()); frag.append(list); }
          inline(list.appendChild(el('li')), item[2], sources);
        } else { list = null; inline(frag.appendChild(el('p')), line.replace(/^#+\s*/, ''), sources); }
      }
      if (code) frag.append(code.parentNode);
      return frag;
    };
    const WHY = {
      off: 'Written answers are off on this site, so here are the closest passages from the docs.',
      budget: "Today's written answers are used up. Here are the closest passages from the docs.",
      down: 'The model did not answer. Here are the closest passages from the docs.',
      none: 'The model found no full answer. Here are the closest passages from the docs.',
    };
    const show = (box, data) => {
      box.textContent = '';
      if (data.error) { box.append(el('p', 'note', data.error)); return; }
      const sources = data.sources || [];
      if (data.notCovered) {
        const p = el('p', '', 'The Flisk docs do not cover that. Try other words, or ask the people who build Flisk: ');
        const a = el('a', '', 'Flisk on Discord'); a.href = 'https://discord.gg/qMu5Xn8Kaq'; p.append(a, '.');
        box.append(p);
      } else if (data.answer) box.append(rich(data.answer, sources));
      else {
        box.append(el('p', 'note', WHY[data.why] || WHY.none));
        for (const p of data.passages || []) { const b = el('div', 'passage'); const src = sources.find((s) => s.n === p.n); b.append(el('b', '', src ? `${src.title}${src.heading ? ` › ${src.heading}` : ''}\n` : ''), p.text); box.append(b); }
      }
      if (sources.length) {
        const row = el('div', 'sources');
        for (const s of sources) { const a = el('a', 'source'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; a.append(el('b', '', String(s.n)), s.heading ? `${s.title} › ${s.heading}` : s.title); row.append(a); }
        box.append(row);
      }
      if ((data.labs || []).length) {
        const row = el('div', 'next');
        for (const l of data.labs) { const a = el('a', 'btn ghost', `Practice this: ${l.title} (${l.minutes} min)`); a.href = `/practice/${l.id}`; row.append(a); }
        box.append(row);
      }
    };
    let busy = false;
    const askNow = async (question) => {
      if (busy || question.length < 3) return;
      busy = true; $('.send', form).disabled = true;
      document.querySelector('main').classList.add('talking');
      thread.append(el('div', 'q', question));
      const box = el('div', 'a'); box.append(el('p', 'note', 'Reading the docs…')); thread.append(box);
      input.value = '';
      show(box, await post('/api/ask', { question }));
      box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      busy = false; $('.send', form).disabled = false; input.focus();
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); askNow(input.value.trim()); });
    for (const chip of $$('[data-example]')) chip.addEventListener('click', () => askNow(chip.textContent));
  }

  // ---- Practice: the lab list narrows as you type
  if (BOOT.mode === 'practice' && !BOOT.lab) {
    const filter = () => {
      const asked = input.value.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
      let shown = 0;
      for (const row of $$('[data-labrow]')) { const ok = asked.every((w) => row.dataset.text.includes(w)); row.hidden = !ok; if (ok) shown += 1; }
      for (const part of $$('[data-partbox]')) part.hidden = !$$('[data-labrow]', part).some((r) => !r.hidden);
      $('[data-nolabs]').hidden = shown > 0;
      return shown;
    };
    input.addEventListener('input', filter);
    form.addEventListener('submit', (e) => { e.preventDefault(); if (filter() >= 1) { const first = $$('[data-labrow]').find((r) => !r.hidden); if (first && input.value.trim()) location.href = $('a', first).href; } });
  }

  // ---- Practice: one lab on the learner's computer
  if (BOOT.mode === 'practice' && BOOT.lab) {
    const LAB = BOOT.lab;
    const panel = $('[data-computer]');
    const say = (text, bad) => { const p = $('[data-say]', panel); p.textContent = text; p.dataset.bad = bad ? '1' : ''; };
    const term = $('[data-term]', panel);
    const print = (text) => { term.textContent += text; term.scrollTop = term.scrollHeight; };
    let computer = store.get('learn:computer', null);
    const state = (s) => {
      panel.dataset.state = s; $('[data-state-text]', panel).textContent = s;
      $('[data-shell]', panel).hidden = s !== 'running'; $('[data-stop]', panel).hidden = s !== 'running';
      const open = $('[data-open]', panel); if (open) { open.hidden = s === 'running'; open.disabled = s === 'starting'; }
    };
    const gone = (r) => {
      if (!r.gone) return false;
      computer = null; store.set('learn:computer', null); state('off');
      say('That computer has stopped, so the command did not run. Open a new one; your passed steps are kept.', true);
      return true;
    };
    const open = async () => {
      if (computer) return computer;
      if (!BOOT.login || !BOOT.computers) { say(BOOT.computers ? 'Sign in with GitHub to open a computer.' : 'Computers are not set up on this site yet.', true); return null; }
      state('starting'); say('Starting your computer…');
      const r = await post('/api/computer', { lab: LAB });
      if (r.needProvider) { state('off'); $('[data-connect]', panel).hidden = false; $('[data-open]', panel).hidden = true; say(''); return null; }
      if (r.error) { state('off'); say(r.error, true); return null; }
      computer = r.id; store.set('learn:computer', computer);
      state('running'); say(`Running${r.provider ? ` on ${r.provider}` : ''}. It is yours until you stop it.`);
      return computer;
    };
    if (computer && BOOT.login) { state('running'); say('Your computer from earlier is still open.'); }

    const openBtn = $('[data-open]', panel);
    if (openBtn) openBtn.addEventListener('click', open);
    $('[data-connect]', panel).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      const r = await post('/api/connect', { provider: f.provider.value, key: f.key.value });
      f.key.value = '';
      if (r.error) return say(r.error, true);
      f.hidden = true; open();
    });
    $('[data-stop]', panel).addEventListener('click', async () => {
      if (!computer) return;
      const r = await post('/api/stop', { computer });
      if (r.error) return say(r.error, true);
      computer = null; store.set('learn:computer', null); state('off'); say('Computer stopped. Your passed steps are kept.');
    });
    $('[data-line]', panel).addEventListener('submit', async (e) => {
      e.preventDefault();
      const field = e.currentTarget.command;
      const command = field.value.trim();
      if (!command || !computer) return;
      field.value = ''; field.disabled = true; print(`$ ${command}\n`);
      const r = await post('/api/run', { computer, lab: LAB, command });
      print(r.error ? `${r.error}\n` : `${r.output ? `${r.output}\n` : ''}${r.exitCode ? `(exit ${r.exitCode})\n` : ''}`);
      gone(r); field.disabled = false; field.focus();
    });

    // Files a step names open in a small editor and are saved onto the computer.
    const editor = $('[data-editor]', panel);
    let file = null;
    document.addEventListener('click', async (e) => {
      const fileBtn = e.target.closest('[data-file]');
      if (fileBtn) {
        if (!(await open())) return;
        file = fileBtn.dataset.file;
        const r = await post('/api/file', { computer, lab: LAB, path: file });
        if (r.error) { return gone(r) || say(r.error, true); }
        $('[data-editor-name]', editor).textContent = file + (r.fresh ? ' (new file)' : '');
        $('textarea', editor).value = r.content || ''; editor.hidden = false; $('textarea', editor).focus();
      }
      if (e.target.closest('[data-close]')) editor.hidden = true;
      if (e.target.closest('[data-save]') && file) {
        const r = await post('/api/file', { computer, lab: LAB, path: file, content: $('textarea', editor).value });
        if (r.error) { return gone(r) || say(r.error, true); }
        $('[data-editor-name]', editor).textContent = `${file} (saved)`; print(`saved ${file}\n`);
      }
      const check = e.target.closest('[data-check]');
      if (check) {
        const li = check.closest('[data-step]'), out = $('[data-out]', li), verdict = $('[data-verdict]', li);
        if (!(await open())) return;
        check.disabled = true; out.hidden = false; out.textContent = 'Running the check on your computer…'; verdict.hidden = true;
        const r = await post('/api/check', { computer, lab: LAB, step: check.dataset.check });
        check.disabled = false;
        if (r.error) { out.textContent = r.error; gone(r); return; }
        out.textContent = `$ ${r.command}\n${r.output || '(no output)'}`;
        verdict.hidden = false; verdict.dataset.ok = r.ok ? '1' : '0';
        verdict.textContent = r.ok ? 'exit 0 · step passed' : `exit ${r.exitCode} · not yet. You pass when: ${r.expect}`;
        mark(LAB, check.dataset.check, r.ok);
      }
    });
  }
}

// A miss should not cost a crawler the whole shell. The full page is about 32 KB
// because of the stylesheet, fonts and inline icon; this one is a few hundred bytes.
export function notFoundPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page not found - Flisk Learn</title>
<meta name="robots" content="noindex">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#EDEDEE;font:15px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#8D8D92;margin:0 0 1rem}a{color:#EDEDEE}</style>
</head>
<body><main><h1>Page not found</h1><p>There is nothing at this address.</p><a href="/">Go to Flisk Learn</a></main></body>
</html>`;
}

export function page({ mode = 'learn', lab = null, login = '', model = false, computers = false, notice = '' } = {}) {
  const boot = { mode, lab: lab?.id || null, login, model, computers, parts: PARTS.map((p) => ({ id: p.id, labs: p.labs })), labs: Object.fromEntries(LAB_CARDS.map((l) => [l.id, { id: l.id, steps: l.steps }])) };
  const title = lab ? `${lab.title} · Flisk Learn` : `${MODES[mode].label} · Flisk Learn`;
  const view = mode === 'exam' ? examView() : mode === 'practice' ? (lab ? labView(lab, login, computers) : labList()) : learnView();
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="Learn Flisk and AI engineering: answers from the docs, labs on your own computer, and an exam scored on real work.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23000'/%3E%3Cpath d='M9 8v16h14' fill='none' stroke='%23EDEDEE' stroke-width='3.5'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<style>${CSS}</style>
<script>try{var t=JSON.parse(localStorage.getItem('learn:look'));if(t==='ivory')document.documentElement.dataset.theme=t}catch(e){}</script>
<script src="https://flisk.si/assets/bar.js" defer></script>
<script defer data-domain="learn.flisk.si" src="https://flisk.sh/a.js"></script>
</head>
<body>
<div class="app">
${sidebar(login)}
<main>
  <div class="top"><button type="button" class="linkbtn" data-look>Light look</button></div>
  ${notice ? `<div class="col"><p class="notice" role="alert">${esc(notice)}</p></div>` : ''}
  ${view}
</main>
</div>
<script>(${client.toString()})(${inlineJson(boot)});</script>
</body>
</html>`;
}
