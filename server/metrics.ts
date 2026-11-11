// Métricas de la beta, calculadas a partir de eventos de listas cerradas. Función pura: se prueba sin base de datos.
// Regla de oro: cada porcentaje sale CON su base (n) y su intervalo de confianza del 95 % (Wilson). Con pocos usuarios, el margen es enorme y el tablero lo dice.
import { median, quantile, wilson } from '../src/radarBacktest';
import { AI_TOOLS, FEATURES } from '../src/telemetry';
import { tierOf } from '../src/tiers';

export interface RawMetrics {
  users: number; consentYes: number; consentNo: number;
  activity: Array<{ user_id: string; day: string; n: number }>;
  firstDay: Array<{ user_id: string; day: string }>;
  byName: Array<{ name: string; n: number; u: number }>;
  rows: Array<{ user_id: string; day: string; name: string; props: string | null }>;
  feedback: Array<{ id: number; user_id: string; ts: number; kind: string; score: number | null; text: string | null; version: string | null }>;
  calls?: Array<{ model: string; plan: string; n: number }>;   // pedidos a Gemini por modelo y por plan de quien los hizo (para ver qué nivel respondió de verdad)
  interest?: Record<string, number>;              // votos "me interesa": personas por clave ("feature:cartera"); un voto por persona y función
}
export const METRIC_EVENT_NAMES = ['ai_send', 'ai_done', 'ai_error', 'ai_rate', 'quota_block', 'asset_open', 'search_miss', 'fakedoor', 'chart_tool', 'screen', 'upsell', 'stress_view', 'move_view', 'plan_saved', 'watch', 'intro_step'];

export interface Prop { k: number; n: number; rate: number | null; lo: number | null; hi: number | null }
export const prop = (k: number, n: number): Prop => { const [lo, hi] = wilson(k, n); return { k, n, rate: n ? k / n : null, lo: n ? lo : null, hi: n ? hi : null }; };
export const addDays = (day: string, k: number): string => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
const P = (s: string | null): Record<string, any> => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
const top = <T,>(m: Map<string, T>, score: (v: T) => number, n = 15) => [...m].sort((a, b) => score(b[1]) - score(a[1])).slice(0, n);

export function computeMetrics(raw: RawMetrics, today: string, days: number) {
  const since = addDays(today, -(days - 1)), eventUsers = new Set(raw.firstDay.map((f) => f.user_id)), nEvU = eventUsers.size;
  const act = new Map<string, Set<string>>();                                            // usuario → días activos
  for (const a of raw.activity) (act.get(a.user_id) ?? act.set(a.user_id, new Set()).get(a.user_id)!).add(a.day);
  const inWindow = raw.activity.filter((a) => a.day >= since);
  // ---- usuarios activos por día, semana y mes
  const dau = Array.from({ length: days }, (_, i) => { const d = addDays(since, i); return { day: d, users: new Set(raw.activity.filter((a) => a.day === d).map((a) => a.user_id)).size }; });
  const uniq = (from: string) => new Set(raw.activity.filter((a) => a.day >= from && a.day <= today).map((a) => a.user_id)).size;
  const wau = uniq(addDays(today, -6)), mau = uniq(addDays(today, -29)), dauToday = dau[dau.length - 1]?.users ?? 0;
  // ---- retención por cohortes (cohorte = día del primer evento). D1 = volvió al día siguiente; D7 = volvió exactamente al día 7; Semana 2 = volvió algún día entre el 7 y el 13
  const r = { d1: [0, 0], d7: [0, 0], w2: [0, 0] }, byCohort = new Map<string, { size: number; d1: number; d7: number; w2: number; e1: number; e7: number; e13: number }>();
  for (const f of raw.firstDay) {
    const set = act.get(f.user_id) ?? new Set<string>(), c = byCohort.get(f.day) ?? { size: 0, d1: 0, d7: 0, w2: 0, e1: 0, e7: 0, e13: 0 };
    c.size++;
    if (f.day <= addDays(today, -1)) { r.d1[1]++; c.e1++; if (set.has(addDays(f.day, 1))) { r.d1[0]++; c.d1++; } }
    if (f.day <= addDays(today, -7)) { r.d7[1]++; c.e7++; if (set.has(addDays(f.day, 7))) { r.d7[0]++; c.d7++; } }
    if (f.day <= addDays(today, -13)) { r.w2[1]++; c.e13++; if (Array.from({ length: 7 }, (_, i) => addDays(f.day, 7 + i)).some((d) => set.has(d))) { r.w2[0]++; c.w2++; } }
    byCohort.set(f.day, c);
  }
  const retention = { d1: prop(r.d1[0], r.d1[1]), d7: prop(r.d7[0], r.d7[1]), w2: prop(r.w2[0], r.w2[1]),
    cohorts: [...byCohort].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 14).map(([day, c]) => ({ day, size: c.size, d1: c.e1 ? `${c.d1}/${c.e1}` : '—', d7: c.e7 ? `${c.d7}/${c.e7}` : '—', w2: c.e13 ? `${c.w2}/${c.e13}` : '—' })) };
  // ---- días activos por usuario (intensidad de uso)
  const daysPer = [...act].map(([, s]) => [...s].filter((d) => d >= since).length).filter((n) => n > 0);
  // ---- adopción de funciones
  const adoption = raw.byName.map((b) => ({ name: b.name, users: b.u, events: b.n, ...prop(b.u, nEvU) })).sort((a, b) => b.users - a.users);
  const by = (name: string) => raw.rows.filter((x) => x.name === name);
  // ---- asistente de IA
  const sends = by('ai_send'), done = by('ai_done'), errs = by('ai_error'), rates = by('ai_rate'), blocks = by('quota_block');
  const perUser = new Map<string, number>(); for (const s of sends) perUser.set(s.user_id, (perUser.get(s.user_id) ?? 0) + 1);
  const dist = (f: (n: number) => boolean) => [...perUser.values()].filter(f).length;
  const tools = new Map<string, { users: Set<string>; n: number }>();
  for (const d of done) for (const t of String(P(d.props).tools ?? '').split(',').filter(Boolean)) { const e = tools.get(t) ?? { users: new Set<string>(), n: 0 }; e.users.add(d.user_id); e.n++; tools.set(t, e); }
  const ms = done.map((d) => P(d.props).ms).filter((x) => typeof x === 'number') as number[];
  const countBy = (rows: typeof sends, key: string) => { const m: Record<string, number> = {}; for (const x of rows) { const v = String(P(x.props)[key] ?? '—'); m[v] = (m[v] ?? 0) + 1; } return m; };
  const checked = done.reduce((s, d) => s + (P(d.props).checked ?? 0), 0), unverified = done.reduce((s, d) => s + (P(d.props).unverified ?? 0), 0);
  const up = rates.filter((x) => P(x.props).rating === 'up').length, down = rates.filter((x) => P(x.props).rating === 'down').length;
  const usersSent = perUser.size, firstSendByUser = new Map<string, string>(); for (const s of sends) if (!firstSendByUser.has(s.user_id) || s.day < firstSendByUser.get(s.user_id)!) firstSendByUser.set(s.user_id, s.day);
  const ai = {
    sends: sends.length, users: prop(usersSent, nEvU), perUserPerActiveDay: inWindow.length ? sends.length / new Set(inWindow.map((a) => `${a.user_id}|${a.day}`)).size : null,
    usage: { once: dist((n) => n === 1), few: dist((n) => n >= 2 && n <= 4), some: dist((n) => n >= 5 && n <= 9), heavy: dist((n) => n >= 10) },
    sources: countBy(sends, 'src'), chats: countBy(sends, 'chat'), lengths: countBy(sends, 'len'),
    completed: prop(done.length, sends.length), errors: countBy(errs, 'kind'), errorCount: errs.length, quotaBlocks: blocks.length, quotaBlockUsers: new Set(blocks.map((b) => b.user_id)).size,
    latencyMs: ms.length ? { median: Math.round(median(ms)), p90: Math.round(quantile(ms, 0.9)), n: ms.length } : null,
    avgSteps: done.length ? done.reduce((s, d) => s + (P(d.props).steps ?? 0), 0) / done.length : null,
    verifier: { answers: done.length, figuresChecked: checked, figuresUnverified: unverified, fixedShare: prop(done.filter((d) => P(d.props).fixed === true).length, done.length) },
    tools: top(tools, (v) => v.n, 14).map(([name, v]) => ({ name, uses: v.n, users: v.users.size })),
    unusedTools: AI_TOOLS.filter((t) => !tools.has(t)),
    rating: { up, down, reasons: countBy(rates.filter((x) => P(x.props).rating === 'down'), 'reason'), helpful: prop(up, up + down) },
    // Nivel que respondió de verdad. En los planes de pago el nivel esperado es Avanzado: si contesta el Rápido, el nivel del plan estaba saturado (o no disponible).
    tiers: (() => {
      const by = { rapido: 0, avanzado: 0, profundo: 0, otro: 0 } as Record<string, number>; let paid = 0, paidLow = 0;
      for (const c of raw.calls ?? []) { const k = tierOf(c.model) ?? 'otro'; by[k] += c.n; if (c.plan === 'plus' || c.plan === 'pro') { paid += c.n; if (k === 'rapido') paidLow += c.n; } }
      return { calls: by, total: Object.values(by).reduce((s, x) => s + x, 0), paidFellBack: prop(paidLow, paid) };
    })(),
    usedAiOnFirstDay: prop(raw.firstDay.filter((f) => firstSendByUser.get(f.user_id) === f.day).length, raw.firstDay.length),
  };
  // ---- qué piden: activos que abren, búsquedas sin resultado, funciones que les interesan
  const syms = new Map<string, { users: Set<string>; n: number; group: string }>(), miss = new Map<string, { users: Set<string>; n: number }>();
  for (const x of by('asset_open')) { const p = P(x.props), e = syms.get(p.sym) ?? { users: new Set<string>(), n: 0, group: p.group }; e.users.add(x.user_id); e.n++; syms.set(p.sym, e); }
  for (const x of by('search_miss')) { const q = P(x.props).q, e = miss.get(q) ?? { users: new Set<string>(), n: 0 }; e.users.add(x.user_id); e.n++; miss.set(q, e); }
  const fd = Object.fromEntries(FEATURES.map((f) => [f, { views: new Set<string>(), interest: new Set<string>() }]));
  for (const x of by('fakedoor')) { const p = P(x.props); if (fd[p.feature]) (p.action === 'interest' ? fd[p.feature].interest : fd[p.feature].views).add(x.user_id); }
  const needs = {
    topAssets: top(syms, (v) => v.users.size).map(([sym, v]) => ({ sym, group: v.group, users: v.users.size, opens: v.n })),
    searchMisses: top(miss, (v) => v.users.size).map(([q, v]) => ({ q, users: v.users.size, searches: v.n })),
    // Votos explícitos (tabla de interés, un voto por persona y función; no dependen de las estadísticas). Base: todos los usuarios registrados. "saw" = cuántos de los que aceptaron estadísticas vieron la lista.
    features: FEATURES.map((f) => { const votes = raw.interest?.[`feature:${f}`] ?? 0; return { feature: f, votes, saw: fd[f].views.size, ...prop(votes, raw.users) }; }).sort((a, b) => b.votes - a.votes),
    chartTools: top(new Map(Object.entries(by('chart_tool').reduce((m: Record<string, Set<string>>, x) => { const p = P(x.props); if (p.on) (m[p.tool] ??= new Set()).add(x.user_id); return m; }, {}))), (v) => (v as Set<string>).size, 12).map(([tool, v]) => ({ tool, users: (v as Set<string>).size })),
    screens: countBy(by('screen'), 'name'),
  };
  // ---- comentarios y NPS
  const nps = raw.feedback.filter((f) => f.kind === 'nps' && f.score !== null).map((f) => f.score as number);
  const prom = nps.filter((s) => s >= 9).length, det = nps.filter((s) => s <= 6).length;
  const feedback = {
    total: raw.feedback.length, byKind: raw.feedback.reduce((m: Record<string, number>, f) => { m[f.kind] = (m[f.kind] ?? 0) + 1; return m; }, {}),
    nps: { n: nps.length, promoters: prom, passives: nps.length - prom - det, detractors: det, score: nps.length ? Math.round(((prom - det) / nps.length) * 100) : null, mean: nps.length ? nps.reduce((s, x) => s + x, 0) / nps.length : null },
    latest: raw.feedback.slice(0, 40).map((f) => ({ id: f.id, user: f.user_id.slice(0, 6), ts: f.ts, kind: f.kind, score: f.score, text: f.text, version: f.version })),
  };
  const warnings: string[] = [];
  if (nEvU < 30) warnings.push(`Muestra chica: solo ${nEvU} usuarios con datos. Cada porcentaje tiene un margen de error muy grande (mirá el intervalo); sirve para detectar problemas grandes, no para decidir por diferencias chicas.`);
  if (raw.consentYes + raw.consentNo < raw.users * 0.5) warnings.push('Menos de la mitad de los usuarios respondió la pregunta de estadísticas: los datos pueden no representar a todos.');
  return {
    today, days, since,
    users: { registered: raw.users, withData: nEvU, consentYes: raw.consentYes, consentNo: raw.consentNo, undecided: Math.max(0, raw.users - raw.consentYes - raw.consentNo) },
    active: { dauToday, wau, mau, stickiness: wau ? dauToday / wau : null, dau },
    intensity: { activeDaysMedian: daysPer.length ? median(daysPer) : null, usersWith3PlusDays: prop(daysPer.filter((n) => n >= 3).length, nEvU) },
    retention, adoption, ai, needs, feedback, warnings,
  };
}
