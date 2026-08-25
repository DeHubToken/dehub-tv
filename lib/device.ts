import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

/**
 * Device identity headers.
 *
 * The backend keys its session records on `X-Device-Id` and surfaces them in
 * Settings → Active sessions, where a user can revoke one remotely. That list
 * is the reason this file exists and is not optional chrome: a television is a
 * SHARED device in a room the account holder does not always control, so the
 * ability to say "sign that one out" from a phone is the safety valve for the
 * whole sign-in feature. Without a stable device id the TV either never appears
 * in the list or appears as a new row on every launch, and neither can be
 * revoked meaningfully.
 *
 * `X-Device-Name` is what the user reads in that list, so it says "DeHub TV"
 * plus the model rather than a UUID.
 */

const DEVICE_ID_KEY = 'dehub_tv_device_id';

let cachedId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedId) return cachedId;

  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY).catch(() => null);
  if (stored) {
    cachedId = stored;
    return stored;
  }

  // A real UUID rather than a timestamp-and-random string: this value is the
  // primary key of a revocable session, and two devices colliding would let one
  // person's "sign out that TV" revoke someone else's.
  const fresh = Crypto.randomUUID();
  cachedId = fresh;
  await AsyncStorage.setItem(DEVICE_ID_KEY, fresh).catch(() => {});
  return fresh;
}

export function getDeviceName(): string {
  const model = (Platform.constants as any)?.Model || (Platform.constants as any)?.Brand;
  return model ? `DeHub TV (${model})` : 'DeHub TV';
}

export async function getDeviceHeaders(): Promise<Record<string, string>> {
  return {
    'X-Device-Id': await getDeviceId(),
    'X-Device-Name': getDeviceName(),
    'X-OS-Version': String(Platform.Version ?? ''),
  };
}
