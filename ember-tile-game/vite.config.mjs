import { defineConfig } from 'vite';
import { extensions, ember } from '@embroider/vite';
import { babel } from '@rollup/plugin-babel';

export default defineConfig(({ mode }) => {
  return {
    // GitHub Pages serves this app from a sub-path.
    // This ensures built asset URLs are prefixed correctly.
    base: mode === 'production' ? '/ExponenTile/' : '/',
    plugins: [
      ember(),
      // extra plugins here
      babel({
        babelHelpers: 'runtime',
        extensions,
      }),
    ],
  };
});
