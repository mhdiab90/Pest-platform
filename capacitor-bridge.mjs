import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { PushNotifications } from '@capacitor/push-notifications';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Badge } from '@capawesome/capacitor-badge';

const isNative = Capacitor.isNativePlatform();
const ANDROID_NOTIFICATION_CHANNEL = 'pest_alerts_v3';
const LEGACY_ANDROID_NOTIFICATION_CHANNEL = 'pest_alerts_v2';
let pushListenersInstalled = false;
let pushRegistrationInProgress = null;
let notificationChannelPromise = null;

function createAndroidNotificationChannel(id, description) {
  return LocalNotifications.createChannel({
    id,
    name: 'PEST Notifications',
    description,
    importance: 5,
    visibility: 1,
    sound: 'pest_notification.wav',
    vibration: true,
    lights: true,
    lightColor: '#14517a'
  });
}

async function ensureAndroidNotificationChannel() {
  if (!isNative || Capacitor.getPlatform() !== 'android') return;
  if (!notificationChannelPromise) {
    // Keep the previous channel registered while older Preview Workers may still send v2.
    notificationChannelPromise = Promise.all([
      createAndroidNotificationChannel(
        ANDROID_NOTIFICATION_CHANNEL,
        'Messages, cash custody and important PEST Platform alerts'
      ),
      createAndroidNotificationChannel(
        LEGACY_ANDROID_NOTIFICATION_CHANNEL,
        'Compatibility channel for pending PEST Platform push messages'
      )
    ]).catch(error => {
      notificationChannelPromise = null;
      throw error;
    });
  }
  return notificationChannelPromise;
}

function dispatchPushEvent(name, detail) {
  if (typeof window === 'undefined') return;
  if (name === 'pest-push-token') window.PEST_PENDING_PUSH_TOKEN = detail;
  if (name === 'pest-push-opened') window.PEST_PENDING_PUSH_OPENED = detail;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function localNotificationId(type, eventId) {
  const key = String(type || 'notification') + ':' + String(eventId || Date.now());
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return (hash >>> 0) & 0x7fffffff || 1;
}

async function showForegroundNotification({ id, type, title, body }) {
  if (!isNative || Capacitor.getPlatform() !== 'android') return false;
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return false;
  await ensureAndroidNotificationChannel();
  const rawType = String(type || '');
  const normalizedType = rawType === 'request' ? 'userRequest' : rawType;
  const eventId = String(id || '');
  const route = normalizedType === 'cashCustody' ? 'cashCustody'
    : normalizedType === 'userRequest' ? 'userRequests'
    : 'messages';
  const prefix = eventId.startsWith(rawType + ':') ? rawType + ':' : normalizedType + ':';
  const keyId = eventId.startsWith(prefix) ? eventId.slice(prefix.length) : eventId;
  await LocalNotifications.schedule({
    notifications: [{
      id: localNotificationId(normalizedType, keyId),
      title: String(title || 'PEST Platform').slice(0, 100),
      body: String(body || '').slice(0, 180),
      schedule: { at: new Date(Date.now() + 150) },
      channelId: ANDROID_NOTIFICATION_CHANNEL,
      smallIcon: 'ic_stat_pest_notification',
      iconColor: '#14517a',
      extra: { type: normalizedType, eventId: keyId, route }
    }]
  });
  return true;
}

let otaInitializationPromise = null;

function dispatchOtaEvent(name, detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

async function initializeOtaUpdates() {
  if (!isNative) return { available: false, reason: 'not-native' };
  if (otaInitializationPromise) return otaInitializationPromise;

  otaInitializationPromise = (async () => {
    // Confirm the currently running bundle is healthy before staging another one.
    await CapacitorUpdater.notifyAppReady();

    const config = window.PEST_OTA_CONFIG || {};
    const channel = config.channel === 'stable' ? 'stable' : 'preview';
    const workerBase = String(config.workerBase || '').replace(/\/$/, '');
    if (!workerBase.startsWith('https://')) {
      throw new Error('OTA update server is not configured.');
    }

    const manifestUrl = new URL(workerBase + '/mobile-updates/latest');
    manifestUrl.searchParams.set('channel', channel);
    const response = await fetch(manifestUrl.toString(), {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) throw new Error('OTA update check failed with HTTP ' + response.status + '.');

    const manifest = await response.json();
    if (!manifest || manifest.ok !== true || manifest.updateAvailable !== true) {
      return { available: false, reason: 'no-update' };
    }

    const expectedPrefix = channel === 'preview' ? 'ota-preview-' : 'ota-stable-';
    const version = String(manifest.version || '');
    const bundleUrl = String(manifest.bundleUrl || '');
    const checksum = String(manifest.sha256 || '').toLowerCase();
    if (!version.startsWith(expectedPrefix) || !/^[a-f0-9]{64}$/.test(checksum)) {
      throw new Error('OTA manifest failed validation.');
    }
    const parsedBundleUrl = new URL(bundleUrl);
    if (parsedBundleUrl.protocol !== 'https:' ||
        parsedBundleUrl.hostname !== 'github.com' ||
        !parsedBundleUrl.pathname.startsWith('/mhdiab90/Pest-platform/releases/download/')) {
      throw new Error('OTA bundle URL is not trusted.');
    }

    const current = await CapacitorUpdater.current();
    if (String(current?.bundle?.version || '') === version) {
      return { available: false, reason: 'already-current', version };
    }

    // Reuse a bundle that was downloaded earlier but has not yet been activated.
    const stored = await CapacitorUpdater.list({ raw: true });
    const existing = (stored?.bundles || []).find(item =>
      item?.version === version && item?.status === 'success' && item?.id
    );
    const bundle = existing || await CapacitorUpdater.download({
      url: bundleUrl,
      version,
      checksum
    });
    if (!bundle?.id || (bundle.status && bundle.status !== 'success')) {
      throw new Error('OTA bundle download did not complete successfully.');
    }

    await CapacitorUpdater.next({ id: bundle.id });
    dispatchOtaEvent('pest-ota-update-ready', { version, channel });
    return { available: true, downloaded: true, version, channel };
  })().catch(error => {
    console.warn('Pest Platform OTA check:', error);
    dispatchOtaEvent('pest-ota-update-error', { message: String(error?.message || error) });
    return { available: false, error: String(error?.message || error) };
  });

  return otaInitializationPromise;
}

async function installPushNotificationListeners() {
  if (!isNative || pushListenersInstalled) return;
  if (Capacitor.getPlatform() === 'android') await ensureAndroidNotificationChannel();
  await PushNotifications.addListener('registration', token => dispatchPushEvent('pest-push-token', { token: token.value, platform: 'android' }));
  await PushNotifications.addListener('registrationError', error => dispatchPushEvent('pest-push-error', { message: String(error?.error || error?.message || 'FCM registration failed') }));
  await PushNotifications.addListener('pushNotificationReceived', notification => {
    const payload = notification || {};
    const data = payload.data || {};
    dispatchPushEvent('pest-push-received', payload);
    void showForegroundNotification({
      id: data.eventId || payload.id || Date.now(),
      type: data.type || '',
      title: payload.title || data.title || 'PEST Platform',
      body: payload.body || data.body || 'لديك تنبيه جديد. افتح التطبيق للاطلاع على التفاصيل.'
    }).catch(error => console.warn('Foreground Android notification could not be displayed:', error));
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', action => dispatchPushEvent('pest-push-opened', action?.notification?.data || {}));
  await LocalNotifications.addListener('localNotificationActionPerformed', action => {
    const extra = action?.notification?.extra || {};
    dispatchPushEvent('pest-push-opened', extra);
  });
  pushListenersInstalled = true;
}

if (isNative) {
  installPushNotificationListeners().catch(error => dispatchPushEvent('pest-push-error', { message: String(error?.message || error) }));
}

async function enablePushNotifications() {
  if (!isNative) return { granted: false, reason: 'not-native' };
  if (pushRegistrationInProgress) return pushRegistrationInProgress;
  pushRegistrationInProgress = (async () => {
    await installPushNotificationListeners();
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive !== 'granted') permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return { granted: false, reason: 'push-permission-denied' };
    if (Capacitor.getPlatform() === 'android') {
      await ensureAndroidNotificationChannel();
      let displayPermission = await LocalNotifications.checkPermissions();
      if (displayPermission.display !== 'granted') {
        displayPermission = await LocalNotifications.requestPermissions();
      }
      if (displayPermission.display !== 'granted') return { granted: false, reason: 'display-permission-denied' };
    }
    await PushNotifications.register();
    return { granted: true };
  })();
  try { return await pushRegistrationInProgress; }
  finally { pushRegistrationInProgress = null; }
}

async function refreshPushRegistration() {
  if (!isNative) return { granted: false, reason: 'not-native' };
  await installPushNotificationListeners();
  const permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') return { granted: false, reason: 'permission-not-granted' };
  if (Capacitor.getPlatform() === 'android') {
    const displayPermission = await LocalNotifications.checkPermissions();
    if (displayPermission.display !== 'granted') return { granted: false, reason: 'display-permission-not-granted' };
  }
  await PushNotifications.register();
  return { granted: true };
}

async function ensureNotificationPermission() {
  if (!isNative) return false;
  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') {
    permission = await LocalNotifications.requestPermissions();
  }
  return permission.display === 'granted';
}

async function setAppBadgeCount(value) {
  const count = Math.max(0, Math.min(999, Math.floor(Number(value) || 0)));
  if (isNative) {
    const supported = await Badge.isSupported().catch(() => ({ isSupported: false }));
    if (!supported?.isSupported) return { supported: false, count };
    if (count > 0) await Badge.set({ count });
    else await Badge.clear();
    return { supported: true, count };
  }
  if (typeof navigator !== 'undefined') {
    if (count > 0 && typeof navigator.setAppBadge === 'function') {
      await navigator.setAppBadge(count);
      return { supported: true, count };
    }
    if (count === 0 && typeof navigator.clearAppBadge === 'function') {
      await navigator.clearAppBadge();
      return { supported: true, count: 0 };
    }
  }
  return { supported: false, count };
}

async function scheduleReminder({ id, title, body, at }) {
  if (!isNative || !at) return false;
  const allowed = await ensureNotificationPermission();
  if (!allowed) return false;
  const when = new Date(Number(at));
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) return false;
  const notificationId = Math.max(1, Math.abs(Number(id) || 1));
  await LocalNotifications.schedule({
    notifications: [{
      id: notificationId,
      title: String(title || 'Pest Platform'),
      body: String(body || ''),
      schedule: { at: when, allowWhileIdle: false },
      channelId: ANDROID_NOTIFICATION_CHANNEL,
      extra: { source: 'pest-platform-crm' }
    }]
  });
  return true;
}

async function cancelReminder(id) {
  if (!isNative) return false;
  const notificationId = Math.max(1, Math.abs(Number(id) || 1));
  await LocalNotifications.cancel({ notifications: [{ id: notificationId }] });
  return true;
}

async function saveBase64File({ name, data, mimeType }) {
  if (!isNative) return false;
  const fileName = String(name || 'Pest-Platform-Export.dat').replace(/[\\/:*?"<>|]/g, '_');
  const saved = await Filesystem.writeFile({
    path: fileName,
    data: String(data || ''),
    directory: Directory.Cache,
    recursive: true
  });
  await Share.share({
    title: fileName,
    text: fileName,
    url: saved.uri,
    dialogTitle: 'Save or share file'
  });
  return true;
}

async function saveTextFile({ name, content, mimeType }) {
  if (!isNative) return false;
  const fileName = String(name || 'Pest-Platform-Export.txt').replace(/[\\/:*?"<>|]/g, '_');
  const saved = await Filesystem.writeFile({
    path: fileName,
    data: String(content || ''),
    directory: Directory.Cache,
    recursive: true,
    encoding: 'utf8'
  });
  await Share.share({
    title: fileName,
    text: fileName,
    url: saved.uri,
    dialogTitle: 'Save or share file'
  });
  return true;
}

window.PEST_NATIVE = {
  isNative,
  initializeOtaUpdates,
  ensureNotificationPermission,
  setAppBadgeCount,
  showForegroundNotification,
  enablePushNotifications,
  refreshPushRegistration,
  scheduleReminder,
  cancelReminder,
  saveBase64File,
  saveTextFile
};
