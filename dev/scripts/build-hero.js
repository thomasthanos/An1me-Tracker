// Rebuild compact documentation artwork: node dev/scripts/build-hero.js
// No dependencies. manifest.json is the version source for badges and the hero.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const { version } = require(path.join(root, 'manifest.json'));
const icon = fs.readFileSync(path.join(root, 'src/icons/icon128.png')).toString('base64');
const out = path.join(root, '.github/assets');
fs.mkdirSync(out, { recursive: true });
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function svg(name, width, height, title, description, body, extraAttributes = '') {
  const result = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc" ${extraAttributes}>
  <title id="title">${escape(title)}</title>
  <desc id="desc">${escape(description)}</desc>
  <defs>
    <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#111e32"/><stop offset="1" stop-color="#0a111f"/></linearGradient>
    <linearGradient id="accent"><stop stop-color="#67e8d0"/><stop offset=".5" stop-color="#65ccff"/><stop offset="1" stop-color="#8b9bff"/></linearGradient>
    <radialGradient id="light"><stop stop-color="#65ccff" stop-opacity=".12"/><stop offset="1" stop-color="#65ccff" stop-opacity="0"/></radialGradient>
    <clipPath id="clip"><rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="18"/></clipPath>
  </defs>
  <style>
    text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
    .muted{fill:#a4b6cc}.ink{fill:#f1f6ff}.accent{fill:#7bdcff}
    @keyframes breathe{0%,100%{opacity:.45}50%{opacity:1}}
    @keyframes glide{0%,100%{transform:translateX(0)}50%{transform:translateX(24px)}}
    .pulse{animation:breathe 5s ease-in-out infinite}.drift{animation:glide 9s ease-in-out infinite}
    @media(prefers-reduced-motion:reduce){.pulse,.drift{animation:none!important}}
  </style>
  ${body}
</svg>
`;
  fs.writeFileSync(path.join(out, name), result);
}

function background(height) {
  return `<rect x="1" y="1" width="878" height="${height - 2}" rx="18" fill="url(#bg)" stroke="#293b54"/>
  <g clip-path="url(#clip)">
    <ellipse class="drift" cx="730" cy="50" rx="230" ry="145" fill="url(#light)"/>
    <path d="M600 0v${height}M664 0v${height}M728 0v${height}M792 0v${height}M856 0v${height}M570 48h310M570 96h310M570 144h310" stroke="#9dbddd" stroke-opacity=".035"/>
    <path d="M32 1h816" stroke="url(#accent)" stroke-opacity=".6"/>
  </g>`;
}

svg('hero-animated.svg', 880, 208, 'An1me Tracker — Never lose your episode',
  'Playback tracking and anime library for Chrome, Edge and iPhone Safari. Optional cloud sync.', `${background(208)}
  <image href="data:image/png;base64,${icon}" x="30" y="28" width="42" height="42"/>
  <text x="84" y="45" class="muted" font-size="11" font-weight="700" letter-spacing="2">YOUR NEXT EPISODE, READY.</text>
  <rect x="84" y="55" width="59" height="20" rx="10" fill="#182e45"/>
  <text x="113.5" y="69" text-anchor="middle" class="accent" font-size="11" font-weight="600">v${escape(version)}</text>
  <text x="30" y="114" class="ink" font-size="40" font-weight="750" letter-spacing="-1.5">An1me Tracker</text>
  <text x="32" y="143" class="muted" font-size="16">Less searching. More watching.</text>
  <g transform="translate(32 174)" font-size="11" font-weight="600">
    <circle r="3" cy="-4" fill="#67e8d0" class="pulse"/><text x="12" class="muted">LOCAL FIRST</text>
    <text x="110" class="muted">CHROME / EDGE</text><text x="225" class="muted">IPHONE SAFARI</text>
  </g>
  <g transform="translate(538 28)">
    <rect width="310" height="152" rx="13" fill="#101e30" stroke="#2d425c"/>
    <text x="18" y="25" class="muted" font-size="10" font-weight="700" letter-spacing="1.6">CONTINUE WATCHING</text>
    <circle cx="290" cy="21" r="3" fill="#67e8d0" class="pulse"/>
    <rect x="18" y="41" width="44" height="56" rx="7" fill="#1c3e58"/>
    <path d="m36 59 12 10-12 10z" fill="url(#accent)"/>
    <text x="76" y="59" class="ink" font-size="16" font-weight="650">Right where you left off.</text>
    <text x="76" y="81" class="muted" font-size="12">Episode 12 · Ready to resume</text>
    <rect x="18" y="114" width="274" height="4" rx="2" fill="#283b52"/>
    <rect x="18" y="114" width="165" height="4" rx="2" fill="url(#accent)"/>
    <circle cx="183" cy="116" r="4" fill="#93eaff" class="pulse"/>
    <text x="18" y="138" class="accent" font-size="11">14:20</text>
    <text x="292" y="138" text-anchor="end" class="muted" font-size="11">23:45</text>
  </g>`);

function header(name, title, subtitle, label, symbol) {
  svg(name, 880, 112, title, subtitle, `${background(112)}
  <text x="28" y="30" class="accent" font-size="10" font-weight="700" letter-spacing="2">AN1ME TRACKER / ${escape(label)}</text>
  <text x="28" y="65" class="ink" font-size="30" font-weight="700" letter-spacing="-.7">${escape(title)}</text>
  <text x="29" y="90" class="muted" font-size="13">${escape(subtitle)}</text>
  <g transform="translate(793 56)" fill="none" stroke="#7bdcff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle r="34" stroke-opacity=".12"/><circle r="27" stroke-opacity=".25" class="pulse"/>
    ${symbol}
  </g>`);
}

header('ios-setting-up.svg', 'Your library. Now on iPhone.', 'Safari extension · iOS 18+ · SideStore · Free Apple ID', 'IPHONE GUIDE',
  '<rect x="-11" y="-20" width="22" height="40" rx="5"/><path d="M-3-15h6M-3 15h6"/><path d="m-4-4 9 5-9 5z" fill="#7bdcff" stroke="none"/>');
header('header-privacy.svg', 'Privacy, by design.', 'Local library · Optional cloud sync · No analytics SDK', 'PRIVACY',
  '<path d="m0-18 15 6v12c0 9-15 17-15 17S-15 9-15 0v-12z"/><path d="m-7 0 5 5L8-5"/>');
header('header-security.svg', 'Keep the tracker safe.', 'Private vulnerability reports · Scope · Review requirements', 'SECURITY',
  '<rect x="-13" y="-2" width="26" height="21" rx="4"/><path d="M-8-2v-8a8 8 0 0 1 16 0v8M0 7v4"/>');
header('header-changelog.svg', 'What’s new.', 'Release notes · Fixes · Improvements · Full history', 'CHANGELOG',
  '<path d="M-12-16h24v32h-24zM-6-8H6M-6 0H6M-6 8H2"/>');
header('header-design.svg', 'One icon. Every appearance.', 'Native artwork · SideStore export · Design prompts', 'ICON DESIGN',
  '<rect x="-16" y="-16" width="32" height="32" rx="9"/><path d="M-9-7H9M0-7v17" stroke-width="4"/>');

function badge(name, text, width, color, versionBadge = false) {
  svg(name, width, 24, text, text, `<rect x=".5" y=".5" width="${width - 1}" height="23" rx="7" fill="#111e30" stroke="#30445e"/>
  <circle cx="12" cy="12" r="2.5" fill="${color}" class="pulse"/>
  ${versionBadge ? '<text x="21" y="16" class="muted" font-size="11">release</text>' : ''}
  <text x="${versionBadge ? 64 : 21}" y="16" class="ink" font-size="11" font-weight="600">${escape(versionBadge ? version : text)}</text>`, `aria-label="${escape(text)}"`);
}
badge('badge-v-tracker.svg', `Version ${version}`, 103, '#7bdcff', true);
badge('badge-manifest.svg', 'Manifest V3', 101, '#a7aaff');
badge('badge-cloud-sync.svg', 'Sync optional', 112, '#67e8d0');
console.log(`Rebuilt 9 compact documentation SVGs for ${version}.`);
