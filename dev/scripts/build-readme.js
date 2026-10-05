// README presentation assets. Run directly or through build-hero.js.
// Pure SVG/CSS animations; no scripts, external fonts or network dependencies.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const { version } = require(path.join(root, 'manifest.json'));
const icon = fs.readFileSync(path.join(root, 'src/icons/icon128.png')).toString('base64');
const output = path.join(root, '.github/assets/readme');
fs.mkdirSync(output, { recursive: true });
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const symbols = {
  resume: '<path d="m-4-7 11 7-11 7z"/><path d="M-15 0a15 15 0 1 1 4 10M-15 9v-9h9"/>',
  track: '<circle r="14"/><path d="m-7 0 5 5 10-10"/>',
  library: '<rect x="-15" y="-13" width="8" height="26" rx="2"/><rect x="-3" y="-13" width="8" height="26" rx="2"/><path d="m9-12 7-2 7 25-7 2z"/>',
  speed: '<path d="m3-16-16 19H0l-3 13L13-3H0z"/>',
  sync: '<path d="M-14-3a15 15 0 0 1 26-7M13-17v8H5M14 3a15 15 0 0 1-26 7M-13 17V9h8"/>',
  filler: '<path d="m-15-11 5-5H13v24L8 14h-23zM-8-7H6M-8 0H6M-8 7H1"/>',
  desktop: '<rect x="-17" y="-12" width="34" height="23" rx="3"/><path d="M0 11v6M-8 17H8"/>',
  phone: '<rect x="-10" y="-17" width="20" height="34" rx="4"/><path d="M-3-12h6M-3 12h6"/>',
  arrow: '<path d="M0-13v20M-7 0l7 7 7-7M-12 8v7h24V8"/>',
  notes: '<rect x="-12" y="-15" width="24" height="30" rx="3"/><path d="M-6-7H6M-6 0H6M-6 7H2"/>'
};
const stroke = (name, x, y, color='#79ddff', scale=1) => `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${symbols[name]}</g>`;
function svg(file,w,h,title,body,description=title){
 const content=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc">
<title id="title">${esc(title)}</title><desc id="desc">${esc(description)}</desc>
<defs>
 <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#14253b"/><stop offset="1" stop-color="#0b1220"/></linearGradient>
 <linearGradient id="edge"><stop stop-color="#65e8d4"/><stop offset=".5" stop-color="#65cfff"/><stop offset="1" stop-color="#a79bff"/></linearGradient>
 <linearGradient id="button" x2="1" y2="1"><stop stop-color="#8af5dd"/><stop offset="1" stop-color="#67cfff"/></linearGradient>
 <radialGradient id="glow"><stop stop-color="#3e9aff" stop-opacity=".25"/><stop offset="1" stop-color="#3e9aff" stop-opacity="0"/></radialGradient>
 <clipPath id="clip"><rect x="1" y="1" width="${w-2}" height="${h-2}" rx="18"/></clipPath>
</defs>
<style>
 text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.ink{fill:#f0f6ff}.muted{fill:#aabdd3}.accent{fill:#84e4ff}
 @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
 @keyframes orbit{to{stroke-dashoffset:-120}}
 @keyframes progress{0%,15%{transform:scaleX(.62)}70%,100%{transform:scaleX(1)}}
 @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
 .pulse{animation:pulse 4s ease-in-out infinite}.orbit{animation:orbit 12s linear infinite}.progress{animation:progress 9s ease-in-out infinite;transform-box:fill-box;transform-origin:left center}.float{animation:float 7s ease-in-out infinite}
 @media(prefers-reduced-motion:reduce){.pulse,.orbit,.progress,.float{animation:none!important}}
</style>
${body}
</svg>\n`;
 fs.writeFileSync(path.resolve(output,file),content);
}
function surface(w,h){return `<rect x="1" y="1" width="${w-2}" height="${h-2}" rx="18" fill="url(#bg)" stroke="#2c425e"/><g clip-path="url(#clip)"><ellipse cx="${w*.85}" cy="${h*.25}" rx="${w*.5}" ry="${h}" fill="url(#glow)"/><path d="M24 1H${w-24}" stroke="url(#edge)" stroke-opacity=".75"/></g>`;}
function resumePanel(x,y,w){return `<g transform="translate(${x} ${y})">
<rect width="${w}" height="162" rx="13" fill="#101e31" stroke="#3c5576"/>
<circle cx="18" cy="17" r="3" fill="#6ee8cb" class="pulse"/>
<text x="30" y="21" class="muted" font-size="10" font-weight="700" letter-spacing="1.5">CONTINUE WATCHING</text>
<rect x="17" y="35" width="42" height="56" rx="6" fill="#244d67"/>
<path d="m31 50 15 12-15 12z" fill="url(#edge)"/>
<text x="73" y="55" class="ink" font-size="17" font-weight="650">Your next episode awaits.</text>
<text x="73" y="78" class="muted" font-size="12">Episode 12 · Pick up at 14:20</text>
<rect x="17" y="105" width="${w-34}" height="5" rx="2.5" fill="#2b405b"/>
<rect x="17" y="105" width="${(w-34)*.78}" height="5" rx="2.5" fill="url(#edge)" class="progress"/>
<text x="17" y="131" class="accent" font-size="11">SAVED TO YOUR LIBRARY</text>
${stroke('sync',w-29,129,'#7ae8d0',.45)}
<path d="M17 146h${w-34}" stroke="#253b53"/>
</g>`;}
svg('../hero-animated.svg',880,260,'An1me Tracker — Never lose your episode',`${surface(880,260)}
<g clip-path="url(#clip)"><circle cx="722" cy="132" r="142" fill="none" stroke="#76bfff" stroke-opacity=".11"/><circle cx="722" cy="132" r="124" fill="none" stroke="url(#edge)" stroke-opacity=".3" stroke-dasharray="3 27" class="orbit"/></g>
<image href="data:image/png;base64,${icon}" x="30" y="26" width="50" height="50"/>
<text x="94" y="48" class="accent" font-size="11" font-weight="700" letter-spacing="2">WATCH. RESUME. REPEAT.</text>
<text x="94" y="69" class="muted" font-size="12">v${esc(version)}</text>
<text x="30" y="133" class="ink" font-size="49" font-weight="750" letter-spacing="-2">An1me Tracker</text>
<text x="32" y="168" class="muted" font-size="19">Never lose your episode.</text>
<rect x="32" y="199" width="108" height="28" rx="14" fill="#183c3d" stroke="#2d6160"/>
<circle cx="46" cy="213" r="3" fill="#77ead2" class="pulse"/><text x="58" y="217" fill="#90e6d5" font-size="10" font-weight="700">LOCAL FIRST</text>
<text x="153" y="217" class="muted" font-size="11">Desktop + iPhone</text>
${resumePanel(486,49,362)}`,'Anime library and playback tracking for desktop and iPhone. Illustrated resume card with animated progress.');
svg('hero-mobile.svg',420,232,'An1me Tracker — Never lose your episode',`${surface(420,232)}
<g clip-path="url(#clip)"><circle cx="371" cy="184" r="104" fill="none" stroke="url(#edge)" stroke-opacity=".22" stroke-dasharray="3 17" class="orbit"/></g>
<image href="data:image/png;base64,${icon}" x="25" y="24" width="48" height="48"/>
<text x="87" y="43" class="accent" font-size="11" font-weight="700" letter-spacing="1.7">WATCH. RESUME. REPEAT.</text>
<text x="87" y="65" class="muted" font-size="12">v${esc(version)}</text>
<text x="25" y="117" class="ink" font-size="41" font-weight="750" letter-spacing="-1.5">An1me Tracker</text>
<text x="27" y="148" class="muted" font-size="18">Never lose your episode.</text>
<rect x="27" y="174" width="366" height="34" rx="10" fill="#11283a" stroke="#295068"/>
<circle cx="43" cy="191" r="3" fill="#76edcc" class="pulse"/><text x="55" y="196" fill="#8ee8d4" font-size="12" font-weight="600">Local first</text>
<text x="175" y="196" class="muted" font-size="12">Desktop + iPhone</text>`);

const cards=[
 ['resume','Exact-second resume','Pick up where you left off.','Saved timestamps. One click.','#77ddff'],
 ['track','Hands-free tracking','Episodes marked at 85% watched.','Your progress stays organised.','#7ce9ce'],
 ['library','A library that’s yours','Covers, search and categories.','JSON backup and restore.','#aca4ff'],
 ['speed','Set your own pace','F7 / F8 on desktop. Touch on iOS.','Boost, skim and keep watching.','#ffd085'],
 ['sync','Across your devices','Optional Firebase cloud sync.','Your library and resume points.','#7ce9ce'],
 ['filler','Know what to skip','Filler tags and AniSkip outro skip.','Spend more time on the story.','#aca4ff']
];
// One image per layout prevents GitHub mobile from wrapping six separate cards.
// Mobile keeps two columns at every width without relying on README custom CSS.
const mobileLabels = {
 resume: ['Instant resume', 'Saved timestamps'],
 track: ['Auto tracking', 'Episodes at 85%'],
 library: ['Your library', 'Search & backups'],
 speed: ['Speed boost', 'Hotkeys & touch'],
 sync: ['Cloud sync', 'Optional account'],
 filler: ['Skip & filler', 'AniSkip + filler tags']
};
function tile(card, compact) {
 const [name,title,line1,line2,color] = card;
 const w = compact ? 176 : 280;
 const h = compact ? 76 : 120;
 const [label,caption] = mobileLabels[name];
 return `<rect x="1" y="1" width="${w-2}" height="${h-2}" rx="${compact?11:18}" fill="url(#bg)" stroke="#2c425e"/>
 <path d="M15 1H${w-15}" stroke="${color}" stroke-opacity=".4"/>
 <g class="float">${stroke(name,compact?21:33.5,compact?19:33.5,color,compact?.42:.65)}</g>
 <circle cx="${w-14}" cy="16" r="2" fill="${color}" class="pulse"/>
 <text x="${compact?12:17}" y="${compact?46:72}" class="ink" font-size="${compact?15:18}" font-weight="650" letter-spacing="-.25">${esc(compact?label:title)}</text>
 <text x="${compact?12:17}" y="${compact?64:93}" class="muted" font-size="${compact?11.5:12}">${esc(compact?caption:line1)}</text>
 ${compact?'':`<text x="17" y="110" class="muted" font-size="12">${esc(line2)}</text>`}`;
}
for (const compact of [false,true]) {
 const columns = compact ? 2 : 3;
 const dx = compact ? 184 : 300;
 const dy = compact ? 84 : 128;
 const body = cards.map((card,i)=>`<g transform="translate(${(i%columns)*dx} ${Math.floor(i/columns)*dy})">${tile(card,compact)}</g>`).join('\n');
 svg(`features-${compact?'mobile':'desktop'}.svg`,compact?360:880,compact?244:248,
  'An1me Tracker features',body,
  'Exact-second resume, episode tracking at 85%, anime library, speed controls, optional cloud sync and filler / AniSkip support.');
}
for(const [name,title,subtitle,symbol,primary] of [
 ['desktop','Get desktop','Chrome / Edge / Brave','arrow',true],
 ['iphone','Get iPhone','Safari + SideStore','phone',false]
]){
 svg(`action-${name}.svg`,174,56,title,`<rect x="1" y="1" width="172" height="54" rx="12" fill="${primary?'url(#button)':'#162a43'}" stroke="${primary?'#87e9df':'#4b6d98'}"/>
 ${stroke(symbol,23,28,primary?'#10283a':'#98dfff',.55)}
 <text x="43" y="25" fill="${primary?'#0c2a3b':'#f0f6ff'}" font-size="15" font-weight="750">${title}</text>
 <text x="43" y="43" fill="${primary?'#244c5d':'#a6bdd9'}" font-size="10">${subtitle}</text>
 <circle cx="156" cy="13" r="2" fill="${primary?'#13596a':'#80e1ff'}" class="pulse"/>`);
}
for(const [name,label,width] of [['features','Features',91],['platforms','Platforms',99],['speed','Speed',76],['changelog','Changelog',103],['privacy','Privacy',83]]){
 svg(`nav-${name}.svg`,width,30,label,`<rect x="1" y="1" width="${width-2}" height="28" rx="9" fill="#122036" stroke="#36506f"/><text x="${width/2}" y="19" class="muted" text-anchor="middle" font-size="12" font-weight="600">${label}</text>`);
}
console.log(`Rebuilt README hero, mobile hero, 2 compact feature grids and 7 buttons for ${version}.`);
