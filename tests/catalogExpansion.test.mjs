import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchCursorBatch, newExpansionState, acceptBatch, chooseSource } from '../scripts/expand-catalog.ts';
import { normalizeSteamWorkshopItem } from '../scripts/sync-workshop.ts';
import { ModerationPipeline } from '../src/services/moderation/moderationPipeline.ts';
const raw = (id, extra={}) => ({ publishedfileid:String(id), title:'Landscape', consumer_appid:431960, result:1, preview_url:'https://example.invalid/preview.jpg', tags:[{tag:'Everyone'}], ...extra });
const pipeline = () => new ModerationPipeline({manualBlacklist:new Set(['3'])});

test('cursor Steam de produção: endpoint fixo, tags/previews, cursor sem page e lote limitado', async () => {
  const result=await fetchCursorBatch({apiKey:'offline-secret',source:'recent',cursor:'next/==',count:50,fetchImpl:async(input,options)=>{
    const url=new URL(input);assert.equal(url.origin,'https://api.steampowered.com');assert.equal(url.searchParams.get('cursor'),'next/==');assert.equal(url.searchParams.has('page'),false);assert.equal(url.searchParams.get('query_type'),'1');assert.equal(url.searchParams.get('numperpage'),'50');assert.equal(options.redirect,'error');assert.ok(options.signal);return Response.json({response:{publishedfiledetails:[raw(1)],next_cursor:'next2'}});
  }});
  assert.equal(result.next_cursor,'next2');assert.equal(result.publishedfiledetails.length,1);
  await assert.rejects(fetchCursorBatch({apiKey:'x',source:'popular',cursor:'*',count:101}),/1–100/);
});

test('resiliência: 429/5xx com backoff, teto de retries e mensagens sem URLs/segredos', async () => {
  let calls=0;const sleeps=[];
  await fetchCursorBatch({apiKey:'offline-secret',source:'popular',cursor:'*',count:1,sleep:async ms=>sleeps.push(ms),fetchImpl:async()=>{calls++;return calls===1?new Response('',{status:429,headers:{'retry-after':'1'}}):calls===2?new Response('',{status:503}):Response.json({response:{publishedfiledetails:[]}});}});
  assert.equal(calls,3);assert.deepEqual(sleeps,[1000,1500]);
  calls=0;await assert.rejects(fetchCursorBatch({apiKey:'offline-secret',source:'popular',cursor:'*',count:1,sleep:async()=>{},fetchImpl:async()=>{calls++;throw new Error('https://private.invalid/?key=offline-secret');}}),error=>!error.message.includes('offline-secret')&&!error.message.includes('https:'));
  assert.equal(calls,3);
  await assert.rejects(fetchCursorBatch({apiKey:'x',source:'popular',cursor:'*',count:1,fetchImpl:async()=>Response.json({response:{}})}),/incompleta/);
});

test('expansão usa moderador real: dedup, blacklist, rating, texto, entrada inválida e preservação dos existentes', () => {
  const existing=normalizeSteamWorkshopItem(raw(1));existing.author.name='Resolved Author';const original=JSON.stringify(existing);
  const state=newExpansionState([existing],5000,10000);
  acceptBatch(state,'popular',{publishedfiledetails:[raw(1,{title:'Updated'}),raw(2),raw(3),raw(4,{tags:[{tag:'Mature'}]}),raw(5,{title:'rule34'}),raw(6,{preview_url:'javascript:bad'}),raw(7,{consumer_appid:1})],next_cursor:'next'},pipeline(),1);
  assert.equal(state.examined,7);assert.equal(state.duplicates,1);assert.equal(state.rejected,5);assert.deepEqual(state.added.map(item=>item.id),['2']);assert.equal(JSON.stringify(existing),original);
  assert.equal(state.examined,state.duplicates+state.rejected+state.added.length);
  assert.equal(state.sources.popular.duplicates,1);assert.equal(state.sources.popular.rejected,5);
  assert.equal(state.sources.popular.exhausted,false); // Existing IDs still advance discovery.
});

test('limites e cursores: nunca excede target/budget, interrompe repetição, vazio e ausência de avanço', () => {
  const candidates=Array.from({length:100},(_,i)=>raw(i+10));
  const state=newExpansionState([],5000,150);
  acceptBatch(state,'popular',{publishedfiledetails:candidates,next_cursor:'n'},pipeline(),0);
  acceptBatch(state,'recent',{publishedfiledetails:candidates,next_cursor:'r'},pipeline(),0);
  assert.equal(state.examined,150);
  const target=newExpansionState([],2,100);
  acceptBatch(target,'popular',{publishedfiledetails:candidates,next_cursor:'*'},pipeline(),0);assert.equal(target.added.length,2);assert.ok(target.sources.popular.exhausted);
  const empty=newExpansionState([],5000,100);acceptBatch(empty,'popular',{publishedfiledetails:[]},pipeline(),0);assert.ok(empty.sources.popular.exhausted);
  const repeated=newExpansionState([],5000,1000);acceptBatch(repeated,'popular',{publishedfiledetails:[raw(10)],next_cursor:'n'},pipeline(),0);acceptBatch(repeated,'popular',{publishedfiledetails:[raw(10)],next_cursor:'z'},pipeline(),0);assert.ok(repeated.sources.popular.exhausted);
  assert.throws(()=>newExpansionState([],15000,25001),/25.000/);
});

test('mistura limitada de descoberta converge a 70% popular / 30% recent; estado serializado é retomável', () => {
  let state=newExpansionState([],5000,1000);
  for(let batch=0;batch<10;batch++){
    const source=chooseSource(state);assert.ok(source);
    acceptBatch(state,source,{publishedfiledetails:Array.from({length:100},(_,i)=>raw(10+batch*100+i)),next_cursor:'c'+batch},pipeline(),0);
    state=JSON.parse(JSON.stringify(state));
  }
  assert.equal(state.sources.popular.examined,700);assert.equal(state.sources.recent.examined,300);assert.equal(state.added.length,1000);
});

test('catálogo 15K: todos os 979 itens anteriores preservados integralmente, sem perda de metadados', async () => {
  const {readFileSync}=await import('node:fs');const {createHash}=await import('node:crypto');
  const original=JSON.parse(readFileSync('tests/fixtures/pre-5k-catalog.json','utf8'));
  const catalog=JSON.parse(readFileSync('public/data/catalog.json','utf8'));
  const byId=new Map(catalog.map(item=>[item.id,item]));
  assert.equal(Object.keys(original).length,979);assert.equal(catalog.length,15000);assert.equal(byId.size,15000);
  for(const [id,hash] of Object.entries(original)){
    assert.ok(byId.has(id),id);
    assert.equal(createHash('sha256').update(JSON.stringify(byId.get(id))).digest('hex'),hash,`Metadata original preservada: ${id}`);
  }
});


test('orçamento 15K: teto 25.000, estado v2 e contabilidade por fonte sobrevivem ao resume', () => {
  let state=newExpansionState([],15000,25000);assert.equal(state.version,2);
  acceptBatch(state,'popular',{publishedfiledetails:[raw(10),raw(10),raw(11,{tags:[{tag:'Mature'}]})],next_cursor:'a'},pipeline(),0);
  state=JSON.parse(JSON.stringify(state));
  acceptBatch(state,'recent',{publishedfiledetails:[raw(10),raw(12),raw(13,{title:'rule34'})],next_cursor:'b'},pipeline(),0);
  for(const source of Object.values(state.sources)) assert.equal(source.examined,source.added+source.duplicates+source.rejected);
  assert.equal(state.examined,6);assert.equal(state.duplicates,2);assert.equal(state.rejected,2);assert.equal(state.added.length,2);
});


test('15K preserva integralmente os 5000 itens do snapshot anterior, além dos 979 históricos', async () => {
  const {readFileSync}=await import('node:fs');const {createHash}=await import('node:crypto');
  const original=JSON.parse(readFileSync('tests/fixtures/pre-15k-catalog.json','utf8'));
  const catalog=JSON.parse(readFileSync('public/data/catalog.json','utf8'));
  const byId=new Map(catalog.map(item=>[item.id,item]));
  assert.equal(Object.keys(original).length,5000);assert.equal(catalog.length,15000);assert.equal(byId.size,15000);
  for(const [id,hash] of Object.entries(original)) assert.equal(createHash('sha256').update(JSON.stringify(byId.get(id))).digest('hex'),hash,`Todos os campos originais: ${id}`);
});
