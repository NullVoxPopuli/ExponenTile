# Tile Game

Originally forked from (and the code at the time of fork is still present under `./react-tile-game`)

The ember version lives at `./ember-tile-game`, and has been ported by AI, starting with a flesh app:
```bash
pnpm dlx ember-cli@latest new ember-tile-game \
  --blueprint @ember/app-blueprint@alpha \
  --pnpm \
  --typescript \ 
  --no-compat \
  --skip-git \
  --skip-install \
  --no-ember-data --no-warp-drive
```