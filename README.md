# Tile Game

Originally forked from (and the [code at the time of hard-fork](https://github.com/MikeBellika/tile-game/tree/ea5a8e0e890363a2e59760c29bd714807bfa4ebc) is still present under `./react-tile-game`)

The ember version lives at `./ember-tile-game`, and has been ported by AI, starting with a flesh app:
```bash
pnpm dlx ember-cli@latest new ember-tile-game \
  --blueprint @ember/app-blueprint@alpha \
  --skip-git \
  --typescript \ 
  --pnpm \
  --no-compat \
  --no-ember-data --no-warp-drive
```