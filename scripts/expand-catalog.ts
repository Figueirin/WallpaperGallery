/** Bounded, resumable discovery. Writes only private staging; publication remains a separate validated step. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeSteamWorkshopItem, loadLocalEnv, WALLPAPER_ENGINE_APP_ID, STEAM_QUERY, type SteamPublishedFileRaw } from './sync-workshop.ts';
import { ModerationPipeline } from '../src/services/moderation/moderationPipeline.ts';
import { isWallpaperItem } from '../src/utils/validateWallpaper.ts';
import type { WallpaperItem } from '../src/types/wallpaper.ts';

export type Source = 'popular' | 'recent';
export interface CursorBatch { publishedfiledetails: SteamPublishedFileRaw[]; next_cursor?: string; }
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export async function fetchCursorBatch(options: { apiKey: string; source: Source; cursor: string; count: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> }): Promise<CursorBatch> {
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 100) throw new Error('Lote deve conter 1–100 candidatos');
  const params = new URLSearchParams({ key: options.apiKey, appid: String(WALLPAPER_ENGINE_APP_ID), query_type: String(STEAM_QUERY[options.source]), cursor: options.cursor, numperpage: String(options.count), return_previews: 'true', return_tags: 'true', return_vote_data: 'true', return_metadata: 'true' });
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response | undefined;
    try { response = await (options.fetchImpl ?? fetch)(`https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?${params}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000), redirect: 'error' }); } catch { /* Do not propagate URLs or transport exception details. */ }
    if (response?.ok) {
      let body;
      try { body = await response.json(); } catch { throw new Error('Steam: JSON inválido'); }
      if (!Array.isArray(body?.response?.publishedfiledetails)) throw new Error('Steam: resposta incompleta');
      if (body.response.publishedfiledetails.length > options.count) throw new Error('Steam: lote excede limite solicitado');
      return body.response;
    }
    if (response && response.status !== 429 && response.status < 500) throw new Error(`Steam: HTTP ${response.status}`);
    if (attempt === 2) throw new Error('Steam: falha persistente após 3 tentativas');
    const retryAfter = Number(response?.headers.get('retry-after'));
    await (options.sleep ?? delay)(Math.max(750 * 2 ** attempt, Number.isFinite(retryAfter) ? Math.min(60000, retryAfter * 1000) : 0));
  }
  throw new Error('Steam: sem resposta');
}

export interface ExpansionState {
  version: number;
  catalogHash: string;
  policyHash: string;
  target: number;
  maxCandidates: number;
  startedAt: string;
  requests: number;
  examined: number;
  duplicates: number;
  rejected: number;
  reasons: Record<string, number>;
  sources: Record<Source, { examined: number; added: number; duplicates: number; rejected: number; cursor: string; cursors: string[]; ids: string[]; exhausted: boolean }>;
  seen: string[];
  added: WallpaperItem[];
}
export function newExpansionState(existing: WallpaperItem[], target: number, maxCandidates: number, catalogHash = '', policyHash = ''): ExpansionState {
  if (!Number.isSafeInteger(target) || target < existing.length || !Number.isSafeInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 25000) throw new Error('Meta/limite inválidos (máximo 25.000 candidatos)');
  const source = () => ({ examined: 0, added: 0, duplicates: 0, rejected: 0, cursor: '*', cursors: [] as string[], ids: [] as string[], exhausted: false });
  return { version: 2, catalogHash, policyHash, target, maxCandidates, startedAt: new Date().toISOString(), requests: 0, examined: 0, duplicates: 0, rejected: 0, reasons: {}, sources: { popular: source(), recent: source() }, seen: existing.map(w => w.id), added: [] };
}
export function acceptBatch(state: ExpansionState, source: Source, batch: CursorBatch, pipeline: ModerationPipeline, existingCount: number): void {
  const stream = state.sources[source];
  const seen = new Set(state.seen), sourceIds = new Set(stream.ids);
  let advanced = 0;
  const reject = (reasons: string[]) => { state.rejected++; stream.rejected++; for (const reason of new Set(reasons)) state.reasons[reason] = (state.reasons[reason] ?? 0) + 1; };
  for (const raw of batch.publishedfiledetails) {
    if (state.examined >= state.maxCandidates || existingCount + state.added.length >= state.target) break;
    state.examined++; stream.examined++;
    const id = typeof raw?.publishedfileid === 'string' ? raw.publishedfileid : '';
    if (id && !sourceIds.has(id)) { sourceIds.add(id); advanced++; }
    if (!/^[1-9]\d*$/.test(id) || BigInt(id) > 18446744073709551615n) { reject(['invalid_id']); continue; }
    if (seen.has(id)) { state.duplicates++; stream.duplicates++; continue; }
    seen.add(id);
    if ((raw.result !== undefined && raw.result !== 1) || raw.banned || (raw.visibility !== undefined && raw.visibility !== 0) || raw.consumer_appid !== WALLPAPER_ENGINE_APP_ID) { reject(['unavailable_or_wrong_app']); continue; }
    if (typeof raw.title !== 'string' || !raw.title.trim() || typeof raw.preview_url !== 'string') { reject(['missing_metadata']); continue; }
    try { const preview = new URL(raw.preview_url); if (preview.protocol !== 'https:' || preview.username || preview.password) throw new Error(); } catch { reject(['invalid_preview_url']); continue; }
    let item: WallpaperItem;
    try { item = normalizeSteamWorkshopItem(raw); } catch { reject(['invalid_metadata']); continue; }
    if (!isWallpaperItem(item) || item.isSimulated) { reject(['invalid_metadata']); continue; }
    const decision = pipeline.evaluateItem(item);
    if (decision.status !== 'safe') { reject(decision.reasons.map(reason => reason.category)); continue; }
    state.added.push(item); stream.added++;
  }
  state.seen = [...seen]; stream.ids = [...sourceIds];
  const next = batch.next_cursor;
  if (!batch.publishedfiledetails.length || !advanced || !next || next === stream.cursor || stream.cursors.includes(next)) stream.exhausted = true;
  stream.cursors.push(stream.cursor);
  if (next) stream.cursor = next;
}
export function chooseSource(state: ExpansionState): Source | null {
  const available = (['popular', 'recent'] as Source[]).filter(source => !state.sources[source].exhausted);
  if (available.length < 2) return available[0] ?? null;
  return state.examined === 0 || state.sources.popular.examined / state.examined < 0.7 ? 'popular' : 'recent';
}

const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export async function main() {
  loadLocalEnv();
  const args = process.argv.slice(2);
  if (!args.includes('--authorize-real-expansion')) throw new Error('Expansão real exige --authorize-real-expansion');
  if (args.some(arg => arg !== '--authorize-real-expansion' && !['--target=', '--max-candidates=', '--staging='].some(prefix => arg.startsWith(prefix)))) throw new Error('Argumento desconhecido');
  const value = (key: string, fallback: string) => args.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
  const staging = resolve(value('staging', '.moderation/expansion-5k'));
  if (!staging.startsWith(resolve('.moderation') + '/')) throw new Error('Staging deve estar em .moderation/');
  const bytes = readFileSync('public/data/catalog.json');
  const existing: WallpaperItem[] = JSON.parse(bytes.toString());
  const pipeline = new ModerationPipeline();
  if (existing.some(item => !isWallpaperItem(item) || item.isSimulated || pipeline.evaluateItem(item).status !== 'safe')) throw new Error('Catálogo base precisa de revisão; não será alterado');
  const policyHash = digest(['config/blocked-wallpapers.json', 'src/services/moderation/metadataModerator.ts', 'src/services/moderation/blacklist.ts'].map(p => readFileSync(p, 'utf8')).join('\n'));
  mkdirSync(staging, { recursive: true });
  const lockPath = resolve(staging, 'collection.lock');
  const lock = openSync(lockPath, 'wx');
  try {
  const checkpoint = resolve(staging, 'checkpoint.json');
  const target = Number(value('target', '5000')), maxCandidates = Number(value('max-candidates', '10000'));
  let state = newExpansionState(existing, target, maxCandidates, digest(bytes), policyHash);
  if (existsSync(checkpoint)) {
    state = JSON.parse(readFileSync(checkpoint, 'utf8'));
    if (state.version !== 2 || state.catalogHash !== digest(bytes) || state.policyHash !== policyHash || state.target !== target || state.maxCandidates !== maxCandidates) throw new Error('Checkpoint incompatível com catálogo/política/opções atuais');
  }
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) throw new Error('STEAM_API_KEY ausente');
  const save = () => { const json = JSON.stringify(state); if (json.includes(apiKey)) throw new Error('Checkpoint contém dado sensível'); writeFileSync(checkpoint + '.tmp', json); renameSync(checkpoint + '.tmp', checkpoint); };
  while (existing.length + state.added.length < target && state.examined < maxCandidates) {
    const source = chooseSource(state); if (!source) break;
    const probe = resolve(staging, 'probe-popular.json');
    let batch: CursorBatch;
    if (source === 'popular' && state.sources.popular.cursor === '*' && existsSync(probe)) batch = JSON.parse(readFileSync(probe, 'utf8'));
    else {
      const quota = source === 'popular' ? Math.round(maxCandidates * 0.7) : maxCandidates - Math.round(maxCandidates * 0.7);
      const bothAvailable = !state.sources.popular.exhausted && !state.sources.recent.exhausted;
      const count = Math.min(100, maxCandidates - state.examined, bothAvailable ? Math.max(1, quota - state.sources[source].examined) : 100);
      batch = await fetchCursorBatch({ apiKey, source, cursor: state.sources[source].cursor, count });
    }
    state.requests++;
    acceptBatch(state, source, batch, pipeline, existing.length);
    save();
    console.log(JSON.stringify({ request: state.requests, source, examined: state.examined, duplicates: state.duplicates, rejected: state.rejected, approvedTotal: existing.length + state.added.length }));
    await delay(450);
  }
  const combined = [...existing, ...state.added];
  // This file is private staging only. Every final item is validated again before generation/publication.
  if (combined.some(item => !isWallpaperItem(item) || item.isSimulated || pipeline.evaluateItem(item).status !== 'safe')) throw new Error('Validação final de staging falhou');
  if (digest(readFileSync('public/data/catalog.json')) !== state.catalogHash) throw new Error('Catálogo mudou durante a coleta');
  writeFileSync(resolve(staging, 'catalog.json'), JSON.stringify(combined, null, 2));
  console.log(JSON.stringify({ complete: combined.length >= target, total: combined.length, examined: state.examined, duplicates: state.duplicates, rejected: state.rejected, reasons: state.reasons, sources: Object.fromEntries(Object.entries(state.sources).map(([key, value]) => [key, { examined: value.examined, added: value.added, duplicates: value.duplicates, rejected: value.rejected, exhausted: value.exhausted }])) }));
  } finally { closeSync(lock); unlinkSync(lockPath); }
}
if (process.argv[1]?.endsWith('/expand-catalog.ts')) main().catch(() => { console.error('Expansão interrompida; catálogo público preservado. Verifique limite, rede, autorização ou checkpoint.'); process.exitCode = 1; });
