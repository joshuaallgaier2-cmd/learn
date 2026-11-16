import { describe, expect, test } from 'bun:test';
import { answerMessages, finishAnswer, passagesFor, takeToday } from '../src/answer.js';
import { handle } from '../src/index.js';
import { inLabDir, LAB_CARDS, SETUP, labById, labsFor, safeFile } from '../src/labs.js';
import { buildIndex, search } from '../src/search.js';
import { makeSession } from '../src/session.js';

const ORIGIN = 'https://learn.flisk.si';
const LAB = LAB_CARDS[0].id;
const STEP = LAB_CARDS[0].steps[0];
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const memoryCache = () => { const m = new Map(); return { match: async (r) => (m.has(r.url) ? new Response(m.get(r.url)) : undefined), put: async (r, res) => { m.set(r.url, await res.text()); } }; };

const baseEnv = { PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 'test-secret', FLEET_SERVICE_SECRET: 'fleet-secret', FLEET_URL: 'https://fleet.test' };
const get = (path, env = baseEnv, headers = {}) => handle(new Request(`${ORIGIN}${path}`, { headers }), env, { fetchImpl: async () => reply(500, {}), cache: memoryCache() });
const post = async (path, body, { env = baseEnv, fetchImpl = async () => reply(500, {}), cookie = '', origin = ORIGIN, cache = memoryCache() } = {}) => {
  const res = await handle(new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, { fetchImpl, cache });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const signedIn = async (login = 'ada') => (await makeSession(baseEnv, login)).split(';')[0];

// A Fleet that records every call and answers from `answers[method path]`.
const fleet = (answers = {}) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const call = { method: init.method, path: u.pathname + u.search, body: init.body ? JSON.parse(init.body) : null, headers: init.headers };
    calls.push(call);
    const hit = answers[`${call.method} ${u.pathname}`];
    return hit ? reply(hit[0], hit[1]) : reply(200, {});
  };
  return { calls, fetchImpl };
};

describe('search', () => {
  const index = buildIndex(['flisk up starts the stack', 'the database migrator runs migrations', 'pizza in Naples']);
  test('ranks the section that holds the words first', () => {
    expect(search(index, 'how do migrations run')[0].i).toBe(1);
  });
  test('a question the texts do not hold finds nothing', () => {
    expect(search(index, 'best quantum violin tuning schedule')).toEqual([]);
  });
});

describe('the docs', () => {
  test('a Flisk question finds numbered passages with a page to open', () => {
    const passages = passagesFor('How do I add a backend service?');
    expect(passages.length).toBeGreaterThan(0);
    expect(passages[0].n).toBe(1);
    expect(passages[0].url).toStartWith('https://github.com/flisk-sh/flisk/blob/main/docs/');
  });
  test('an off-topic question finds nothing', () => {
    expect(passagesFor('best pizza in Naples')).toEqual([]);
  });
  test('the model is told to answer from the passages only', () => {
    const [system, user] = answerMessages('q?', [{ n: 1, title: 'T', heading: 'H', text: 'body' }]);
    expect(system.content).toContain('NOT COVERED');
    expect(user.content).toBe('[1] T › H\nbody\n\nQuestion: q?');
  });
});

describe('finishAnswer', () => {
  const passages = [{ text: 'Run flisk up to start the stack.' }];
  test('keeps an answer whose commands are in the passages', () => {
    expect(finishAnswer('Start it with flisk up and wait for the links. [1]', passages).text).toContain('flisk up');
  });
  test('drops a line with a command the docs never name', () => {
    const done = finishAnswer('Start the stack with flisk up, then wait. [1]\nThen run flisk teleport to finish.', passages);
    expect(done.dropped).toBe(1);
    expect(done.text).not.toContain('teleport');
  });
  test('NOT COVERED and an empty reply are no answer', () => {
    expect(finishAnswer('NOT COVERED', passages).text).toBeNull();
    expect(finishAnswer('', passages).text).toBeNull();
  });
});

describe('takeToday', () => {
  test('stops at the limit and starts again the next day', async () => {
    const cache = memoryCache();
    const day = Date.UTC(2026, 10, 15, 12);
    expect(await takeToday(cache, 'k', 2, day)).toBe(true);
    expect(await takeToday(cache, 'k', 2, day)).toBe(true);
    expect(await takeToday(cache, 'k', 2, day)).toBe(false);
    expect(await takeToday(cache, 'k', 2, day + 86400_000)).toBe(true);
  });
});

describe('labs', () => {
  test('a question about a lab topic offers that lab', () => {
    const lab = labById(LAB);
    expect(labsFor(lab.title).map((l) => l.id)).toContain(LAB);
  });
  test('a lab command runs in the lab folder', () => {
    expect(inLabDir(labById(LAB), 'ls')).toBe(`${SETUP}; mkdir -p labs/${LAB} && cd labs/${LAB} && set -a && { [ ! -f .env ] || . ./.env; } && set +a && ( ls\n)`);
  });
  test('file names stay inside the lab folder', () => {
    expect(safeFile('src/app.py')).toBe('src/app.py');
    for (const bad of ['../secret', '/etc/passwd', 'a/../../b', 'a//b', 'a b', '-rf', '']) expect(safeFile(bad)).toBeNull();
  });
});

describe('pages', () => {
  test('every mode loads Flisk Analytics in the head', async () => {
    for (const path of ['/', '/learn', '/practice', '/exam']) {
      const html = await (await get(path)).text();
      expect(html.slice(0, html.indexOf('</head>'))).toContain('<script defer data-domain="learn.flisk.si" src="https://flisk.sh/a.js"></script>');
    }
  });

  test('the three modes and a lab page open', async () => {
    for (const [path, words] of [['/', 'What do you want to learn?'], ['/learn', 'What do you want to learn?'], ['/practice', 'What do you want to practice?'], ['/exam', 'Ready to prove it?']]) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain(words);
    }
    const res = await get(`/practice/${LAB}`);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain(labById(LAB).title.replace(/&/g, '&amp;'));
    expect(text).toContain('Check step 1');
  });
  test('the switch marks the open mode', async () => {
    expect(await (await get('/practice')).text()).toContain('<a href="/practice" aria-current="page">Practice</a>');
  });
  test('Exam says it is not open yet', async () => {
    expect(await (await get('/exam')).text()).toContain('not open yet');
  });
  test('unknown pages and labs are 404', async () => {
    for (const path of ['/nope', '/practice/no-such-lab', '/learn/extra', `/practice/${LAB}/more`, '/practice/__proto__']) expect((await get(path)).status).toBe(404);
  });
  test('the 404 page is small, links home and keeps noindex', async () => {
    for (const path of ['/nope', '/practice/no-such-lab']) {
      const res = await get(path);
      expect(res.status).toBe(404);
      const body = await res.text();
      expect(body.length).toBeLessThan(4096);
      expect(body).toContain('<meta name="robots" content="noindex">');
      expect(body).toContain('<a href="/">Go to Flisk Learn</a>');
      expect(body).not.toContain('src="data:');
      expect(body).not.toContain('<script');
    }
  });
  test('a visitor is asked to sign in on a lab; a signed-in learner gets the open button', async () => {
    expect(await (await get(`/practice/${LAB}`)).text()).toContain('href="/auth/login">Sign in with GitHub</a>');
    const text = await (await get(`/practice/${LAB}`, baseEnv, { cookie: await signedIn() })).text();
    expect(text).toContain('data-open>Open a computer</button>');
    expect(text).toContain('Signed in as <b>ada</b>');
  });
  test('a site without Fleet says computers are not set up', async () => {
    expect(await (await get(`/practice/${LAB}`, { PUBLIC_ORIGIN: ORIGIN })).text()).toContain('Computers are not set up on this site yet');
  });
  test('the page script is valid JavaScript and its data cannot close the script tag', async () => {
    const text = await (await get(`/practice/${LAB}`)).text();
    const script = text.slice(text.lastIndexOf('<script>') + 8, text.lastIndexOf('</script>'));
    expect(script).not.toContain('</script');
    expect(() => new Function(script)).not.toThrow();
  });
  test('robots.txt keeps crawlers off query strings and the API', async () => {
    const text = await (await get('/robots.txt')).text();
    expect(text).toContain('Disallow: /*?');
    expect(text).toContain('Disallow: /api/');
  });
});

describe('sign-in', () => {
  test('login sends the visitor to GitHub with a state cookie', async () => {
    const res = await get('/auth/login', { ...baseEnv, GITHUB_CLIENT_ID: 'cid' });
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('location'));
    expect(to.host).toBe('github.com');
    expect(to.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/auth/callback`);
    expect(res.headers.get('set-cookie')).toContain(`learn_state=${to.searchParams.get('state')}`);
  });
  test('login without a GitHub app says so', async () => {
    expect((await get('/auth/login')).status).toBe(503);
  });
  test('the callback needs the state it handed out', async () => {
    const env = { ...baseEnv, GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 's' };
    const github = async (url) => (String(url).includes('access_token') ? reply(200, { access_token: 't' }) : reply(200, { login: 'ada' }));
    const wrong = await handle(new Request(`${ORIGIN}/auth/callback?code=c&state=x`, { headers: { cookie: 'learn_state=y' } }), env, { fetchImpl: github });
    expect(wrong.status).toBe(400);
    const right = await handle(new Request(`${ORIGIN}/auth/callback?code=c&state=x`, { headers: { cookie: 'learn_state=x' } }), env, { fetchImpl: github });
    expect(right.status).toBe(302);
    expect(right.headers.get('location')).toBe('/practice');
    expect(right.headers.get('set-cookie')).toContain('learn_sess=ada.');
  });
  test('a changed cookie is not a session', async () => {
    const cookie = (await signedIn('ada')).replace('ada.', 'eve.');
    expect((await post('/api/computer', {}, { cookie })).status).toBe(401);
  });
});

describe('POST /api/ask', () => {
  const modelEnv = { ...baseEnv, INFERENCE_URL: 'https://model.test/v1/chat/completions', INFERENCE_KEY: 'k' };
  const model = (content, status = 200) => async () => reply(status, { choices: [{ message: { content } }] });
  const question = 'How do I add a backend service?';

  test('posts from another site are refused', async () => {
    expect((await post('/api/ask', { question }, { origin: 'https://evil.test' })).status).toBe(403);
  });
  test('an empty question is refused', async () => {
    expect((await post('/api/ask', { question: ' ' })).status).toBe(400);
  });
  test('with the model off the learner gets passages and their pages', async () => {
    const { status, body } = await post('/api/ask', { question });
    expect(status).toBe(200);
    expect(body.answer).toBeNull();
    expect(body.why).toBe('off');
    expect(body.passages.length).toBeGreaterThan(0);
    expect(body.sources[0].url).toStartWith('https://github.com/flisk-sh/flisk/');
  });
  test('a written answer comes back with only the pages it cites', async () => {
    const { body } = await post('/api/ask', { question }, { env: modelEnv, fetchImpl: model('Create the service folder and describe it in service.json, then start the stack. [2]') });
    expect(body.answer).toContain('service.json');
    expect(body.sources.map((s) => s.n)).toEqual([2]);
    expect(body.passages).toEqual([]);
  });
  test('the model is sent the passages and the key', async () => {
    let sent;
    await post('/api/ask', { question }, { env: modelEnv, fetchImpl: async (url, init) => { sent = { url, init }; return reply(200, { choices: [{ message: { content: 'NOT COVERED' } }] }); } });
    expect(sent.url).toBe(modelEnv.INFERENCE_URL);
    expect(sent.init.headers.authorization).toBe('Bearer k');
    expect(JSON.parse(sent.init.body).messages[1].content).toContain(`Question: ${question}`);
  });
  test('a model that is down, or has no answer, falls back to the passages', async () => {
    const down = await post('/api/ask', { question }, { env: modelEnv, fetchImpl: model('', 503) });
    expect(down.body.why).toBe('down');
    expect(down.body.passages.length).toBeGreaterThan(0);
    const none = await post('/api/ask', { question }, { env: modelEnv, fetchImpl: model('NOT COVERED') });
    expect(none.body.why).toBe('none');
  });
  test('past the day budget the answer is the passages, and the model is not called', async () => {
    const cache = memoryCache();
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return reply(200, { choices: [{ message: { content: 'Describe the service in service.json and start the stack again. [1]' } }] }); };
    const env = { ...modelEnv, LEARN_AI_PER_DAY: '1' };
    expect((await post('/api/ask', { question }, { env, fetchImpl, cache })).body.answer).toBeTruthy();
    const second = await post('/api/ask', { question }, { env, fetchImpl, cache });
    expect(second.body.why).toBe('budget');
    expect(calls).toBe(1);
  });
  test('a question the docs do not cover says so, without the model', async () => {
    let calls = 0;
    const { body } = await post('/api/ask', { question: 'best pizza in Naples' }, { env: modelEnv, fetchImpl: async () => { calls += 1; return reply(200, {}); } });
    expect(body.notCovered).toBe(true);
    expect(calls).toBe(0);
  });
});

describe('Practice on a Fleet computer', () => {
  test('every computer route needs a signed-in learner', async () => {
    for (const path of ['/api/connect', '/api/computer', '/api/check', '/api/run', '/api/file', '/api/stop']) {
      const { status, body } = await post(path, {});
      expect(status).toBe(401);
      expect(body.signIn).toBe(true);
    }
  });
  test('without the Fleet secret the routes say computers are not set up', async () => {
    const env = { PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 'test-secret' };
    expect((await post('/api/computer', {}, { env, cookie: await signedIn() })).status).toBe(503);
  });
  test('a learner with no provider is asked to connect one, and no computer is started', async () => {
    const f = fleet({ 'GET /v1/connections': [200, { connections: {} }] });
    const { status, body } = await post('/api/computer', {}, { cookie: await signedIn(), fetchImpl: f.fetchImpl });
    expect(status).toBe(409);
    expect(body.needProvider).toBe(true);
    expect(f.calls.some((c) => c.method === 'POST')).toBe(false);
  });
  test('connect sends the key to Fleet for a known provider only', async () => {
    const f = fleet();
    const cookie = await signedIn();
    expect((await post('/api/connect', { provider: 'nope', key: 'a-long-test-key' }, { cookie, fetchImpl: f.fetchImpl })).status).toBe(400);
    expect(f.calls.length).toBe(0);
    expect((await post('/api/connect', { provider: 'e2b', key: 'a-long-test-key' }, { cookie, fetchImpl: f.fetchImpl })).status).toBe(200);
    expect(f.calls[0]).toMatchObject({ method: 'PUT', path: '/v1/connections/e2b', body: { key: 'a-long-test-key' } });
  });
  test('opening a computer goes to Fleet in the learner\'s name', async () => {
    const f = fleet({ 'GET /v1/connections': [200, { connections: { e2b: {} } }], 'POST /v1/pods': [200, { id: 'pod-1', provider: 'e2b' }] });
    const { status, body } = await post('/api/computer', {}, { cookie: await signedIn('ada'), fetchImpl: f.fetchImpl });
    expect(status).toBe(200);
    expect(body).toEqual({ id: 'pod-1', provider: 'e2b' });
    const start = f.calls.find((c) => c.method === 'POST');
    expect(start.headers.authorization).toBe('Bearer fleet-secret');
    expect(start.headers['x-on-behalf-of']).toBe('ada');
  });
  test('a check runs the lab\'s own command, whatever the page sends, and passes on exit 0', async () => {
    const f = fleet({ 'POST /v1/pods/pod-1/run': [200, { exitCode: 0, stdout: 'fine', stderr: '' }] });
    const { body } = await post('/api/check', { computer: 'pod-1', lab: LAB, step: STEP, command: 'true', cmd: 'true' }, { cookie: await signedIn(), fetchImpl: f.fetchImpl });
    const step = labById(LAB).steps[0];
    expect(f.calls[0].body.command).toBe(inLabDir(labById(LAB), step.cmd));
    expect(body).toMatchObject({ ok: true, exitCode: 0, command: step.cmd, output: 'fine' });
  });
  test('a check that exits with anything else does not pass', async () => {
    const f = fleet({ 'POST /v1/pods/pod-1/run': [200, { exitCode: 2, stdout: '', stderr: 'no such file' }] });
    const { body } = await post('/api/check', { computer: 'pod-1', lab: LAB, step: STEP }, { cookie: await signedIn(), fetchImpl: f.fetchImpl });
    expect(body.ok).toBe(false);
    expect(body.output).toBe('no such file');
    expect(body.expect).toBe(labById(LAB).steps[0].expect);
  });
  test('an unknown lab or step is 404 and nothing runs', async () => {
    const f = fleet();
    const cookie = await signedIn();
    expect((await post('/api/check', { computer: 'pod-1', lab: 'nope', step: STEP }, { cookie, fetchImpl: f.fetchImpl })).status).toBe(404);
    expect((await post('/api/check', { computer: 'pod-1', lab: LAB, step: 'nope' }, { cookie, fetchImpl: f.fetchImpl })).status).toBe(404);
    expect(f.calls.length).toBe(0);
  });
  test('a typed command runs in the lab folder', async () => {
    const f = fleet({ 'POST /v1/pods/pod-1/run': [200, { exitCode: 0, stdout: 'a\nb' }] });
    const { body } = await post('/api/run', { computer: 'pod-1', lab: LAB, command: 'ls' }, { cookie: await signedIn(), fetchImpl: f.fetchImpl });
    expect(f.calls[0].body.command).toBe(inLabDir(labById(LAB), 'ls'));
    expect(body).toEqual({ exitCode: 0, output: 'a\nb' });
  });
  test('a file is saved inside the lab folder; a path that leaves it is refused', async () => {
    const f = fleet();
    const cookie = await signedIn();
    expect((await post('/api/file', { computer: 'pod-1', lab: LAB, path: '../../etc/passwd', content: 'x' }, { cookie, fetchImpl: f.fetchImpl })).status).toBe(400);
    expect(f.calls.length).toBe(0);
    expect((await post('/api/file', { computer: 'pod-1', lab: LAB, path: 'src/app.py', content: 'print(1)' }, { cookie, fetchImpl: f.fetchImpl })).status).toBe(200);
    expect(f.calls.at(-1)).toMatchObject({ method: 'PUT', body: { path: `labs/${LAB}/src/app.py`, content: 'print(1)' } });
  });
  test('a file not written yet opens empty', async () => {
    const f = fleet({ 'GET /v1/pods/pod-1/files': [404, { error: 'no such file' }] });
    const { status, body } = await post('/api/file', { computer: 'pod-1', lab: LAB, path: 'app.py' }, { cookie: await signedIn(), fetchImpl: f.fetchImpl });
    expect(status).toBe(200);
    expect(body).toEqual({ content: '', fresh: true });
  });
  test('a computer that is gone is reported as gone', async () => {
    const f = fleet({ 'POST /v1/pods/pod-9/run': [404, { error: 'pod not found' }] });
    const { status, body } = await post('/api/run', { computer: 'pod-9', lab: LAB, command: 'ls' }, { cookie: await signedIn(), fetchImpl: f.fetchImpl });
    expect(status).toBe(410);
    expect(body.gone).toBe(true);
  });
  test('a computer id that is not an id never reaches Fleet', async () => {
    const f = fleet();
    expect((await post('/api/run', { computer: '../v1/keys', lab: LAB, command: 'ls' }, { cookie: await signedIn(), fetchImpl: f.fetchImpl })).status).toBe(400);
    expect(f.calls.length).toBe(0);
  });
  test('stop deletes the computer', async () => {
    const f = fleet();
    expect((await post('/api/stop', { computer: 'pod-1' }, { cookie: await signedIn(), fetchImpl: f.fetchImpl })).status).toBe(200);
    expect(f.calls[0]).toMatchObject({ method: 'DELETE', path: '/v1/pods/pod-1' });
  });
});
