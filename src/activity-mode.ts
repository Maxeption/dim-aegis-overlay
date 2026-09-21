import type { AegisMode } from './types';

/** Light.gg supplies one recommendation payload, so a saved Both preference cannot apply. */
export function resolveActivityMode(source: string, savedMode?: AegisMode): AegisMode {
  return source === 'lightgg' && savedMode === 'both' ? 'pve' : savedMode || 'pve';
}
