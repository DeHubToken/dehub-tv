import env from '../config/env';

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = env.DEBUG ? ORDER.debug : ORDER.warn;

/**
 * Namespaced console wrapper. Warn and above always survive — a released TV
 * build is debugged over `adb logcat` from someone else's living room, and a
 * silent failure there costs a support round-trip.
 */
export function createLogger(scope: string) {
  const emit = (level: Level, fn: (...a: any[]) => void) =>
    (...args: any[]) => {
      if (ORDER[level] < MIN) return;
      fn(`[${scope}]`, ...args);
    };

  return {
    debug: emit('debug', console.log),
    info: emit('info', console.log),
    warn: emit('warn', console.warn),
    error: emit('error', console.error),
  };
}
