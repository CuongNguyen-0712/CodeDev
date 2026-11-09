import * as migration_20261104_144734_initial from './20261104_144734_initial';
import * as migration_20261109_021117_media from './20261109_021117_media';

export const migrations = [
  {
    up: migration_20261104_144734_initial.up,
    down: migration_20261104_144734_initial.down,
    name: '20261104_144734_initial',
  },
  {
    up: migration_20261109_021117_media.up,
    down: migration_20261109_021117_media.down,
    name: '20261109_021117_media'
  },
];
