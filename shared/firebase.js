// firebase.js — Firebase init, connection status, typed read/write helpers (v2)
// No DOM access. Pure data layer.

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDNQxQ0UB1muam2yNrUr8fBIYzUjGIxHuM",
  authDomain: "jansky-home.firebaseapp.com",
  projectId: "jansky-home",
  storageBucket: "jansky-home.firebasestorage.app",
  messagingSenderId: "876304971688",
  appId: "1:876304971688:web:74e78ecbad586b2f2d4f9d",
  databaseURL: "https://jansky-home-default-rtdb.firebaseio.com"
};

const ROOT = 'rundown';

let db = null;
let connectionListeners = [];
let authReadyPromise = null;

/**
 * Initialize Firebase. Must be called after Firebase SDK scripts are loaded
 * (firebase-app-compat, firebase-database-compat, firebase-auth-compat).
 * Returns the database reference. Anonymous sign-in starts in the background;
 * all read/write helpers below await it before touching the DB.
 */
export function initFirebase() {
  if (db) return db;

  if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
  }
  db = firebase.database();

  // Anonymous sign-in. Firebase Auth persists the user to localStorage,
  // so subsequent loads reuse the same anon UID without a network round trip.
  authReadyPromise = firebase.auth().signInAnonymously().catch((err) => {
    console.error('[Firebase] Anonymous auth failed:', err);
    throw err;
  });

  return db;
}

/**
 * Resolve when anonymous auth is ready. Pages don't need to call this directly —
 * all read/write helpers await it internally — but it's exported for callers
 * that want to gate UI on auth readiness.
 */
export function awaitAuth() {
  return authReadyPromise || Promise.resolve();
}

/**
 * Get the database reference. Throws if not initialized.
 */
export function getDb() {
  if (!db) throw new Error('Firebase not initialized. Call initFirebase() first.');
  return db;
}

// --- Path helpers ---

function ref(path) {
  return getDb().ref(`${ROOT}/${path}`);
}

// Internal: await auth before any DB op. Cheap once resolved.
async function ready() {
  if (authReadyPromise) await authReadyPromise;
}

// --- Read operations ---

/**
 * Read a value once from a path under rundown/.
 */
export async function readOnce(path) {
  await ready();
  const snapshot = await ref(path).once('value');
  return snapshot.val();
}

/**
 * Subscribe to real-time changes at a path under rundown/.
 * Returns an unsubscribe function (safe to call before auth resolves).
 */
export function onValue(path, callback) {
  let cancelled = false;
  let detach = () => {};
  ready().then(() => {
    if (cancelled) return;
    const r = ref(path);
    const handler = (snapshot) => callback(snapshot.val());
    r.on('value', handler);
    detach = () => r.off('value', handler);
  });
  return () => {
    cancelled = true;
    detach();
  };
}

export function onCompletions(callback) {
  return onValue('completions', callback);
}

export function onScheduleDay(dateKey, callback) {
  return onValue(`schedule/${dateKey}`, callback);
}

export function onSettings(callback) {
  return onValue('settings', callback);
}

// --- Write operations ---

/**
 * Set a value at a path under rundown/.
 */
export async function writeData(path, data) {
  await ready();
  await ref(path).set(data);
}

/**
 * Update multiple children at a path under rundown/.
 */
export async function updateData(path, updates) {
  await ready();
  await ref(path).update(updates);
}

/**
 * Push a new child with auto-generated key. Returns the key.
 */
export async function pushData(path, data) {
  await ready();
  const newRef = ref(path).push();
  await newRef.set(data);
  return newRef.key;
}

/**
 * Remove data at a path under rundown/.
 */
export async function removeData(path) {
  await ready();
  await ref(path).remove();
}

/**
 * Perform a multi-path atomic update. Paths should be relative to rundown/.
 */
export async function multiUpdate(updates) {
  await ready();
  const prefixed = {};
  for (const [path, value] of Object.entries(updates)) {
    prefixed[`${ROOT}/${path}`] = value;
  }
  await getDb().ref().update(prefixed);
}

// --- Typed data helpers ---

/**
 * Read app settings.
 */
export async function readSettings() {
  return readOnce('settings');
}

/**
 * Write app settings (full replace).
 */
export async function writeSettings(settings) {
  return writeData('settings', settings);
}

/**
 * Read all people.
 */
export async function readPeople() {
  return readOnce('people');
}

/**
 * Write a person.
 */
export async function writePerson(personId, data) {
  return writeData(`people/${personId}`, data);
}

/**
 * Push a new person. Returns the generated ID.
 */
export async function pushPerson(data) {
  return pushData('people', data);
}

/**
 * Read all categories.
 */
export async function readCategories() {
  return readOnce('categories');
}

/**
 * Write categories (full replace).
 */
export async function writeCategories(categories) {
  return writeData('categories', categories);
}

/**
 * Read all tasks.
 */
export async function readTasks() {
  return readOnce('tasks');
}

/**
 * Push a new task. Returns the generated ID.
 */
export async function pushTask(data) {
  return pushData('tasks', data);
}

/**
 * Update an existing task.
 */
export async function writeTask(taskId, data) {
  return writeData(`tasks/${taskId}`, data);
}

/**
 * Remove a task.
 */
export async function removeTask(taskId) {
  return removeData(`tasks/${taskId}`);
}

/**
 * Read schedule for a specific date.
 */
export async function readSchedule(dateKey) {
  return readOnce(`schedule/${dateKey}`);
}

/**
 * Read all schedule data (all dates).
 */
export async function readAllSchedule() {
  return readOnce('schedule');
}

/**
 * Write the full schedule for a specific date (replaces all entries for that day).
 */
export async function writeScheduleDay(dateKey, entries) {
  return writeData(`schedule/${dateKey}`, entries);
}

/**
 * Remove schedule for a specific date.
 */
export async function removeScheduleDay(dateKey) {
  return removeData(`schedule/${dateKey}`);
}

/**
 * Read completions.
 */
export async function readCompletions() {
  return readOnce('completions');
}

/**
 * Write a completion record.
 */
export async function writeCompletion(entryKey, data) {
  return writeData(`completions/${entryKey}`, data);
}

/**
 * Remove a completion record.
 */
export async function removeCompletion(entryKey) {
  return removeData(`completions/${entryKey}`);
}

/**
 * Write a daily snapshot.
 */
export async function writeSnapshot(dateKey, personId, data) {
  return writeData(`snapshots/${dateKey}/${personId}`, data);
}

/**
 * Read all snapshots.
 */
export async function readAllSnapshots() {
  return readOnce('snapshots');
}

/**
 * Read all streaks.
 */
export async function readAllStreaks() {
  return readOnce('streaks');
}

/**
 * Read streaks for a person.
 */
export async function readStreaks(personId) {
  return readOnce(`streaks/${personId}`);
}

/**
 * Write streaks for a person.
 */
export async function writeStreaks(personId, data) {
  return writeData(`streaks/${personId}`, data);
}

// --- Events ---

export async function readEvents() {
  return readOnce('events');
}

export async function readEvent(eventId) {
  return readOnce(`events/${eventId}`);
}

export function onEvents(callback) {
  return onValue('events', callback);
}

export async function pushEvent(data) {
  return pushData('events', data);
}

export async function writeEvent(eventId, data) {
  return writeData(`events/${eventId}`, data);
}

export async function removeEvent(eventId) {
  return removeData(`events/${eventId}`);
}

// --- Calendar Settings ---

export async function readCalendarDefaults() {
  return readOnce('settings/calendarDefaults');
}

export async function writeCalendarDefaults(defaults) {
  return writeData('settings/calendarDefaults', defaults);
}

/**
 * Push a debug event log entry.
 */
export async function pushDebugEvent(data) {
  return pushData('debug/eventLog', {
    ...data,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
}

/**
 * Delete all data under rundown/ (factory reset).
 */
export async function factoryReset() {
  await ready();
  await getDb().ref(ROOT).remove();
}

// --- Connection status ---

/**
 * Subscribe to connection status changes.
 * Callback receives boolean (true = connected).
 * Returns unsubscribe function.
 */
export function onConnectionChange(callback) {
  const connRef = getDb().ref('.info/connected');
  const handler = (snapshot) => callback(snapshot.val() === true);
  connRef.on('value', handler);
  connectionListeners.push({ ref: connRef, handler });
  return () => {
    connRef.off('value', handler);
    connectionListeners = connectionListeners.filter(l => l.handler !== handler);
  };
}

/**
 * Check if the database has any data under rundown/ (for first-run detection).
 */
export async function isFirstRun() {
  const settings = await readSettings();
  return settings === null;
}
