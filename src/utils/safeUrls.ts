/** HTTPS externo ou caminho local simples para mídias empacotadas. */
export function safeMediaUrl(value?: string): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  if (/^\/(?!\/)[a-zA-Z0-9_./-]+$/.test(value) && !value.includes('..')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function safeWebDemoUrl(value?: string): string | undefined {
  const safe = safeMediaUrl(value);
  return safe?.startsWith('https://') ? safe : undefined;
}

export function steamLinks(id: string, simulated?: boolean) {
  if (simulated || !/^\d+$/.test(id)) return { web: undefined, client: undefined };
  return {
    web: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`,
    client: `steam://url/CommunityFilePage/${id}`,
  };
}
