import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { PushNotifications } from '@capacitor/push-notifications';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

const isNative = Capacitor.isNativePlatform();
let pushListenersInstalled = false;
let pushRegistrationInProgress = null;

function dispatchPushEvent(name, detail) {
  if (typeof window === 'undefined') return;
  if (name === 'pest-push-token') window.PEST_PENDING_PUSH_TOKEN = detail;
  if (name === 'pest-push-opened') window.PEST_PENDING_PUSH_OPENED = detail;
  window.dispatchEvent(new CustomEvent(name, { detail }));
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
  await PushNotifications.addListener('registration', token => dispatchPushEvent('pest-push-token', { token: token.value, platform: 'android' }));
  await PushNotifications.addListener('registrationError', error => dispatchPushEvent('pest-push-error', { message: String(error?.error || error?.message || 'FCM registration failed') }));
  await PushNotifications.addListener('pushNotificationReceived', notification => {
    const payload = notification || {};
    dispatchPushEvent('pest-push-received', payload);
    const title = String(payload.title || 'Pest Platform');
    const body = String(payload.body || 'لديك تنبيه جديد. افتح التطبيق للاطلاع على التفاصيل.');
    const notificationId = Math.max(1, Date.now() % 2147483647);
    LocalNotifications.checkPermissions().then(permission => {
      if (permission.display !== 'granted') return;
      return LocalNotifications.schedule({
        notifications: [{
          id: notificationId,
          title,
          body,
          schedule: { at: new Date(Date.now() + 150) },
          channelId: 'default',
          extra: { source: 'pest-platform-push' }
        }]
      });
    }).catch(error => console.warn('Foreground Android notification could not be displayed:', error));
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', action => dispatchPushEvent('pest-push-opened', action?.notification?.data || {}));
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
    if (permission.receive !== 'granted') return { granted: false, reason: 'permission-denied' };
    if (Capacitor.getPlatform() === 'android') await PushNotifications.createChannel({ id: 'default', name: 'Pest Platform', description: 'Pest Platform alerts', importance: 5, visibility: 1, vibration: true }).catch(() => {});
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
  enablePushNotifications,
  refreshPushRegistration,
  scheduleReminder,
  cancelReminder,
  saveBase64File,
  saveTextFile
};
