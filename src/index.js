// learn.flisk.si: one page with three modes.
//   Learn     answers from the Flisk docs, with the pages named. Needs no computer.
//   Practice  a lab's steps run on the learner's own Fleet computer, and each step's check runs there too.
//   Exam      not built yet: the page says what it will be.
import { githubAuthorizeUrl, githubLogin } from './auth.js';
import { answerMessages, askModel, finishAnswer, MAX_QUESTION, passagesFor, takeToday } from './answer.js';
import { fleetClient } from './fleet.js';
import { inLabDir, labById, labDir, labsFor, safeFile, stepOf } from './labs.js';
import { notFoundPage, page, PROVIDERS } from './page.js';
import { clearSession, makeSession, readSession, sameOrigin } from './session.js';

const MODES = ['learn', 'practice', 'exam'];
const ANSWERS_PER_DAY = 60; // written answers a day for everyone together; LEARN_AI_PER_DAY overrides it
const ANSWERS_PER_VISITOR = 12;
const MAX_BODY = 300_000;
const MAX_OUTPUT = 12_000;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const html = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' } });
const readJson = async (request) => {
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : null; } catch { return null; }
};
const tail = (s) => (s.length > MAX_OUTPUT ? `…\n${s.slice(-MAX_OUTPUT)}` : s);
const outputOf = (data) => tail([data.stdout, data.stderr].filter(Boolean).join('\n').trim());
const podId = (v) => (/^[A-Za-z0-9_.:-]{1,128}$/.test(String(v || '')) ? String(v) : null);
// The model writes answers only when this deployment can reach it.
const modelOn = (env) => Boolean(env.INFERENCE_KEY && (env.INFERENCE || env.INFERENCE_URL));

async function ask(request, env, { fetchImpl, cache }) {
  const body = await readJson(request);
  const question = String(body?.question || '').trim().slice(0, MAX_QUESTION);
  if (question.length < 3) return json(400, { error: 'Ask a question first.' });
  const passages = passagesFor(question);
  const labs = labsFor(question);
  const sources = passages.map(({ n, title, heading, url }) => ({ n, title, heading, url }));
  if (!passages.length) return json(200, { answer: null, notCovered: true, sources, passages: [], labs });
  // Without a written answer the learner still gets the three best passages to read.
  const read = { answer: null, sources, passages: passages.slice(0, 3).map(({ n, text }) => ({ n, text })), labs };
  if (!modelOn(env)) return json(200, { ...read, why: 'off' });
  const visitor = request.headers.get('cf-connecting-ip') || 'local';
  const perDay = Number(env.LEARN_AI_PER_DAY) || ANSWERS_PER_DAY;
  if (!(await takeToday(cache, `visitor/${visitor}`, ANSWERS_PER_VISITOR)) || !(await takeToday(cache, 'everyone', perDay))) return json(200, { ...read, why: 'budget' });
  let reply;
  try {
    reply = await askModel(env, answerMessages(question, passages), fetchImpl);
  } catch (err) {
    console.error('[ask] model call failed:', err.message);
    return json(200, { ...read, why: 'down' });
  }
  const done = finishAnswer(reply, passages);
  if (!done.text) return json(200, { ...read, why: 'none' });
  const cited = new Set((done.text.match(/\[(\d+)\]/g) || []).map((c) => Number(c.slice(1, -1))));
  return json(200, { answer: done.text, sources: sources.filter((s) => cited.has(s.n)).length ? sources.filter((s) => cited.has(s.n)) : sources, passages: [], labs });
}

// Everything Practice does on a computer. The learner is signed in; Fleet checks that the computer is theirs.
async function practice(path, request, env, login, fetchImpl) {
  if (!env.FLEET_SERVICE_SECRET) return json(503, { error: 'Computers are not set up on this site yet.' });
  const fleet = fleetClient(env, login, fetchImpl);
  const body = await readJson(request);
  if (!body) return json(400, { error: 'bad request' });

  if (path === '/api/connect') {
    const provider = PROVIDERS.find((p) => p.id === body.provider);
    const key = String(body.key || '').trim();
    if (!provider || key.length < 8) return json(400, { error: 'Pick a provider and paste its key.' });
    const r = await fleet.connect(provider.id, key);
    return r.error ? json(400, { error: r.error }) : json(200, { ok: true });
  }

  if (path === '/api/computer') {
    const connections = await fleet.connections().catch(() => ({}));
    if (!Object.keys(connections).length) return json(409, { error: 'Connect a computer provider first.', needProvider: true });
    const r = await fleet.start();
    if (r.error || !r.data.id) return json(r.status === 409 ? 409 : 502, { error: r.error || 'Fleet did not start a computer.', needProvider: r.status === 409 || undefined });
    return json(200, { id: r.data.id, provider: r.data.provider || '' });
  }

  const id = podId(body.computer);
  if (!id) return json(400, { error: 'Open a computer first.' });
  // Fleet's own words for a computer that is gone, so the page can offer a new one.
  const failed = (r) => json(r.status === 404 ? 410 : 502, { error: r.status === 404 ? 'That computer is gone. Open a new one.' : r.error, gone: r.status === 404 || undefined });

  if (path === '/api/stop') {
    const r = await fleet.stop(id);
    return r.error && r.status !== 404 ? failed(r) : json(200, { ok: true });
  }

  const lab = labById(body.lab);
  if (!lab) return json(404, { error: 'No such lab.' });

  // The check is the lab's own command, read here from the lab, never from the page: a step passes on the
  // computer's exit code, not on the learner's word.
  if (path === '/api/check') {
    const step = stepOf(lab, body.step);
    if (!step?.cmd) return json(404, { error: 'No such step.' });
    const r = await fleet.run(id, inLabDir(lab, step.cmd));
    if (r.error) return failed(r);
    const exitCode = Number(r.data.exitCode);
    return json(200, { ok: exitCode === 0, exitCode, command: step.cmd, output: outputOf(r.data), expect: step.expect });
  }

  if (path === '/api/run') {
    const command = String(body.command || '').trim();
    if (!command || command.length > 2000) return json(400, { error: 'Type a command.' });
    const r = await fleet.run(id, inLabDir(lab, command));
    return r.error ? failed(r) : json(200, { exitCode: Number(r.data.exitCode), output: outputOf(r.data) });
  }

  if (path === '/api/file') {
    const file = safeFile(body.path);
    if (!file) return json(400, { error: 'That file name is not allowed.' });
    const full = `${labDir(lab)}/${file}`;
    if (typeof body.content === 'string') {
      if (file.includes('/')) await fleet.run(id, `mkdir -p ${labDir(lab)}/${file.slice(0, file.lastIndexOf('/'))}`);
      else await fleet.run(id, `mkdir -p ${labDir(lab)}`);
      const r = await fleet.write(id, full, body.content);
      return r.error ? failed(r) : json(200, { ok: true });
    }
    const r = await fleet.read(id, full);
    // A file the learner has not written yet opens empty.
    if (r.status === 404 && !/pod|computer/i.test(r.error || '')) return json(200, { content: '', fresh: true });
    return r.error ? failed(r) : json(200, { content: String(r.data.content ?? '') });
  }
  return json(404, { error: 'not found' });
}

export async function handle(request, env, { fetchImpl = fetch, cache = globalThis.caches?.default } = {}) {
  const url = new URL(request.url);
  const path = url.pathname;
  const origin = env.PUBLIC_ORIGIN || url.origin;

  if (request.method === 'GET' || request.method === 'HEAD') {
    if (path === '/healthz') return new Response('ok');
    // The pages take no query string, so crawlers get no endless address space to walk.
    if (path === '/robots.txt') return new Response('User-agent: *\nDisallow: /*?\nDisallow: /api/\nDisallow: /auth/\n', { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } });

    if (path === '/auth/login') {
      if (!env.GITHUB_CLIENT_ID || !env.SESSION_SECRET) return html(page({ mode: 'practice', notice: 'Sign-in is not set up on this site yet.' }), 503);
      const state = crypto.randomUUID();
      const headers = new Headers({ location: githubAuthorizeUrl({ ...env, PUBLIC_ORIGIN: origin }, state) });
      headers.append('set-cookie', `learn_state=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
      return new Response(null, { status: 302, headers });
    }
    if (path === '/auth/callback') {
      const state = url.searchParams.get('state') || '';
      const cookie = /(?:^|;\s*)learn_state=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1] || '';
      const code = url.searchParams.get('code') || '';
      const login = env.SESSION_SECRET && code && state && state === cookie ? await githubLogin(env, code, fetchImpl) : null;
      if (!login) return html(page({ mode: 'practice', notice: 'Sign-in did not finish. Try again.' }), 400);
      const headers = new Headers({ location: '/practice' });
      headers.append('set-cookie', await makeSession(env, login));
      headers.append('set-cookie', 'learn_state=; Path=/auth; Max-Age=0');
      return new Response(null, { status: 302, headers });
    }

    const [, first = 'learn', second, extra] = path.split('/');
    const mode = path === '/' ? 'learn' : first;
    const session = env.DEV_LOGIN ? { login: env.DEV_LOGIN } : await readSession(env, request);
    const seen = { login: session?.login || '', model: modelOn(env), computers: Boolean(env.FLEET_SERVICE_SECRET) };
    if (!MODES.includes(mode) || extra !== undefined || (second !== undefined && mode !== 'practice')) return html(notFoundPage(), 404);
    const lab = second === undefined ? null : labById(second);
    if (second !== undefined && !lab) return html(notFoundPage(), 404);
    return html(page({ ...seen, mode, lab }));
  }

  if (request.method !== 'POST') return json(405, { error: 'GET or POST' });
  if (!sameOrigin(request, origin)) return json(403, { error: 'This request did not come from the site.' });
  if (path === '/auth/logout') return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': clearSession() } });
  if (path === '/api/ask') return ask(request, env, { fetchImpl, cache });
  if (['/api/connect', '/api/computer', '/api/check', '/api/run', '/api/file', '/api/stop'].includes(path)) {
    const session = env.DEV_LOGIN ? { login: env.DEV_LOGIN } : await readSession(env, request);
    if (!session) return json(401, { error: 'Sign in with GitHub to open a computer.', signIn: true });
    return practice(path, request, env, session.login, fetchImpl);
  }
  return json(404, { error: 'not found' });
}

export default {
  fetch: (request, env) => handle(request, env).catch((err) => {
    console.error('[learn]', err);
    return json(500, { error: 'Something broke on our side.' });
  }),
};
