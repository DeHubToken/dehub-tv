import { QueryClient } from '@tanstack/react-query';

/**
 * A TV app is left running. Sessions are hours long, the "app" is never
 * backgrounded the way a phone app is, and the user walks away and comes back
 * — so the defaults are tuned for a long-lived process rather than a
 * thirty-second phone visit: generous staleness (rails do not need to be
 * second-fresh), no refetch on focus (there is no window focus on a TV, and
 * the event that does fire would re-pull every rail at once), and a bounded
 * retry so a dead radio surfaces an error state instead of spinning forever.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
  },
});
