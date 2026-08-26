/**
 * The request layer's 401 handling.
 *
 * This is the code whose absence broke the app fifteen minutes after sign-in,
 * and whose absence also made remote sign-out do nothing. It is worth pinning
 * down precisely, because both failures were invisible: no crash, no error
 * message, just authenticated calls quietly returning nothing.
 */
import { apiClient, ApiError } from '../lib/api.client';
import * as session from '../lib/session';

const OK = (body: unknown = { ok: true }) =>
  ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as any;
const UNAUTHORISED = () =>
  ({ ok: false, status: 401, text: async () => '{"message":"expired"}' }) as any;

describe('apiClient 401 handling', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await session.clearSession();
    await session.saveSession({ token: 'old-access', refreshToken: 'refresh-1', expiresIn: 900 });
  });

  it('refreshes once and replays the call, invisibly', async () => {
    const fetchMock = jest
      .fn()
      // the original call
      .mockResolvedValueOnce(UNAUTHORISED())
      // the refresh
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ accessToken: 'new-access', refreshToken: 'refresh-2', expiresIn: 900 }),
      })
      // the replay
      .mockResolvedValueOnce(OK({ result: 'data' }));
    (global as any).fetch = fetchMock;

    await expect(apiClient.get('/feed')).resolves.toEqual({ result: 'data' });
    expect(await session.getAuthToken()).toBe('new-access');
  });

  it('reads accessToken, which is what /auth/refresh actually returns', async () => {
    // Sign-in responds with `token`; refresh responds with `accessToken`. A
    // client that only knows one of them lets every session die at fifteen
    // minutes while looking like it is working.
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce(UNAUTHORISED())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ accessToken: 'n' }) })
      .mockResolvedValueOnce(OK());

    await apiClient.get('/feed');
    expect(await session.getAuthToken()).toBe('n');
  });

  it('ends the session when the refresh is refused — this is remote sign-out', async () => {
    const ended = jest.fn();
    const unsubscribe = session.onSessionEnded(ended);

    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce(UNAUTHORISED())
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });

    await expect(apiClient.get('/feed')).rejects.toBeInstanceOf(ApiError);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(await session.getAuthToken()).toBeNull();

    unsubscribe();
  });

  it('does not loop when the replay 401s as well', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(UNAUTHORISED())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ accessToken: 'n' }) })
      .mockResolvedValueOnce(UNAUTHORISED());
    (global as any).fetch = fetchMock;

    await expect(apiClient.get('/feed')).rejects.toBeInstanceOf(ApiError);
    // original, refresh, replay — and then it stops.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('shares one refresh between concurrent callers', async () => {
    // Six rails 401-ing together must not fire six refreshes: the backend
    // rotates refresh tokens and treats reuse as a replay, so a burst is how a
    // session destroys itself.
    const fetchMock = jest.fn(async (url: string) => {
      if (String(url).includes('/auth/refresh')) {
        return { ok: true, status: 200, json: async () => ({ accessToken: 'n' }) } as any;
      }
      return (await session.getAuthToken()) === 'n' ? OK() : UNAUTHORISED();
    });
    (global as any).fetch = fetchMock;

    await Promise.all([apiClient.get('/a'), apiClient.get('/b'), apiClient.get('/c')]);

    const refreshCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).includes('/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it('leaves an unauthenticated call alone', async () => {
    // Pairing polls are unauthenticated by design; a 401 there must never wipe
    // a good session.
    const ended = jest.fn();
    const unsubscribe = session.onSessionEnded(ended);
    (global as any).fetch = jest.fn().mockResolvedValueOnce(UNAUTHORISED());

    await expect(apiClient.get('/tv/pair/status', { withAuth: false })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(ended).not.toHaveBeenCalled();
    expect(await session.getAuthToken()).toBe('old-access');

    unsubscribe();
  });

  it('does not attempt a refresh when there is no refresh token', async () => {
    await session.clearSession();
    const fetchMock = jest.fn().mockResolvedValueOnce(UNAUTHORISED());
    (global as any).fetch = fetchMock;

    await expect(apiClient.get('/feed')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
