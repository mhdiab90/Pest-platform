import { mkdir, readFile, writeFile } from 'node:fs/promises';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
const drawableDir = 'android/app/src/main/res/drawable';
const rawDir = 'android/app/src/main/res/raw';
const valuesDir = 'android/app/src/main/res/values';

await mkdir(drawableDir, { recursive: true });
await mkdir(rawDir, { recursive: true });
await mkdir(valuesDir, { recursive: true });

const iconPath = drawableDir + '/ic_stat_pest_notification.xml';
const iconXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M12,2 L8,5 L6,10 L6,16 L4,18 H20 L18,16 L18,10 L16,5 Z M10,20 H14 L14,21 H10 Z"/>
</vector>
`;
await writeFile(iconPath, iconXml, 'utf8');

// Generate a short original two-tone notification chime for the PEST Android channel.
const sampleRate = 22050;
const segments = [
  { frequency: 880, duration: 0.12 },
  { frequency: 0, duration: 0.035 },
  { frequency: 1174, duration: 0.16 }
];
const sampleCount = Math.floor(segments.reduce((sum, item) => sum + item.duration, 0) * sampleRate);
const pcm = Buffer.alloc(sampleCount * 2);
let offset = 0;
for (const segment of segments) {
  const count = Math.floor(segment.duration * sampleRate);
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    const fadeIn = Math.min(1, i / Math.max(1, sampleRate * 0.012));
    const fadeOut = Math.min(1, (count - i) / Math.max(1, sampleRate * 0.035));
    const envelope = fadeIn * fadeOut * 0.22;
    const sample = segment.frequency ? Math.sin(2 * Math.PI * segment.frequency * t) * envelope : 0;
    pcm.writeInt16LE(Math.max(-1, Math.min(1, sample)) * 32767, offset);
    offset += 2;
  }
}
const wav = Buffer.alloc(44 + pcm.length);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + pcm.length, 4);
wav.write('WAVE', 8);
wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(pcm.length, 40);
pcm.copy(wav, 44);
await writeFile(rawDir + '/pest_notification.wav', wav);

// Give FCM a valid monochrome status-bar icon and a known default channel.
const colorsPath = valuesDir + '/pest_notification_colors.xml';
await writeFile(colorsPath, `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="pest_notification_color">#14517a</color>
</resources>
`, 'utf8');

let manifest = await readFile(manifestPath, 'utf8');
const metadata = [
  '<meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_pest_notification" />',
  '<meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/pest_notification_color" />',
  '<meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="pest_alerts_v3" />'
];
for (const line of metadata) {
  const key = line.match(/android:name="([^"]+)"/)[1];
  if (!manifest.includes(key)) {
    if (!manifest.includes('</application>')) throw new Error('AndroidManifest.xml has no application closing tag.');
    manifest = manifest.replace('</application>', '        ' + line + '\n    </application>');
  }
}
await writeFile(manifestPath, manifest, 'utf8');
console.log('Android notification channel, monochrome icon and default sound resource configured.');
