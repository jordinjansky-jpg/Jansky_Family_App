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

export const isDev = new URLSearchParams(location.search).get('env') === 'dev';
const ROOT = isDev ? 'rundown-dev' : 'rundown';

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

// --- Activities ---

/**
 * Read all activities.
 */
export async function readActivities() {
  return readOnce('activities');
}

/**
 * Push a new activity. Returns the generated ID.
 */
export async function pushActivity(data) {
  return pushData('activities', { createdAt: firebase.database.ServerValue.TIMESTAMP, ...data });
}

/**
 * Update an existing activity. Uses .update() (merge) — only the supplied fields are written; other fields are preserved.
 */
export async function updateActivity(activityId, data) {
  return updateData(`activities/${activityId}`, data);
}

/**
 * Remove an activity.
 */
export async function removeActivity(activityId) {
  return removeData(`activities/${activityId}`);
}

// --- Activity Sessions ---

/**
 * Read all activity sessions.
 */
export async function readActivitySessions() {
  return readOnce('activitySessions');
}

/**
 * Push a new activity session. Returns the generated ID.
 */
export async function pushActivitySession(data) {
  return pushData('activitySessions', { createdAt: firebase.database.ServerValue.TIMESTAMP, ...data });
}

/**
 * Update an existing activity session. Uses .update() (merge) — only the supplied fields are written; other fields are preserved.
 */
export async function updateActivitySession(sessionId, data) {
  return updateData(`activitySessions/${sessionId}`, data);
}

/**
 * Remove an activity session.
 */
export async function removeActivitySession(sessionId) {
  return removeData(`activitySessions/${sessionId}`);
}

// --- Active Timers ---

/**
 * Read the active timer for a single person, or null if none.
 */
export async function readActiveTimer(personId) {
  return readOnce(`activeTimers/${personId}`);
}

/**
 * Read all active timers (keyed by personId).
 */
export async function readAllActiveTimers() {
  return readOnce('activeTimers');
}

/**
 * Write the active timer for a person. Full replace (set semantics) — caller passes the complete record.
 */
export async function writeActiveTimer(personId, data) {
  return writeData(`activeTimers/${personId}`, data);
}

/**
 * Clear the active timer for a person.
 */
export async function clearActiveTimer(personId) {
  return removeData(`activeTimers/${personId}`);
}

/**
 * Subscribe to active-timer changes for all people. Calls callback with the full activeTimers map on every change. Returns an unsubscribe function.
 */
export function subscribeActiveTimers(callback) {
  return onValue('activeTimers', callback);
}

// --- Activity Earnings ---

/**
 * Read all activity earnings for a single person.
 */
export async function readActivityEarnings(personId) {
  return readOnce(`activityEarnings/${personId}`);
}

/**
 * Read all activity earnings (all people).
 */
export async function readAllActivityEarnings() {
  return readOnce('activityEarnings');
}

/**
 * Remove one earning record at a specific period.
 */
export async function removeActivityEarning(personId, activityId, periodKey) {
  return removeData(`activityEarnings/${personId}/${activityId}/${periodKey}`);
}

/**
 * Remove all earnings for an activity under a single person (used during destructive "Delete with History" admin action).
 */
export async function removeActivityEarningsForActivity(personId, activityId) {
  return removeData(`activityEarnings/${personId}/${activityId}`);
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

// ── Rewards Store ──

export async function readRewards() {
  return readOnce('rewards');
}

export async function writeReward(rewardId, data) {
  await writeData(`rewards/${rewardId}`, data);
}

export async function pushReward(data) {
  return pushData('rewards', data);
}

export async function archiveReward(rewardId) {
  await updateData(`rewards/${rewardId}`, { status: 'archived' });
}

export async function removeReward(rewardId) {
  await removeData(`rewards/${rewardId}`);
}

// ── Push Subscriptions ──

export async function readPushSubscriptions(personId) {
  return readOnce(`pushSubscriptions/${personId}`);
}

export async function writePushSubscription(personId, endpointHash, data) {
  return writeData(`pushSubscriptions/${personId}/${endpointHash}`, data);
}

export async function removePushSubscription(personId, endpointHash) {
  return removeData(`pushSubscriptions/${personId}/${endpointHash}`);
}

// ── Notification Log ──

export async function readNotificationLog() {
  return readOnce('notifications/log');
}

// ── Notification Prefs ──

export async function readNotificationPrefs(personId) {
  return readOnce(`people/${personId}/prefs/notifications`);
}

export async function writeNotificationPrefs(personId, prefs) {
  return writeData(`people/${personId}/prefs/notifications`, prefs);
}

export async function updateNotificationPrefs(personId, partial) {
  return updateData(`people/${personId}/prefs/notifications`, partial);
}

// ── Messages ──

export async function readMessages(personId) {
  return readOnce(`messages/${personId}`);
}

export async function readAllMessages() {
  return readOnce('messages');
}

export async function writeMessage(personId, data) {
  const id = await pushData(`messages/${personId}`, data);
  // Fire-and-forget push notification — never block the message write.
  // Importing push-client lazily so callers that don't load it (e.g. SW context)
  // aren't penalized by a static import cycle.
  notifyMessageFireAndForget(personId, data, id);
  return id;
}

async function notifyMessageFireAndForget(personId, data, messageId) {
  try {
    const { sendNotification } = await import('./push-client.js');
    const type = mapMessageTypeToPushType(data?.type);
    if (!type) return;
    const payload = {
      title: data.title || 'New message',
      body:  data.body || '',
      tag:   `${type}-${data.createdBy || 'system'}`,
      data:  { url: '/index.html?openBell=1', type, messageId, personId },
    };
    // Add Approve/Deny actions for reward-request notifications.
    if (type === 'rewardApprovals') {
      payload.actions = [
        { action: 'approve', title: 'Approve' },
        { action: 'deny',    title: 'Deny' },
      ];
    }
    await sendNotification(personId, type, payload);
  } catch (err) {
    console.warn('[firebase] push failed (non-fatal):', err?.message || err);
  }
}

function mapMessageTypeToPushType(messageType) {
  // Message types that should trigger a push.
  // Returned strings MUST match the keys in person.prefs.notifications.types
  // (the Worker uses them directly for `prefs.types[type] === false` lookup).
  // Other internal types (penalty-removed, task-skip-used, etc.) are silent.
  if (messageType === 'redemption-request') return 'rewardApprovals';
  if (messageType === 'use-request')        return 'rewardApprovals';
  if (messageType === 'fyi')      return 'rewardFyi';
  if (messageType === 'message')  return 'bellMessages';
  if (messageType === 'kudos')    return 'bellMessages';
  return null;
}

export async function writeFyiMessage(parentPersonId, kidName, rewardName, pointCost, rewardId, createdByPersonId, bankTokenId = null) {
  return writeMessage(parentPersonId, {
    type: 'fyi',
    title: `${kidName} got ${rewardName} from the store.`,
    body: null,
    amount: -pointCost,
    rewardId,
    bankTokenId,
    seen: false,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    createdBy: createdByPersonId
  });
}

export async function markMessageSeen(personId, msgId) {
  await updateData(`messages/${personId}/${msgId}`, { seen: true });
}

export async function removeMessage(personId, msgId) {
  await removeData(`messages/${personId}/${msgId}`);
}

export async function clearMessages(personId, beforeTimestamp) {
  const msgs = await readOnce(`messages/${personId}`);
  if (!msgs) return;
  const updates = {};
  for (const [id, msg] of Object.entries(msgs)) {
    if (msg.createdAt && msg.createdAt < beforeTimestamp) {
      updates[`messages/${personId}/${id}`] = null;
    }
  }
  if (Object.keys(updates).length > 0) {
    await multiUpdate(updates);
  }
}

export function onMessages(personId, callback) {
  return onValue(`messages/${personId}`, callback);
}

export function onAllMessages(callback) {
  return onValue('messages', callback);
}

// ── Balance Anchors ──

export async function readBalanceAnchor(personId) {
  return readOnce(`balanceAnchors/${personId}`);
}

export async function readAllBalanceAnchors() {
  return readOnce('balanceAnchors');
}

export async function writeBalanceAnchor(personId, data) {
  await writeData(`balanceAnchors/${personId}`, data);
}

// ── Reward Bank (functional reward tokens) ──

export async function readBank(personId) {
  return readOnce(`bank/${personId}`);
}

export async function writeBankToken(personId, data) {
  return pushData(`bank/${personId}`, data);
}

export async function markBankTokenUsed(personId, tokenId, entryKey) {
  await updateData(`bank/${personId}/${tokenId}`, {
    used: true,
    usedAt: firebase.database.ServerValue.TIMESTAMP,
    targetEntryKey: entryKey
  });
}

export async function removeBankToken(personId, tokenId) {
  await removeData(`bank/${personId}/${tokenId}`);
}

export function onBank(personId, callback) {
  return onValue(`bank/${personId}`, callback);
}

// ── Wishlist ──

export async function readWishlist(personId) {
  return readOnce(`wishlist/${personId}`);
}

export async function writeWishlistItem(personId, rewardId) {
  await writeData(`wishlist/${personId}/${rewardId}`, {
    addedAt: firebase.database.ServerValue.TIMESTAMP
  });
}

export async function removeWishlistItem(personId, rewardId) {
  await removeData(`wishlist/${personId}/${rewardId}`);
}

// ── Achievements ──

export async function readAchievements(personId) {
  return readOnce(`achievements/${personId}`);
}

export async function readAllAchievements() {
  return readOnce('achievements');
}

export async function writeAchievement(personId, key, data) {
  await writeData(`achievements/${personId}/${key}`, data);
}

export async function deleteAchievement(personId, key) {
  await writeData(`achievements/${personId}/${key}`, null);
}

export async function markAchievementSeen(personId, key) {
  await updateData(`achievements/${personId}/${key}`, { seen: true });
}

// ── Achievement Definitions ──

export async function readAchievementDefs() {
  return readOnce('achievementDefs');
}

export async function writeAchievementDef(key, data) {
  await updateData(`achievementDefs/${key}`, data);
}

export async function deleteAchievementDef(key) {
  await writeData(`achievementDefs/${key}`, null);
}

// ── Bonus Multiplier Days ──

export async function readMultipliers() {
  return readOnce('multipliers');
}

export async function writeMultiplier(dateKey, personId, data) {
  await writeData(`multipliers/${dateKey}/${personId}`, data);
}

export function onMultipliers(callback) {
  return onValue('multipliers', callback);
}

// ── Person Rewards Data Cleanup ──

export async function deletePersonRewardsData(personId) {
  const updates = {};
  updates[`messages/${personId}`] = null;
  updates[`balanceAnchors/${personId}`] = null;
  updates[`bank/${personId}`] = null;
  updates[`wishlist/${personId}`] = null;
  updates[`achievements/${personId}`] = null;

  // Clean up multipliers referencing this person
  const multipliers = await readOnce('multipliers');
  if (multipliers) {
    for (const [dateKey, people] of Object.entries(multipliers)) {
      if (people[personId]) {
        updates[`multipliers/${dateKey}/${personId}`] = null;
      }
    }
  }

  // Clean up perPerson arrays in rewards
  const rewards = await readOnce('rewards');
  if (rewards) {
    for (const [rewardId, reward] of Object.entries(rewards)) {
      if (Array.isArray(reward.perPerson) && reward.perPerson.includes(personId)) {
        const filtered = reward.perPerson.filter(id => id !== personId);
        updates[`rewards/${rewardId}/perPerson`] = filtered.length > 0 ? filtered : null;
      }
    }
  }

  await multiUpdate(updates);
}

/**
 * Full person-deletion cascade. Removes every tree keyed by (or referencing)
 * the person, beyond what deletePersonRewardsData covers:
 * push subscriptions, activity earnings/sessions/timers, streaks, snapshots,
 * school-lunch feed, recipe ratings, schedule entries they own (+ their
 * completion records), and their id inside tasks.owners / events.people /
 * activities.assignedTo / achievementDefs.perPerson arrays.
 *
 * Does NOT delete people/{personId} itself and does NOT rebuild the schedule —
 * the caller removes the person record and triggers a rebuild afterwards.
 */
export async function deletePersonCascade(personId) {
  await deletePersonRewardsData(personId);

  const updates = {};
  updates[`pushSubscriptions/${personId}`] = null;
  updates[`activityEarnings/${personId}`] = null;
  updates[`activeTimers/${personId}`] = null;
  updates[`streaks/${personId}`] = null;
  updates[`kitchen/schoolLunchFeeds/${personId}`] = null;

  const stripFromArray = (obj, basePath, field) => {
    if (!obj) return;
    for (const [id, rec] of Object.entries(obj)) {
      if (Array.isArray(rec?.[field]) && rec[field].includes(personId)) {
        const filtered = rec[field].filter(x => x !== personId);
        updates[`${basePath}/${id}/${field}`] = filtered.length > 0 ? filtered : null;
      }
    }
  };

  const [snapshots, schedule, completions, tasks, events, activities, sessions, recipes, achievementDefs] = await Promise.all([
    readOnce('snapshots'),
    readOnce('schedule'),
    readOnce('completions'),
    readOnce('tasks'),
    readOnce('events'),
    readOnce('activities'),
    readOnce('activitySessions'),
    readOnce('kitchen/recipes'),
    readOnce('achievementDefs'),
  ]);

  if (snapshots) {
    for (const [dateKey, people] of Object.entries(snapshots)) {
      if (people && people[personId]) updates[`snapshots/${dateKey}/${personId}`] = null;
    }
  }

  if (schedule) {
    for (const [dateKey, dayEntries] of Object.entries(schedule)) {
      if (!dayEntries) continue;
      for (const [entryKey, entry] of Object.entries(dayEntries)) {
        if (entry?.ownerId === personId) {
          updates[`schedule/${dateKey}/${entryKey}`] = null;
          if (completions && completions[entryKey]) {
            updates[`completions/${entryKey}`] = null;
          }
        }
      }
    }
  }

  if (sessions) {
    for (const [sessionId, session] of Object.entries(sessions)) {
      if (session?.personId === personId) updates[`activitySessions/${sessionId}`] = null;
    }
  }

  if (recipes) {
    for (const [recipeId, recipe] of Object.entries(recipes)) {
      if (recipe?.ratings && recipe.ratings[personId] != null) {
        updates[`kitchen/recipes/${recipeId}/ratings/${personId}`] = null;
      }
    }
  }

  stripFromArray(tasks, 'tasks', 'owners');
  stripFromArray(events, 'events', 'people');
  stripFromArray(activities, 'activities', 'assignedTo');
  stripFromArray(achievementDefs, 'achievementDefs', 'perPerson');

  // Firebase caps multi-location updates well above this size in practice,
  // but chunk defensively for very old installs with years of schedule data.
  const entries = Object.entries(updates);
  const CHUNK = 400;
  for (let i = 0; i < entries.length; i += CHUNK) {
    await multiUpdate(Object.fromEntries(entries.slice(i, i + CHUNK)));
  }
}

/**
 * Remove messages matching an entryKey for a given person.
 * Used to reverse bounty rewards on undo.
 */
export async function removeMessagesByEntryKey(personId, entryKey) {
  const msgs = await readOnce(`messages/${personId}`);
  if (!msgs) return;
  const updates = {};
  for (const [msgId, msg] of Object.entries(msgs)) {
    if (msg.entryKey === entryKey) {
      updates[`messages/${personId}/${msgId}`] = null;
    }
  }
  if (Object.keys(updates).length > 0) await multiUpdate(updates);
}

/**
 * Remove the most recent unused bank token of a given type for a person.
 * Used to reverse bounty functional rewards on undo.
 */
export async function removeLatestBankToken(personId, rewardType) {
  const tokens = await readOnce(`bank/${personId}`);
  if (!tokens) return;
  // Find the most recent unused token of this type
  const candidates = Object.entries(tokens)
    .filter(([, t]) => t.rewardType === rewardType && !t.used)
    .sort((a, b) => (b[1].acquiredAt || 0) - (a[1].acquiredAt || 0));
  if (candidates.length > 0) {
    await removeData(`bank/${personId}/${candidates[0][0]}`);
  }
}

/**
 * Count redemption-approved messages for a reward across all people.
 */
export async function countGlobalRedemptions(rewardId) {
  const allMsgs = await readOnce('messages');
  if (!allMsgs) return 0;
  let count = 0;
  for (const personMsgs of Object.values(allMsgs)) {
    for (const msg of Object.values(personMsgs)) {
      if (msg.type === 'redemption-approved' && msg.rewardId === rewardId) count++;
    }
  }
  return count;
}

// ─── Kitchen: Recipes ────────────────────────────────────────────────────────

export async function readKitchenRecipes() {
  return readOnce('kitchen/recipes');
}

export async function pushKitchenRecipe(data) {
  return pushData('kitchen/recipes', data);
}

export async function writeKitchenRecipe(id, data) {
  return writeData(`kitchen/recipes/${id}`, data);
}

export async function removeKitchenRecipe(id) {
  return removeData(`kitchen/recipes/${id}`);
}

// ─── Kitchen: Meal Plan ───────────────────────────────────────────────────────

export async function readKitchenPlan(dateKey) {
  return readOnce(`kitchen/plan/${dateKey}`);
}

/** Read the entire kitchen/plan/ tree (all dates). Used by calendar for one-shot load. */
export async function readAllKitchenPlan() {
  return readOnce('kitchen/plan');
}

/** Read plan slots for a date-key range (inclusive). Returns { [dateKey]: planObj }
 * where missing dates are omitted. Accepts YYYY-MM-DD strings (preferred —
 * already timezone-resolved by the caller) or Date objects (converted using
 * UTC parts for backward compatibility). One keyed range query instead of a
 * round trip per day. Used by the Meal History view. */
export async function readKitchenPlanRange(startDate, endDate) {
  const toKey = (v) => {
    if (typeof v === 'string') return v.slice(0, 10);
    const d = v instanceof Date ? v : new Date(v);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const startKey = toKey(startDate);
  const endKey = toKey(endDate);
  await ready();
  const snapshot = await ref('kitchen/plan')
    .orderByKey()
    .startAt(startKey)
    .endAt(endKey)
    .once('value');
  return snapshot.val() || {};
}

export async function writeKitchenPlanSlot(dateKey, slot, data) {
  // Always store as an array so the schema is one shape going forward.
  // Single-element arrays for the common case; lazy migration on read.
  const value = Array.isArray(data) ? data : [data];
  return writeData(`kitchen/plan/${dateKey}/${slot}`, value);
}

export async function removeKitchenPlanSlot(dateKey, slot) {
  return removeData(`kitchen/plan/${dateKey}/${slot}`);
}

// ─── Kitchen: Lists ───────────────────────────────────────────────────────────

export async function readKitchenLists() {
  return readOnce('kitchen/lists');
}

export async function pushKitchenList(data) {
  return pushData('kitchen/lists', data);
}

export async function writeKitchenList(id, data) {
  return writeData(`kitchen/lists/${id}`, data);
}

export async function removeKitchenList(id) {
  const updates = {
    [`kitchen/lists/${id}`]: null,
    [`kitchen/items/${id}`]: null,
  };
  return multiUpdate(updates);
}

// ─── Kitchen: Items ───────────────────────────────────────────────────────────

export function onKitchenItems(listId, callback) {
  return onValue(`kitchen/items/${listId}`, callback);
}

export async function pushKitchenItem(listId, data) {
  return pushData(`kitchen/items/${listId}`, data);
}

export async function writeKitchenItem(listId, id, data) {
  return writeData(`kitchen/items/${listId}/${id}`, data);
}

/** Merge-update fields on a list item (e.g. { checked, checkedAt } or { category }). */
export async function updateKitchenItem(listId, id, partial) {
  return updateData(`kitchen/items/${listId}/${id}`, partial);
}

export async function removeKitchenItem(listId, id) {
  return removeData(`kitchen/items/${listId}/${id}`);
}

// ─── Kitchen: Staples ────────────────────────────────────────────────────────

export async function readKitchenStaples() {
  return readOnce('kitchen/staples');
}

export async function pushKitchenStaple(data) {
  return pushData('kitchen/staples', data);
}

/** Merge-update fields on a staple (e.g. { name } or { category }). */
export async function updateKitchenStaple(id, partial) {
  return updateData(`kitchen/staples/${id}`, partial);
}

export async function removeKitchenStaple(id) {
  return removeData(`kitchen/staples/${id}`);
}

// ─── iCal Feeds ──────────────────────────────────────────────────────────────

export async function readIcalFeeds() {
  return readOnce('icalFeeds');
}

export async function pushIcalFeed(data) {
  return pushData('icalFeeds', data);
}

export async function writeIcalFeed(id, data) {
  return writeData(`icalFeeds/${id}`, data);
}

export async function removeIcalFeed(id) {
  return removeData(`icalFeeds/${id}`);
}

export async function writeIcalFeedLastSync(id, ts) {
  return writeData(`icalFeeds/${id}/lastSync`, ts);
}

// ─── Kitchen: School Lunch Feeds ──────────────────────────────────────────────

export async function readSchoolLunchFeeds() {
  return readOnce('kitchen/schoolLunchFeeds');
}

export async function writeSchoolLunchFeed(personId, data) {
  return updateData(`kitchen/schoolLunchFeeds/${personId}`, data);
}

export async function removeSchoolLunchFeed(personId) {
  return removeData(`kitchen/schoolLunchFeeds/${personId}`);
}

export async function writeSchoolLunchFeedSync(personId, payload) {
  // payload: { lastSync: number, lastError: string|null, conflicts?: object }
  return updateData(`kitchen/schoolLunchFeeds/${personId}`, payload);
}
