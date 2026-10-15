/**
 * WallpaperGallery — Módulo de Moderação de Metadados (Text & Steam Rating)
 *
 * Avalia classificações da Steam, tags temáticas, título e descrição de wallpapers
 * para identificar conteúdos adultos ou restritos antes da publicação.
 *
 * Política:
 * - Mature / Questionable: Bloqueado
 * - Everyone / Unrated / Ausente / Desconhecido: Permitido (sujeito aos filtros textuais e blacklist)
 * - Blacklist manual: Bloqueado sempre
 * - Termos NSFW, Rule 34 e indicadores adultos: Bloqueados
 */

import type { WallpaperItem } from '../../types/wallpaper.ts';
import type { ModerationDecision, ModerationReason } from './types.ts';

/**
 * Padrões de termos explicitamente adultos e restritos (+18 / NSFW / Rule 34).
 * Utiliza limites de palavra (\b) para prevenir falsos positivos com palavras legítimas.
 */
const RESTRICTED_TERMS_REGEX = new RegExp(
  '\\b(?:nsfw|rule[\\s\\-_—–]*34|r[\\s\\-_—–]*18|hentai|ecchi|lewd|erotic|erotica|eroge|eromanga|ahegao|futa|futanari|nude|naked|nudity|nudez|porn|porno|pornografia|pornographic|pornography|sexo\\s+explicito|uncensored)\\b',
  'i'
);

/**
 * Padrão para detecção de "18+" isolado com suporte a delimitadores não-alfanuméricos
 */
const PLUS_EIGHTEEN_REGEX = /(?:^|[^\w])18\s*\+(?=[^\w]|$)/i;

/**
 * Padrão para detecção de "r34" isolado
 */
const R34_REGEX = /\br[\s\-_—–]*34\b/i;

/**
 * Padrões em ideogramas orientais comumente empregados em tags ou títulos de conteúdo adulto.
 */
const EAST_ASIAN_RESTRICTED_REGEX = /(?:色情|成人|无修|露点|18禁|工口|绅士|拔作|福利姬|本子|エロ|アダルト)/;

/**
 * Termos genéricos permitidos que NÃO devem disparar bloqueio.
 */
export const ALLOWED_AMBIGUOUS_TERMS = [
  'anime',
  'girl',
  'girls',
  'romance',
  'art',
  'love',
  'cute',
  'kiss',
  'beauty',
  'cosplay',
  'swimsuit',
  'model',
  'waifu',
  'fantasy',
  'nature',
] as const;

/**
 * Verifica se a ocorrência de "r34" é uma referência automotiva legítima (Nissan Skyline R34).
 */
export function isAutomotiveReference(text: string): boolean {
  return /\b(?:nissan|skyline|gt-?r|bnr34|er34)\b/i.test(text);
}

/**
 * Remove apenas placeholders estruturais locais de "XXX" (ex: "——XXX", "-XXX-", "例如：...XXX").
 */
export function stripXxxPlaceholders(text: string): string {
  return text
    .replace(/[—\-_/]\s*xxx\s*[—\-_/]/gi, ' ')
    .replace(/[—\-_/]\s*xxx\b/gi, ' ')
    .replace(/\bxxx\s*[—\-_/]/gi, ' ')
    .replace(/例如[：:][^.\n。，、；！？!?]*?xxx\b/gi, ' ');
}

/**
 * Normaliza uma string de texto removendo acentos, diacríticos, caracteres invisíveis
 * e convertendo underscores em espaços para uniformizar delimitadores de palavras.
 */
export function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // remove caracteres zero-width
    .replace(/_/g, ' ') // trata underscores como separadores de palavras (ex: art_nsfw -> art nsfw)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Avalia um campo de texto (título, descrição ou tag) contra regras restritas.
 */
function checkTextField(
  text: string,
  field: 'title' | 'description' | 'tags'
): { matchedReasons: ModerationReason[]; matches: string[] } {
  const reasons: ModerationReason[] = [];
  const matches: string[] = [];
  if (!text || typeof text !== 'string') return { matchedReasons: reasons, matches };

  const normalized = normalizeText(text);

  // 1. Termos restritos gerais (NSFW, Rule 34, R-18, nude, naked, etc.)
  const restrictedMatch = normalized.match(RESTRICTED_TERMS_REGEX);
  if (restrictedMatch) {
    reasons.push({
      category: 'metadata_keyword',
      triggerField: field,
      matchedTerm: restrictedMatch[0],
      message: `Termo restrito identificado em ${field}: "${restrictedMatch[0]}".`,
    });
    matches.push(`${field}:${restrictedMatch[0]}`);
  }

  // 2. Indicador 18+ isolado
  if (PLUS_EIGHTEEN_REGEX.test(normalized)) {
    reasons.push({
      category: 'metadata_keyword',
      triggerField: field,
      matchedTerm: '18+',
      message: `Indicador 18+ identificado em ${field}.`,
    });
    matches.push(`${field}:18+`);
  }

  // 3. Indicador r34 (com exceção automotiva legítima: Skyline / Nissan / GTR R34)
  if (R34_REGEX.test(normalized)) {
    if (!isAutomotiveReference(normalized)) {
      reasons.push({
        category: 'metadata_keyword',
        triggerField: field,
        matchedTerm: 'r34',
        message: `Marcador adulto r34 identificado em ${field}.`,
      });
      matches.push(`${field}:r34`);
    }
  }

  // 4. Ideogramas orientais restritos (salvaguardando referências culturais como 成人の日)
  const asianSanitized = normalized.replace(/成人の日/g, 'holiday');
  const asianMatch = asianSanitized.match(EAST_ASIAN_RESTRICTED_REGEX);
  if (asianMatch) {
    reasons.push({
      category: 'metadata_keyword',
      triggerField: field,
      matchedTerm: asianMatch[0],
      message: `Termo restrito oriental identificado em ${field}: "${asianMatch[0]}".`,
    });
    matches.push(`${field}:${asianMatch[0]}`);
  }

  // 5. Verificação de XXX (ignorando apenas placeholders estruturais locais)
  const withoutPlaceholders = stripXxxPlaceholders(normalized);
  if (/\bxxx\b/i.test(withoutPlaceholders)) {
    reasons.push({
      category: 'metadata_keyword',
      triggerField: field,
      matchedTerm: 'xxx',
      message: `Indicador restrito "xxx" identificado em ${field}.`,
    });
    matches.push(`${field}:xxx`);
  }

  return { matchedReasons: reasons, matches };
}

/**
 * Avalia os metadados de um wallpaper e emite uma decisão estruturada.
 */
export function moderateMetadata(
  item: Pick<WallpaperItem, 'id' | 'title' | 'description' | 'tags' | 'rating'> | Partial<WallpaperItem>
): ModerationDecision {
  const reasons: ModerationReason[] = [];
  const matches: string[] = [];
  const id = String(item?.id ?? '').trim();

  // 1. Verificação de Metadados Essenciais (ID e Título)
  if (!id) {
    reasons.push({
      category: 'invalid_metadata',
      triggerField: 'system',
      message: 'ID do wallpaper ausente ou inválido.',
    });
  }

  const rawTitle = typeof item?.title === 'string' ? item.title.trim() : '';
  if (!rawTitle) {
    reasons.push({
      category: 'invalid_metadata',
      triggerField: 'title',
      message: 'Título do wallpaper ausente ou inválido.',
    });
  }

  // 2. Verificação de Classificação da Steam
  // Mature e Questionable são bloqueados.
  // Everyone, Unrated, ausente ou não informado são permitidos (sujeitos aos filtros textuais e blacklist).
  const rawRating = typeof item?.rating === 'string' ? item.rating.trim().toLowerCase() : '';
  if (rawRating === 'mature') {
    reasons.push({
      category: 'steam_rating',
      triggerField: 'steam_rating',
      matchedTerm: 'Mature',
      message: 'Item classificado oficialmente pela Steam como Mature (Adulto / 18+).',
    });
  } else if (rawRating === 'questionable') {
    reasons.push({
      category: 'steam_rating',
      triggerField: 'steam_rating',
      matchedTerm: 'Questionable',
      message: 'Item classificado oficialmente pela Steam como Questionable (Conteúdo questionável / NSFW potencial).',
    });
  }

  // 3. Verificação de Tags do Wallpaper
  const rawTags = Array.isArray(item?.tags) ? item.tags : [];
  for (const tag of rawTags) {
    if (typeof tag !== 'string') continue;
    const trimmedTag = tag.trim().toLowerCase();

    // Tags que indicam classificação etária restrita
    if (trimmedTag === 'mature' || trimmedTag === 'questionable') {
      reasons.push({
        category: 'steam_rating',
        triggerField: 'tags',
        matchedTerm: tag.trim(),
        message: `Tag de classificação etária adulta identificada: "${tag.trim()}".`,
      });
      matches.push(`tag:${tag.trim()}`);
    }

    // Avaliação textual da tag
    const tagResult = checkTextField(tag, 'tags');
    reasons.push(...tagResult.matchedReasons);
    matches.push(...tagResult.matches);
  }

  // 4. Verificação no Título
  const titleResult = checkTextField(rawTitle, 'title');
  reasons.push(...titleResult.matchedReasons);
  matches.push(...titleResult.matches);

  // 5. Verificação na Descrição
  const rawDesc = typeof item?.description === 'string' ? item.description : '';
  const descResult = checkTextField(rawDesc, 'description');
  reasons.push(...descResult.matchedReasons);
  matches.push(...descResult.matches);

  const isBlocked = reasons.length > 0;

  return {
    id: id || 'desconhecido',
    status: isBlocked ? 'blocked' : 'safe',
    reasons,
    timestamp: new Date().toISOString(),
    metadataMatches: matches,
  };
}
