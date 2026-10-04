const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = p => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
let failures = 0;
async function test(name, fn) {try {await fn(); console.log('PASS ' + name);} catch(e) {failures++; console.error('FAIL ' + name + ': ' + e.stack);}}
const drain = () => new Promise(resolve => setImmediate(resolve));
function core(mobile, ipad = false) {
  const requests=[], timers=[], writes=[], warnings=[];
  // WorkerNavigator has no maxTouchPoints; only the iPad desktop-UA popup fixture supplies it.
  const navigator={userAgent:mobile?(ipad?'Mozilla/5.0 Macintosh':'iPhone'):'Windows',platform:ipad?'MacIntel':mobile?'iPhone':'Win32'};
  if(ipad)navigator.maxTouchPoints=5;
  const c=vm.createContext({console:{...console,warn:(...args)=>warnings.push(args)}, URL, AbortController, navigator,
    setTimeout(fn,ms){timers.push(ms);return 1;},clearTimeout(){},
    fetch:async(url)=>{requests.push(url);return {ok:true,status:200,json:async()=>({data:{Viewer:{id:1}}})};},
    bgStorageGet:async()=>({}),bgStorageSet:async data=>writes.push(data)});
  c.self=c;
  vm.runInContext(read('src/common/utils.js'),c);
  vm.runInContext(read('src/common/data/anilist-core.js'),c);
  return {c,requests,timers,writes,warnings};
}
function popup(mobile) {
  const ids=new Map(), requests=[], timers=[], viewers=[], auth={accessToken:'keep_desktop_token',expiresAt:Date.now()+3600000,updatedAt:'2026-10-01T00:00:00Z'};
  const store={anilist_auth:auth,anilist_sync_status:{state:'running',currentTitle:'Old sync',updatedAt:Date.now()-600000},firebase_user:{uid:'tracker-user'}};
  let storageListener;
  const node=()=>({hidden:false,textContent:'',attributes:{},classList:{toggle(){},add(){},remove(){}},addEventListener(event,fn){this[event]=fn;},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},replaceChildren(...children){this.children=children;children.forEach(child=>{if(child.id)ids.set(child.id,child);});},
    get innerHTML(){return this.html||'';},set innerHTML(value){this.html=value;for(const m of value.matchAll(/\bid="([^"]+)"/g))ids.set(m[1],node());}});
  const mount=node(),pill=node();ids.set('settingsConnectionsMount',mount);
  const doc={getElementById:id=>ids.get(id)||null,querySelector:sel=>sel.includes('status-pill')?pill:sel.includes('settings-view-inner')?node():null,createElement:()=>node()};
  const c=vm.createContext({console, URL, URLSearchParams, document:doc,
    navigator:{userAgent:mobile?'iPhone':'Windows',platform:mobile?'iPhone':'Win32',maxTouchPoints:mobile?5:0},
    setInterval(fn,ms){timers.push({fn,ms});return 1;},clearInterval(){},setTimeout(fn,ms){timers.push({fn,ms});return 1;},clearTimeout(){},
    chrome:{runtime:{id:'audit',getManifest:()=>({}),sendMessage(message,cb){requests.push(message);cb?.({received:true});}},storage:{onChanged:{addListener:fn=>storageListener=fn}}}});
  c.window=c;c.AnimeTracker={Storage:{get:async keys=>Object.fromEntries(keys.filter(k=>k in store).map(k=>[k,store[k]])),set:async patch=>Object.assign(store,patch)},AuthEnv:{supportsWebAuthFlow:()=>!mobile,getRedirectUrl:()=> 'https://audit.chromiumapp.org/'},UIHelpers:{escapeHtml:s=>String(s??''),formatTimeAgo:()=> 'now'}};
  c.AnimeTracker.LibraryMutations={enqueueWithKeys:async(label,keys,fn)=>fn({snapshot:Object.fromEntries(keys.filter(k=>k in store).map(k=>[k,store[k]])),commit:async patch=>Object.assign(store,patch)})};
  c.AniListCore={AUTH_KEY:'anilist_auth',gql:async()=>{viewers.push(1);return {Viewer:{id:1,name:'PC user',avatar:{}}};}};
  c.AnimeTrackerAniListImportUtils={};
  vm.runInContext(read('src/common/utils.js'),c);
  vm.runInContext(read('src/popup/services/anilist-api.js'),c);
  return {c,ids,store,requests,timers,viewers,pill,change:changes=>storageListener?.(changes,'local')};
}
(async()=>{
  for(const ipad of [false,true])await test((ipad?'iPad desktop-UA popup':'iPhone worker')+' blocks public/authenticated AniList GraphQL without timers or writes',async()=>{
    const h=core(true,ipad);
    await assert.rejects(h.c.AniListCore.gql('query{Viewer{id}}',{},'token'),/anilist_disabled_mobile/);
    await assert.rejects(h.c.AniListCore.gql('query{Page{media{id}}}',{}),/anilist_disabled_mobile/);
    await assert.rejects(h.c.AniListCore.runPush({token:'token'}),/anilist_disabled_mobile/);
    await assert.rejects(h.c.AniListCore.resolveMedia('audit-series','Audit Series'),/anilist_disabled_mobile/);
    assert.equal((await h.c.AniListCore.fetchAiringSchedule([1])).size,0);
    assert.equal(h.requests.length,0);assert.equal(h.timers.length,0);assert.equal(h.writes.length,0);
    assert.equal(h.warnings.length,0);
  });
  await test('desktop AniList GraphQL remains available',async()=>{
    const h=core(false);assert.equal((await h.c.AniListCore.gql('query{Viewer{id}}',{},'token')).Viewer.id,1);assert.equal(h.requests.length,1);
  });
  await test('mobile popup renders disabled AniList, ignores stale status, and starts no viewer fetch or heartbeat',async()=>{
    const h=popup(true);await drain();
    assert.match(h.ids.get('anilistCard')?.innerHTML||'',/Disabled on mobile/);
    for(const id of ['anilistSyncBtn','anilistConnectBtn','anilistDisconnectBtn','anilistImportBtn'])assert.equal(h.ids.has(id),false,id+' must be absent');
    h.change({anilist_sync_status:{newValue:{state:'running',updatedAt:1}}});
    for(const timer of [...h.timers])timer.fn();await drain();
    assert.equal(h.requests.length,0);assert.equal(h.timers.length,0);assert.equal(h.viewers.length,0);
    await h.c.AnimeTracker.AniListIntegration.syncAuthToCloud();
    assert.equal(h.store.anilist_auth.accessToken,'keep_desktop_token');
    assert.equal(h.c.AnimeTracker.AniListIntegration.isConnected(),false);
  });
  await test('desktop popup still offers sync and refreshes the AniList viewer',async()=>{
    const h=popup(false);await drain();assert.equal(h.ids.has('anilistSyncBtn'),true);assert.equal(h.viewers.length,1);
    h.ids.get('anilistSyncBtn').click();assert.equal(h.requests.at(-1).type,'ANILIST_SYNC_NOW');
  });
  await test('mobile airing refresh stops its alarm and retains the previous snapshot',async()=>{
    const h=core(true), snapshot={schemaVersion:1,cachedAt:1,bySlug:{example:{airingAt:123}}}, cleared=[];
    h.c.bgStorageGet=async()=>({animeData:{example:{}},anilist_media_map:{example:{mediaId:1}},airing_schedule:snapshot});
    h.c.chrome={alarms:{get:async()=>null,create:()=>{throw new Error('mobile alarm must not be armed');},clear:async name=>cleared.push(name)}};
    h.c.dlog=()=>{};
    vm.runInContext(read('src/background/jobs/airing-schedule.js'),h.c);
    await h.c.ensureAiringScheduleAlarm();
    const result=await h.c.refreshAiringSchedule({force:true});
    assert.equal(result.reason,'mobile_disabled');assert.ok(cleared.includes('airingScheduleRefresh'));assert.equal(h.writes.length,0);assert.equal(h.requests.length,0);
  });
  await test('mobile AniSkip MAL lookup uses its cache and skips uncached AniList requests without negative writes',async()=>{
    const h=core(true);h.c.bgStorageGet=async()=>({malIdForSlugBundle:{cached:{malId:123,matched:true,cachedAt:Date.now()}}});
    vm.runInContext(read('src/background/fetchers/aniskip.js'),h.c);
    assert.equal(await h.c.getMalIdForSlug('cached','Cached title'),123);
    assert.equal(await h.c.getMalIdForSlug('new','New title'),null);
    assert.equal(h.requests.length,0);assert.equal(h.writes.length,0);assert.equal(h.timers.length,0);
  });
  process.exitCode=failures?1:0;
})();
