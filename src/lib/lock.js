// Screen lock for shared front-desk phones. The PIN is kept on this device only, as a salted hash.
// It stops a passer-by from opening the register; it is not encryption of the data itself.
import { sha256 } from './format.js';

export const LOCK_MINUTES = [5, 10, 15, 30];
// With no PIN set, a live account signs out after this long idle.
export const SIGN_OUT_MINUTES = 30;

const settingsKey = uid => `homestay-lock-${uid}`;
const lockedKey = uid => `homestay-locked-${uid}`;
const ACTIVE_KEY = 'homestay-last-active';

function read(k) { try { return localStorage.getItem(k); } catch { return null; } }
function write(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage blocked */ } }

export function getLockSettings(uid) {
  try { return JSON.parse(read(settingsKey(uid))); } catch { return null; }
}

export async function setPin(uid, pin, minutes) {
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  write(settingsKey(uid), JSON.stringify({ salt, hash: await sha256(salt + pin), minutes }));
}

export function removePin(uid) {
  write(settingsKey(uid), null);
  write(lockedKey(uid), null);
  write(`homestay-pin-tries-${uid}`, null);
}

export async function checkPin(uid, pin) {
  const s = getLockSettings(uid);
  return !!s && (await sha256(s.salt + pin)) === s.hash;
}

// The locked state survives a page reload, so reloading does not skip the PIN.
export const isMarkedLocked = uid => read(lockedKey(uid)) === '1';
export const markLocked = (uid, on) => write(lockedKey(uid), on ? '1' : null);

// Wrong tries are counted on the device too, so reloading the page does not reset them.
const triesKey = uid => `homestay-pin-tries-${uid}`;
export const getTries = uid => Number(read(triesKey(uid))) || 0;
export const setTries = (uid, n) => write(triesKey(uid), n ? String(n) : null);

export const touchActivity = () => write(ACTIVE_KEY, String(Date.now()));
export const lastActivity = () => Number(read(ACTIVE_KEY)) || Date.now();
