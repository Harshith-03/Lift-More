// Icon generation for the PWA (run from the repo root):
//   npx pwa-assets-generator --preset minimal-2023 web/public/logo.svg
//   npx pwa-assets-generator -c web/pwa-assets.config.ts      (same preset, dark padding)
// The stock minimal-2023 preset pads maskable/apple icons with white; this config keeps
// the same sizes but pads with the app's near-black so the icons look native on any launcher.
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

const BG = '#0b0d0a';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: BG, fit: 'contain' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: BG, fit: 'contain' } },
  },
  images: ['web/public/logo.svg'],
});
