/**
 * WallpaperGallery — Módulo de Moderação de Metadados (Text & Steam Rating)
 *
 * Avalia classificações da Steam, tags temáticas, título e descrição de wallpapers
 * para identificar conteúdos adultos ou restritos antes da publicação.
 */

import type { WallpaperItem } from '../../types/wallpaper.ts';
import type { ModerationDecision, ModerationReason } from './types.ts';

/**
 * Padrões de termos explicitamente adultos e restritos (+18 / NSFW).
 * Utiliza limites de palavra (\b) para prevenir falsos positivos com palavras legítimas.
 */
const RESTRICTED_TERMS_REGEX = new RegExp(
  '\\b(?:nsfw|18\\+|r-?18|hentai|ecchi|lewd|erotic|erotica|eroge|eromanga|ahegao|futa|futanari|nudity|uncensored|porn|porno|pornografia|pornographic)\\b',
  'i'
);

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
 * Normaliza uma string de texto removendo acentos, diacríticos e espaçamentos repetidos.
 */
export function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verifica se a ocorrência de "xxx" é apenas um placeholder estrutural (ex: "Autor——XXX")
 */
function isXxxPlaceholder(text: string): boolean {
  return /[—\-_/]\s*xxx\s*[—\-_/]/i.test(text) || /例如[：:]\s*.*xxx/i.test(text);
}

/**
 * Avalia os metadados de um wallpaper e emite uma decisão estruturada.
 */
export function moderateMetadata(
  item: Pick<WallpaperItem, 'id' | 'title' | 'description' | 'tags' | 'rating'>
): ModerationDecision {
  const reasons: ModerationReason[] = [];
  const matches: string[] = [];

  // 1. Verificação de Classificação da Steam (Mature ou Questionable)
  const normalizedRating = item.rating?.toLowerCase() || '';
  if (normalizedRating === 'mature') {
    reasons.push({
      category: 'steam_rating',
      triggerField: 'steam_rating',
      matchedTerm: 'Mature',
      message: 'Item classificado oficialmente pela Steam como Mature (Adulto / 18+).',
    });
  } else if (normalizedRating === 'questionable') {
    reasons.push({
      category: 'steam_rating',
      triggerField: 'steam_rating',
      matchedTerm: 'Questionable',
      message: 'Item classificado oficialmente pela Steam como Questionable (Conteúdo questionável / NSFW potencial).',
    });
  }

  // 2. Verificação de Tags do Wallpaper
  const rawTags = Array.isArray(item.tags) ? item.tags : [];
  for (const tag of rawTags) {
    const normalizedTag = normalizeText(tag);
    if (normalizedTag === 'mature' || normalizedTag === 'questionable') {
      reasons.push({
        category: 'steam_rating',
        triggerField: 'tags',
        matchedTerm: tag,
        message: `Tag de classificação etária adulta identificada: "${tag}".`,
      });
      matches.push(`tag:${tag}`);
    } else if (RESTRICTED_TERMS_REGEX.test(normalizedTag) || EAST_ASIAN_RESTRICTED_REGEX.test(tag)) {
      reasons.push({
        category: 'metadata_keyword',
        triggerField: 'tags',
        matchedTerm: tag,
        message: `Tag restrita de conteúdo adulto identificada: "${tag}".`,
      });
      matches.push(`tag:${tag}`);
    }
  }

  // 3. Verificação no Título
  const normalizedTitle = normalizeText(item.title || '');
  const titleMatch = normalizedTitle.match(RESTRICTED_TERMS_REGEX);
  if (titleMatch) {
    reasons.push({
      category: 'metadata_keyword',
      triggerField: 'title',
      matchedTerm: titleMatch[0],
      message: `Termo restrito identificado no título: "${titleMatch[0]}".`,
    });
    matches.push(`title:${titleMatch[0]}`);
  }
  const titleAsianMatch = (item.title || '').match(EAST_ASIAN_RESTRICTED_REGEX);
  if (titleAsianMatch) {
    reasons.push({
      category: 'metadata_keyword',
      triggerField: 'title',
      matchedTerm: titleAsianMatch[0],
      message: `Termo restrito oriental identificado no título: "${titleAsianMatch[0]}".`,
    });
    matches.push(`title:${titleAsianMatch[0]}`);
  }

  // Tratamento de "xxx" no título
  if (/\bxxx\b/i.test(normalizedTitle) && !isXxxPlaceholder(item.title || '')) {
    reasons.push({
      category: 'metadata_keyword',
      triggerField: 'title',
      matchedTerm: 'xxx',
      message: 'Indicador restrito "xxx" identificado no título.',
    });
    matches.push('title:xxx');
  }

  // 4. Verificação na Descrição
  const rawDesc = item.description || '';
  const normalizedDesc = normalizeText(rawDesc);
  const descMatch = normalizedDesc.match(RESTRICTED_TERMS_REGEX);
  if (descMatch) {
    reasons.push({
      category: 'metadata_keyword',
      triggerField: 'description',
      matchedTerm: descMatch[0],
      message: `Termo restrito identificado na descrição: "${descMatch[0]}".`,
    });
    matches.push(`description:${descMatch[0]}`);
  }
  const descAsianMatch = rawDesc.match(EAST_ASIAN_RESTRICTED_REGEX);
  if (descAsianMatch) {
    reasons.push({
      category: 'metadata_keyword',
      triggerField: 'description',
      matchedTerm: descAsianMatch[0],
      message: `Termo restrito oriental identificado na descrição: "${descAsianMatch[0]}".`,
    });
    matches.push(`description:${descAsianMatch[0]}`);
  }

  // Tratamento de "xxx" na descrição apenas se não for placeholder textual
  if (/\bxxx\b/i.test(normalizedDesc) && !isXxxPlaceholder(rawDesc)) {
    reasons.push({
      category: 'metadata_keyword',
      triggerField: 'description',
      matchedTerm: 'xxx',
      message: 'Indicador restrito "xxx" identificado na descrição.',
    });
    matches.push('description:xxx');
  }

  const isBlocked = reasons.length > 0;

  return {
    id: String(item.id),
    status: isBlocked ? 'blocked' : 'safe',
    reasons,
    timestamp: new Date().toISOString(),
    metadataMatches: matches,
  };
}
