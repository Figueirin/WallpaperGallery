import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { InfiniteCatalog } from '../src/utils/infiniteCatalog.ts';
import { observeNextBatch } from '../src/utils/observeNextBatch.ts';
import { defaultCatalogQuery, catalogQueryFromSearch, catalogUrl } from '../src/utils/catalogQuery.ts';
import { StaticCatalogProvider } from '../src/services/staticCatalogProvider.ts';

const defer = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const items = (start, count) => Array.from({ length: count }, (_, i) => ({ id: String(start+i) }));
const batch = (values, page = 1, hasMore = true) => ({ items: values, page, hasMore, total: 979, pageSize: 25 });

function localProvider() {
  const requests = [];
  return { requests, provider: new StaticCatalogProvider({ fetchImpl: async input => {
    const path = new URL(String(input), 'https://offline.invalid').pathname;
    requests.push(path);
    return Response.json(JSON.parse(readFileSync(`public${path}`, 'utf8')));
  } }) };
}

test('provider real: lote inicial e segundo são progressivos, preservados e sem duplicação ou índice desnecessário', async () => {
  const { provider, requests } = localProvider();
  const catalog = new InfiniteCatalog(provider);
  await catalog.loadNext();
  const first = catalog.getSnapshot().items;
  assert.equal(first.length, 25); assert.equal(catalog.getSnapshot().total, 15000);
  assert.deepEqual(requests, ['/data/catalog/manifest.json', '/data/catalog/pages/000001.json']);
  await catalog.loadNext();
  assert.equal(catalog.getSnapshot().items.length, 50);
  assert.deepEqual(catalog.getSnapshot().items.slice(0, 25), first);
  assert.equal(new Set(catalog.getSnapshot().items.map(w => w.id)).size, 50);
  assert.deepEqual(requests.slice(2), ['/data/catalog/pages/000002.json']);
  assert.equal(catalog.getSnapshot().page, 2);
});

test('observer de produção: margem antecipada, um request em voo e callbacks desconectados ignorados', async () => {
  const pending = defer(); let calls=0, callback, observed, disconnected=false, options;
  const catalog = new InfiniteCatalog({ getWallpapers: () => { calls++; return pending.promise; } });
  class FakeObserver {
    constructor(cb, opts) { callback=cb; options=opts; }
    observe(target) { observed=target; }
    disconnect() { disconnected=true; }
  }
  const sentinel = {};
  const cleanup = observeNextBatch(sentinel, catalog.loadNext, FakeObserver);
  callback([{ isIntersecting: false }]); assert.equal(calls, 0);
  callback([{ isIntersecting: true }]); callback([{ isIntersecting: true }]);
  assert.equal(calls, 1); assert.equal(catalog.getSnapshot().loading, true);
  assert.equal(observed, sentinel); assert.equal(options.rootMargin, '300px 0px');
  cleanup(); pending.resolve(batch(items(1, 25))); await pending.promise; await Promise.resolve();
  callback([{ isIntersecting: true }]); assert.equal(calls, 1); assert.ok(disconnected);
  assert.doesNotThrow(() => observeNextBatch(sentinel, catalog.loadNext, undefined)());
});

test('fim real: 600 lotes, último com 25, nenhum request após hasMore=false', async () => {
  const { provider, requests } = localProvider(); const catalog = new InfiniteCatalog(provider);
  for (let i=1;i<=600;i++) { await catalog.loadNext(); assert.equal(catalog.getSnapshot().items.length, Math.min(i*25,15000)); }
  const state=catalog.getSnapshot(); assert.equal(state.items.length,15000); assert.equal(state.hasMore,false);
  assert.equal(new Set(state.items.map(w=>w.id)).size,15000);
  const count=requests.length; await catalog.loadNext(); await catalog.retry(); assert.equal(requests.length,count);
  assert.equal(requests.filter(path=>path.includes('/pages/')).length,600);
});

test('reset de busca/filtros/tags/resolução/ordenação limpa a lista e reinicia em page=1', async () => {
  const calls=[];
  const catalog=new InfiniteCatalog({ getWallpapers: async options=>{ calls.push(options); return batch(items(calls.length*100,25), options.page); } });
  await catalog.loadNext(); await catalog.loadNext();
  for (const patch of [{searchQuery:'rain'}, {type:'Scene'}, {tags:['Anime']}, {resolutions:['1920x1080']}, {sortBy:'title_asc'}]) {
    const query={...catalog.getSnapshot().query,...patch};
    assert.ok(catalog.reset(query)); assert.equal(catalog.getSnapshot().items.length,0); assert.equal(catalog.getSnapshot().page,0);
    await catalog.loadNext(); assert.equal(calls.at(-1).page,1); assert.equal(calls.at(-1).pageSize,25); assert.equal(catalog.getSnapshot().items.length,25);
  }
  assert.equal(calls.at(-1).sortBy,'title_asc'); assert.deepEqual(calls.at(-1).tags,['Anime']);
  const before=catalog.getSnapshot(); assert.equal(catalog.reset(before.query),false); assert.equal(catalog.getSnapshot(),before);
});

test('race: resposta antiga e falha antiga não podem contaminar a nova consulta', async () => {
  for (const fail of [false,true]) {
    const old=defer(),fresh=defer();let calls=0;
    const catalog=new InfiniteCatalog({getWallpapers:()=>++calls===1?old.promise:fresh.promise});
    const first=catalog.loadNext();catalog.reset({...defaultCatalogQuery(),searchQuery:'fresh'});
    const second=catalog.loadNext();fresh.resolve(batch(items(100,2),1,false));await second;
    if(fail)old.reject(new Error('old'));else old.resolve(batch(items(1,25)));
    await first;assert.deepEqual(catalog.getSnapshot().items.map(w=>w.id),['100','101']);
    assert.equal(catalog.getSnapshot().loading,false);assert.equal(catalog.getSnapshot().error,false);
  }
});

test('erro no próximo lote mantém itens e página, bloqueia retry automático e permite retry manual', async () => {
  let calls=0;const options=[];
  const catalog=new InfiniteCatalog({ getWallpapers: async option=>{options.push(option);calls++;if(calls===2)throw new Error('offline');return batch(items(calls===1?1:26,25),option.page);}});
  await catalog.loadNext();const first=catalog.getSnapshot().items;await catalog.loadNext();
  assert.equal(catalog.getSnapshot().items,first);assert.equal(catalog.getSnapshot().page,1);assert.ok(catalog.getSnapshot().error);
  await catalog.loadNext();assert.equal(calls,2);
  await catalog.retry();assert.equal(options.at(-1).page,2);assert.equal(catalog.getSnapshot().items.length,50);assert.equal(catalog.getSnapshot().error,false);
});

test('dedup defensivo mantém IDs únicos e termina se um lote não trouxer nenhum item novo', async () => {
  const catalog=new InfiniteCatalog({getWallpapers:async()=>batch(items(1,25))});
  await catalog.loadNext();await catalog.loadNext();assert.equal(catalog.getSnapshot().items.length,25);assert.equal(catalog.getSnapshot().hasMore,false);
});

test('índice real: consulta global materializa somente shards necessários aos primeiros 25 IDs e reutiliza cache', async () => {
  const {provider,requests}=localProvider();const catalog=new InfiniteCatalog(provider,{...defaultCatalogQuery(),sortBy:'title_asc'});
  await catalog.loadNext();const state=catalog.getSnapshot();assert.equal(state.items.length,25);
  const manifest=JSON.parse(readFileSync('public/data/catalog/manifest.json','utf8'));
  const required=new Set(state.items.map(w=>'/data/catalog/'+manifest.shards.find(s=>s.page===manifest.itemToPage[w.id]).file));
  assert.deepEqual(new Set(requests.filter(p=>p.includes('/pages/'))),required);
  assert.ok(requests.includes('/data/catalog/index.json'));assert.ok(required.size<600);
  const count=requests.length;await provider.getWallpapers({page:1,pageSize:25,sortBy:'title_asc'});assert.equal(requests.length,count);
});

test('URL preserva consulta em detalhes/galeria, remove page legado e permite leitura em back/forward', () => {
  const query={...defaultCatalogQuery(), searchQuery:'夜空 rain', type:'Scene', tags:['Anime','Rain'], resolutions:['1920x1080'],sortBy:'date_desc'};
  const detail=catalogUrl('https://offline.invalid/?page=20&utm_source=test',query,'123');
  const url=new URL(detail);assert.equal(url.pathname,'/wallpaper/123');assert.equal(url.searchParams.has('page'),false);
  assert.equal(url.searchParams.get('utm_source'),'test');assert.deepEqual(catalogQueryFromSearch(url.search),query);
  const back=new URL(catalogUrl(detail,query,null));assert.equal(back.pathname,'/');assert.deepEqual(catalogQueryFromSearch(back.search),query);
  assert.equal(catalogQueryFromSearch('?type=invalid&sort=unknown').type,'ALL');
});

test('novas mensagens usam os textos EN/PT-BR especificados', async () => {
  const { translate } = await import('../src/i18n/translations.ts');
  const pairs = [
    ['loadingMore', 'Loading more wallpapers...', 'Carregando mais wallpapers...'],
    ['endResults', "You've reached the end.", 'Você chegou ao fim.'],
    ['loadMoreError', 'Unable to load more wallpapers.', 'Não foi possível carregar mais wallpapers.'],
    ['loadMore', 'Load more', 'Carregar mais'],
  ];
  for (const [key, en, pt] of pairs) { assert.equal(translate('en',key),en); assert.equal(translate('pt-BR',key),pt); }
});
