const fs = require('fs');
const path = require('path');

const { version } = require('../../manifest.json');
const b64 = fs.readFileSync(path.join(__dirname, '../../src/icons/icon128.png')).toString('base64');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="480" viewBox="0 0 1100 480" overflow="hidden" role="img" aria-labelledby="hero-title hero-desc">
  <title id="hero-title">An1me Tracker — Never lose your episode</title>
  <desc id="hero-desc">Modern anime library and playback progress tracker for Chrome, Edge, and Safari on iPhone.</desc>
  <defs>
    <!-- Background Gradients -->
    <linearGradient id="bg-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a1524"/>
      <stop offset="50%" stop-color="#060c16"/>
      <stop offset="100%" stop-color="#091422"/>
    </linearGradient>

    <radialGradient id="glow-cyan" cx="15%" cy="20%" r="55%">
      <stop offset="0%" stop-color="#57d6ff" stop-opacity="0.18"/>
      <stop offset="60%" stop-color="#57d6ff" stop-opacity="0.03"/>
      <stop offset="100%" stop-color="#57d6ff" stop-opacity="0"/>
    </radialGradient>

    <radialGradient id="glow-blue" cx="85%" cy="75%" r="60%">
      <stop offset="0%" stop-color="#4b8cff" stop-opacity="0.22"/>
      <stop offset="50%" stop-color="#63e0c7" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#4b8cff" stop-opacity="0"/>
    </radialGradient>

    <linearGradient id="brand-ink" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#63e0c7"/>
      <stop offset="50%" stop-color="#57d6ff"/>
      <stop offset="100%" stop-color="#4b8cff"/>
    </linearGradient>

    <linearGradient id="title-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="60%" stop-color="#eaf3ff"/>
      <stop offset="100%" stop-color="#b4dcff"/>
    </linearGradient>

    <linearGradient id="border-shimmer" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#57d6ff" stop-opacity="0.4"/>
      <stop offset="50%" stop-color="#23425f" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#4b8cff" stop-opacity="0.4"/>
    </linearGradient>

    <linearGradient id="card-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0e1d2e"/>
      <stop offset="100%" stop-color="#08121d"/>
    </linearGradient>

    <linearGradient id="screen-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#142c44"/>
      <stop offset="70%" stop-color="#0d1c2c"/>
      <stop offset="100%" stop-color="#07111c"/>
    </linearGradient>

    <linearGradient id="sweep-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>

    <linearGradient id="meteor-tail" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="30%" stop-color="#57d6ff" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#4b8cff" stop-opacity="0"/>
    </linearGradient>

    <!-- Subtle Grid Pattern -->
    <pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#57d6ff" stroke-opacity="0.04" stroke-width="1"/>
    </pattern>

    <!-- Clip Paths -->
    <clipPath id="hero-clip">
      <rect x="1" y="1" width="1098" height="478" rx="24"/>
    </clipPath>
    <clipPath id="card-screen-clip">
      <rect x="630" y="106" width="400" height="162" rx="12"/>
    </clipPath>
    <clipPath id="logo-clip">
      <rect x="0" y="0" width="48" height="48" rx="14"/>
    </clipPath>

    <!-- Glow Filter -->
    <filter id="neon-glow" x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <style>
    text {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    /* Ambient float animations - Pure vertical translation */
    @keyframes floatCard {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-5px); }
    }
    @keyframes logoAura {
      0%, 100% { stroke: #57d6ff; stroke-opacity: 0.85; }
      50% { stroke: #63e0c7; stroke-opacity: 1; }
    }
    @keyframes sweepPass {
      0% { transform: translateX(-600px); }
      100% { transform: translateX(1200px); }
    }

    /* Meteor / Shooting Star across anime sky */
    @keyframes meteorStreak {
      0%, 60% { transform: translate(0, 0); opacity: 0; }
      63% { opacity: 1; }
      75% { transform: translate(-170px, 85px); opacity: 0; }
      100% { transform: translate(-170px, 85px); opacity: 0; }
    }

    /* Moon breathing glow */
    @keyframes moonAura {
      0%, 100% { opacity: 0.65; }
      50% { opacity: 0.95; }
    }

    /* Progress bar playback cycle */
    @keyframes playCycle {
      0% { width: 140px; }
      75% { width: 280px; }
      92% { width: 320px; }
      100% { width: 140px; }
    }
    @keyframes playheadMove {
      0% { transform: translateX(0px); }
      75% { transform: translateX(140px); }
      92% { transform: translateX(180px); }
      100% { transform: translateX(0px); }
    }

    /* Audio Equalizer bars */
    @keyframes eqBar1 { 0%, 100% { height: 6px; y: 18px; } 50% { height: 16px; y: 8px; } }
    @keyframes eqBar2 { 0%, 100% { height: 15px; y: 9px; } 50% { height: 7px; y: 17px; } }
    @keyframes eqBar3 { 0%, 100% { height: 9px; y: 15px; } 50% { height: 19px; y: 5px; } }
    @keyframes eqBar4 { 0%, 100% { height: 17px; y: 7px; } 50% { height: 8px; y: 16px; } }
    @keyframes eqBar5 { 0%, 100% { height: 11px; y: 13px; } 50% { height: 18px; y: 6px; } }

    /* Ping Ripple for Cloud sync status */
    @keyframes beaconRipple {
      0% { r: 3.5px; opacity: 1; }
      100% { r: 10px; opacity: 0; }
    }
    /* Stars twinkle purely via opacity */
    @keyframes starTwinkle1 { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
    @keyframes starTwinkle2 { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.95; } }
    @keyframes starTwinkle3 { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }

    /* Turbo speed badge pulse */
    @keyframes speedBadgePulse {
      0%, 100% { stroke: #57d6ff; stroke-opacity: 0.8; }
      50% { stroke: #63e0c7; stroke-opacity: 1; }
    }

    .card-floater { animation: floatCard 6.5s ease-in-out infinite; }
    .logo-frame { animation: logoAura 3.5s ease-in-out infinite; }
    .light-sweep { animation: sweepPass 10s linear infinite; }
    .meteor-anim { animation: meteorStreak 6s cubic-bezier(0.25, 0.1, 0.25, 1) infinite; }
    .moon-halo { animation: moonAura 4s ease-in-out infinite; }
    .bar-anim { animation: playCycle 8s ease-in-out infinite; }
    .head-anim { animation: playheadMove 8s ease-in-out infinite; }
    .speed-badge { animation: speedBadgePulse 2.8s ease-in-out infinite; }
    
    .eq-1 { animation: eqBar1 1.2s ease-in-out infinite; }
    .eq-2 { animation: eqBar2 0.85s ease-in-out infinite; }
    .eq-3 { animation: eqBar3 1.4s ease-in-out infinite; }
    .eq-4 { animation: eqBar4 1.05s ease-in-out infinite; }
    .eq-5 { animation: eqBar5 1.3s ease-in-out infinite 0.2s; }

    .beacon-core { fill: #63e0c7; }
    .beacon-wave {
      stroke: #63e0c7;
      stroke-width: 1.5;
      fill: none;
      animation: beaconRipple 2.2s cubic-bezier(0, 0.2, 0.8, 1) infinite;
    }
    .star-1 { animation: starTwinkle1 2.8s ease-in-out infinite; }
    .star-2 { animation: starTwinkle2 3.8s ease-in-out infinite 1.2s; }
    .star-3 { animation: starTwinkle3 4.2s ease-in-out infinite 2.1s; }

    @media (prefers-reduced-motion: reduce) {
      .card-floater, .logo-frame, .light-sweep, .meteor-anim, .moon-halo,
      .bar-anim, .head-anim, .speed-badge, .eq-1, .eq-2, .eq-3, .eq-4, .eq-5,
      .beacon-wave, .star-1, .star-2, .star-3 {
        animation: none !important;
      }
    }
  </style>

  <!-- Container Box with Safe Clipping -->
  <g clip-path="url(#hero-clip)">
    <rect x="1" y="1" width="1098" height="478" rx="24" fill="url(#bg-grad)"/>
    <rect x="1" y="1" width="1098" height="478" rx="24" fill="url(#hero-grid)"/>
    <rect x="1" y="1" width="1098" height="478" rx="24" fill="url(#glow-cyan)"/>
    <rect x="1" y="1" width="1098" height="478" rx="24" fill="url(#glow-blue)"/>

    <!-- Shimmer sweep -->
    <rect class="light-sweep" x="-600" y="0" width="480" height="480" fill="url(#sweep-grad)"/>

    <!-- ================= LEFT COLUMN: HERO CONTENT ================= -->
    
    <!-- Brand Logo & Version Pill -->
    <g transform="translate(56, 44)">
      <!-- Official Anime Sung Jin-woo Glowing T Logo -->
      <g>
        <rect x="-2" y="-2" width="52" height="52" rx="15" fill="#0d2338" stroke="#57d6ff" stroke-width="1.8" class="logo-frame"/>
        <g clip-path="url(#logo-clip)">
          <image x="0" y="0" width="48" height="48" href="data:image/png;base64,` + b64 + `"/>
        </g>
      </g>
      <text x="64" y="33" fill="#ffffff" font-size="28" font-weight="700" letter-spacing="-0.5">An1me Tracker</text>
      
      <!-- Version Tag (Positioned with generous 30px+ clearance from text) -->
      <g transform="translate(302, 12)">
        <rect x="0" y="0" width="80" height="25" rx="12.5" fill="#13273c" stroke="#2b4e70" stroke-width="1"/>
        <circle cx="13" cy="12.5" r="3.5" fill="#63e0c7"/>
        <text x="24" y="17" fill="#a4cbef" font-size="12" font-weight="700" letter-spacing="0.4">v${version}</text>
      </g>
    </g>

    <!-- Catchy Headline (Balanced Vertical Hierarchy) -->
    <g transform="translate(56, 142)">
      <text x="0" y="0" fill="url(#title-grad)" font-size="46" font-weight="800" letter-spacing="-1.5">
        Never lose your place.
      </text>
      <text x="0" y="54" fill="#57d6ff" font-size="44" font-weight="800" letter-spacing="-1.5">
        Watch. Resume. Sync.
      </text>
    </g>

    <!-- Compact Subtitle (2 Safe Balanced Lines, Zero Overlap with Card) -->
    <g transform="translate(56, 248)">
      <text x="0" y="0" fill="#9db6cf" font-size="16.5" font-weight="500">
        <tspan x="0" dy="0">Autotrack episodes, 1-click resume &amp; speed boost.</tspan>
        <tspan x="0" dy="25" fill="#7092b3" font-size="15" font-weight="400">Seamless cross-device sync between PC and iPhone.</tspan>
      </text>
    </g>

    <!-- Supported Platforms Badges (Cleanly Positioned at Bottom Left) -->
    <g transform="translate(56, 348)">
      <!-- Chrome / Edge Pill -->
      <g>
        <rect x="0" y="0" width="180" height="42" rx="21" fill="#0e2135" stroke="#25425f" stroke-width="1.3"/>
        <!-- Monitor Icon -->
        <g fill="none" stroke="#57d6ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" transform="translate(18, 11)">
          <rect x="0" y="0" width="18" height="13" rx="2"/>
          <line x1="9" y1="13" x2="9" y2="17"/>
          <line x1="4.5" y1="17" x2="13.5" y2="17"/>
        </g>
        <text x="47" y="26" fill="#eaf3ff" font-size="14" font-weight="600">Chrome &amp; Edge</text>
      </g>

      <!-- Safari iPhone Pill -->
      <g transform="translate(196, 0)">
        <rect x="0" y="0" width="232" height="42" rx="21" fill="#0e2135" stroke="#25425f" stroke-width="1.3"/>
        <!-- Phone Icon -->
        <g fill="none" stroke="#63e0c7" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" transform="translate(18, 10)">
          <rect x="0" y="0" width="12" height="20" rx="3"/>
          <line x1="4.5" y1="16.5" x2="7.5" y2="16.5"/>
        </g>
        <text x="42" y="26" fill="#eaf3ff" font-size="14" font-weight="600">Safari on iPhone</text>
        <text x="168" y="26" fill="#6ba7d6" font-size="11.5" font-weight="500">(SideStore)</text>
      </g>
    </g>

    <!-- ================= RIGHT COLUMN: INTERACTIVE PLAYER CARD ================= -->
    
    <g class="card-floater">
      <!-- Card Frame -->
      <rect x="610" y="60" width="440" height="360" rx="20" fill="url(#card-bg)" stroke="#233e59" stroke-width="1.8"/>

      <!-- Window Header -->
      <g transform="translate(630, 80)">
        <circle cx="6" cy="6" r="4.5" fill="#ff5f57"/>
        <circle cx="20" cy="6" r="4.5" fill="#febc2e"/>
        <circle cx="34" cy="6" r="4.5" fill="#28c840"/>

        <!-- Window Title -->
        <text x="54" y="10" fill="#9db6cf" font-size="13.5" font-weight="600" letter-spacing="0.2">Now Playing</text>

        <!-- Sync Status with Ping Wave -->
        <g transform="translate(295, 0)">
          <circle cx="20" cy="6" r="3.5" class="beacon-wave"/>
          <circle cx="20" cy="6" r="3.5" class="beacon-core"/>
          <text x="32" y="10" fill="#63e0c7" font-size="12" font-weight="600">Cloud Synced</text>
        </g>
      </g>

      <!-- Mini Anime Player Screen -->
      <g clip-path="url(#card-screen-clip)">
        <rect x="630" y="106" width="400" height="162" fill="url(#screen-sky)"/>
        
        <!-- Stars in background -->
        <circle cx="710" cy="136" r="1.8" fill="#ffffff" class="star-1"/>
        <circle cx="750" cy="150" r="2" fill="#ffffff" class="star-2"/>
        <circle cx="840" cy="124" r="1.6" fill="#ffffff" class="star-3"/>
        <circle cx="885" cy="142" r="2.2" fill="#ffffff" class="star-1"/>
        <circle cx="660" cy="168" r="1.6" fill="#ffffff" opacity="0.6"/>
        <circle cx="990" cy="125" r="1.5" fill="#ffffff" class="star-2"/>

        <!-- Shooting Star / Meteor Animation (Nested group for rock-solid coordinate stability) -->
        <g transform="translate(940, 110)">
          <g class="meteor-anim">
            <line x1="0" y1="0" x2="45" y2="-22" stroke="url(#meteor-tail)" stroke-width="1.8" stroke-linecap="round"/>
            <circle cx="0" cy="0" r="2" fill="#ffffff" filter="url(#neon-glow)"/>
          </g>
        </g>

        <!-- Glowing Full Moon with Breathing Halo -->
        <circle cx="950" cy="148" r="22" fill="#57d6ff" fill-opacity="0.75" filter="url(#neon-glow)" class="moon-halo"/>
        <circle cx="950" cy="148" r="22" fill="#e2f7ff"/>

        <!-- Mountain Silhouettes -->
        <path d="M 630 240 L 688 190 L 760 244 L 820 208 L 892 248 L 970 196 L 1030 238 L 1030 270 L 630 270 Z" fill="#13273e"/>
        <path d="M 630 250 L 715 212 L 780 256 L 850 222 L 925 260 L 1030 218 L 1030 270 L 630 270 Z" fill="#0a1727"/>

        <!-- Anime Torii Gate Silhouette -->
        <g transform="translate(740, 192)" fill="#06101c">
          <rect x="0" y="3" width="46" height="5" rx="1.5"/>
          <path d="M -4 3 Q 23 -3 50 3 L 48 6 Q 23 2 -2 6 Z"/>
          <rect x="7" y="5" width="5" height="36"/>
          <rect x="34" y="5" width="5" height="36"/>
          <rect x="5" y="14" width="36" height="3"/>
        </g>

        <!-- Speed Badge floating on screen -->
        <g transform="translate(646, 122)" class="speed-badge">
          <rect x="0" y="0" width="74" height="25" rx="6" fill="#000000" fill-opacity="0.7" stroke="#57d6ff" stroke-width="1.2"/>
          <text x="11" y="17" fill="#57d6ff" font-size="12" font-weight="700">⚡ 2.0×</text>
        </g>

        <!-- 5-Bar Equalizer Visualizer on Screen -->
        <g transform="translate(960, 218)" fill="#57d6ff">
          <rect x="0" y="12" width="3" height="12" rx="1.5" class="eq-1"/>
          <rect x="5.5" y="6" width="3" height="18" rx="1.5" class="eq-2"/>
          <rect x="11" y="10" width="3" height="14" rx="1.5" class="eq-3"/>
          <rect x="16.5" y="8" width="3" height="16" rx="1.5" class="eq-4"/>
          <rect x="22" y="11" width="3" height="13" rx="1.5" class="eq-5"/>
        </g>
      </g>

      <!-- Episode Meta -->
      <g transform="translate(630, 292)">
        <text x="0" y="0" fill="#ffffff" font-size="17.5" font-weight="700">Solo Leveling</text>
        <text x="0" y="20" fill="#88a5c2" font-size="13.5" font-weight="500">Season 2 · Episode 08</text>
        
        <!-- Resume Tag -->
        <g transform="translate(320, -14)">
          <rect x="0" y="0" width="80" height="25" rx="12.5" fill="#132c42" stroke="#57d6ff" stroke-width="1.2"/>
          <text x="40" y="17" text-anchor="middle" fill="#57d6ff" font-size="11.5" font-weight="700" letter-spacing="0.5">RESUMED</text>
        </g>
      </g>

      <!-- Progress Bar Section -->
      <g transform="translate(630, 336)">
        <!-- Track Background -->
        <rect x="0" y="0" width="400" height="7" rx="3.5" fill="#16293d"/>
        
        <!-- Animated Progress Fill -->
        <rect class="bar-anim" x="0" y="0" width="140" height="7" rx="3.5" fill="url(#brand-ink)"/>

        <!-- Animated Playhead Glow & Dot -->
        <g transform="translate(140, 3.5)">
          <g class="head-anim">
            <circle cx="0" cy="0" r="9" fill="#57d6ff" fill-opacity="0.35" filter="url(#neon-glow)"/>
            <circle cx="0" cy="0" r="5" fill="#ffffff"/>
          </g>
        </g>

        <!-- Time Stamps -->
        <text x="0" y="28" fill="#57d6ff" font-size="13" font-weight="600">14:20</text>
        <text x="400" y="28" text-anchor="end" fill="#6d8ba8" font-size="13" font-weight="500">23:45</text>
      </g>
    </g>
  </g>

  <!-- Border on Top -->
  <rect x="1" y="1" width="1098" height="478" rx="24" fill="none" stroke="url(#border-shimmer)" stroke-width="2"/>
</svg>`;

const target = path.join(__dirname, '../../.github/assets/hero-animated.svg');
fs.writeFileSync(target, svg, 'utf8');
console.log('Successfully updated hero-animated.svg!');
