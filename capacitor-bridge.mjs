import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const isNative = Capacitor.isNativePlatform();

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
  ensureNotificationPermission,
  scheduleReminder,
  cancelReminder,
  saveBase64File,
  saveTextFile
};
