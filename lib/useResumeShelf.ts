/**
 * React's view of the resume shelf.
 *
 * Kept apart from `lib/resume` so the player can read and write positions
 * without pulling React into a module the store does not need — and so the
 * home screen gets a plain subscription rather than a query.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { loadResumeShelf, resumeEntries, subscribeResume, type ResumeEntry } from './resume';

export function useResumeShelf(): ResumeEntry[] {
  // The store is read off disk once. Doing it here rather than at startup keeps
  // launch free of a disk read nothing is waiting for; the shelf appears a
  // frame later, which on a rail below the hero is invisible.
  useEffect(() => {
    void loadResumeShelf();
  }, []);

  return useSyncExternalStore(subscribeResume, resumeEntries, resumeEntries);
}
