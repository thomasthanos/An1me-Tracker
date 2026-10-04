# iOS icon design — 8.1.0

Keep the recognisable T and the anime character, with the same silhouette and composition across appearances. Native `AppIcon.icon` uses a transparent portrait layer and system-rendered Liquid Glass. With the native icon active, Xcode generates flat icons for older iOS releases from that artwork. Light, dark and tinted PNGs are retained for catalog-only builds; `AppIcon-glass.png` is an exported design preview, not a separate catalog appearance. The system chooses Clear and the user's tint from the native icon.

Generated with the built-in `image_gen` tool; resized to 1024×1024 only for Xcode asset export. Desktop extension icons are unchanged.

Assets: `AppIcon-light.png`, `AppIcon-dark.png`, `AppIcon-glass.png`, `AppIcon-tinted.png`, `AppIcon-transparent.png`, and `AppIcon.icon/Assets/TrackerPortrait.png`.

## Prompt set

Foreground: Edit the existing T portrait into a polished production foreground layer. Keep the bold uppercase T and the serious spiky dark-haired anime young man inside it, monochrome face and clothing, cyan eye and outline. Cleaner outline, softer corners and fewer scratch marks. No heavy neon bloom or baked glass reflections. Transparent background with no app tile, background or outer mask. Keep this geometry across all appearances.

Common variant prompt:

Use case: identity-preserve. Edit target: the supplied transparent T portrait. Asset type: production square iOS app icon for An1me Tracker. Keep exactly the same T silhouette, anime man's face, hairstyle, gaze, black-and-white facial detail, placement, crop, scale and cyan eye/outline (except tinted variant). Change only the background and subtle material treatment. Output a single full-bleed opaque square icon, 1024x1024 preferred, without rounded outer corners, no text, no border around the canvas, no extra symbols or objects. The portrait should be crisp and readable at small size. Restrained premium iOS glass styling, avoid excessive neon glow, glitter, noisy wallpaper, heavy drop shadows.

**light**: Light appearance: soft pearl-white to very pale cool-gray background. Subtle blue-gray ambient depth behind the T. Preserve strong dark hair and crisp pale face, slim cyan rim and eyes. Refined, clear and airy.

**dark**: Dark appearance: deep midnight-navy to near-black background. Subtle cool light at the upper edge of the T, calm dimensional material. Keep the T and portrait crisp with restrained cyan rim/eyes. No diffuse neon halo.

**glass**: Clear/glass appearance preview: pale cool blue-gray frosted glass background with very subtle translucent depth and broad smooth lighting. T has a delicate polished silver/cyan bevel, preserve anime linework. Elegant clear glass look, no sparkle or distracting reflections.

**tinted**: Tinted appearance source: fully grayscale, absolutely no cyan or colored pixels. Charcoal to black background, bright silver/white T edge, eyes in white-gray, retain the identical anime portrait and T geometry. High-contrast monochrome luminosity source suitable for iOS user-selected tint, without adding a fixed colored tint.

[Apple: Creating your app icon using Icon Composer](https://developer.apple.com/documentation/xcode/creating-your-app-icon-using-icon-composer)
