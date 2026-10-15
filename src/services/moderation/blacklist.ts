/**
 * WallpaperGallery — Módulo de Blacklist Manual de Wallpapers
 *
 * Gerencia a lista de PublishedFileIDs bloqueados manualmente através do
 * arquivo de configuração versionável `config/blocked-wallpapers.json`.
 *
 * Como adicionar ou remover um wallpaper:
 * 1. Para bloquear um wallpaper: adicione o seu PublishedFileID (como string)
 *    no array "blockedIds" em `config/blocked-wallpapers.json`.
 * 2. Para desbloquear um wallpaper: remova o PublishedFileID correspondente
 *    do array "blockedIds".
 * 3. Execute `npm run moderate:rebuild` para atualizar o catálogo e shards públicos.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const DEFAULT_BLACKLIST_PATH = 'config/blocked-wallpapers.json';

export interface BlacklistConfigFile {
  blockedIds: string[];
}

/**
 * Valida a estrutura da configuração da blacklist manual.
 * Retorna um Set de IDs se o formato estiver correto e sem duplicatas.
 * Lança um erro explícito caso encontre duplicatas ou formato inválido.
 */
export function validateManualBlacklist(rawConfig: unknown): Set<string> {
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    throw new Error('Configuração de blacklist inválida: o conteúdo raiz deve ser um objeto JSON.');
  }

  const record = rawConfig as Record<string, unknown>;
  if (!('blockedIds' in record) || !Array.isArray(record.blockedIds)) {
    throw new Error('Configuração de blacklist inválida: propriedade "blockedIds" ausente ou não é um array.');
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (let i = 0; i < record.blockedIds.length; i++) {
    const entry = record.blockedIds[i];
    if (typeof entry !== 'string') {
      throw new Error(`ID inválido na blacklist no índice ${i}: esperado string, recebido ${typeof entry}.`);
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      throw new Error(`ID na blacklist no índice ${i} não pode ser vazio.`);
    }
    if (seen.has(trimmed)) {
      duplicates.add(trimmed);
    }
    seen.add(trimmed);
  }

  if (duplicates.size > 0) {
    throw new Error(`Blacklist manual contém IDs duplicados: ${Array.from(duplicates).join(', ')}`);
  }

  return seen;
}

/**
 * Carrega a blacklist manual a partir do arquivo JSON no disco.
 * Se o arquivo não existir, retorna um Set vazio de forma segura.
 */
export function loadManualBlacklist(filePath = DEFAULT_BLACKLIST_PATH): Set<string> {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    return new Set<string>();
  }

  const raw = readFileSync(absPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Falha ao ler JSON da blacklist manual em "${absPath}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return validateManualBlacklist(parsed);
}
