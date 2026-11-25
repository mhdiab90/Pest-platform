const GATEWAY_VERSION = "pest-drive-gateway-2026-11-25-1";
const GATEWAY_SECRET_PROPERTY = "GATEWAY_SECRET";
const ATTACHMENT_FOLDER_PROPERTY = "PEST_ATTACHMENT_FOLDER_ID";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_BODY_CHARS = 31 * 1024 * 1024;
const ALLOWED_TYPES = {
  "application/pdf": ["pdf"], "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"],
  "text/plain": ["txt"], "text/csv": ["csv"], "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"], "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"]
};

function doGet() { return jsonOutput_({ ok: false, error: "POST only." }); }

function doPost(event) {
  try {
    const rawBody = event && event.postData && event.postData.contents ? String(event.postData.contents) : "";
    if (!rawBody || rawBody.length > MAX_BODY_CHARS) throw new Error("Gateway request is empty or exceeds the pilot request limit.");
    const envelope = JSON.parse(rawBody);
    verifyEnvelope_(envelope);
    const request = JSON.parse(envelope.payload);
    return jsonOutput_({ ok: true, result: dispatchRequest_(request) });
  } catch (error) {
    const message = String(error && error.message || error || "Gateway request failed.");
    console.error("Pest Drive Gateway: " + message.slice(0, 300));
    return jsonOutput_({ ok: false, error: message.slice(0, 240) });
  }
}

function verifyEnvelope_(envelope) {
  if (!envelope || typeof envelope !== "object") throw new Error("Invalid signed request envelope.");
  const timestamp = String(envelope.timestamp || ""), nonce = String(envelope.nonce || "");
  const payload = String(envelope.payload || ""), suppliedSignature = String(envelope.signature || "");
  if (!/^\d{10,16}$/.test(timestamp)) throw new Error("Invalid request timestamp.");
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(nonce)) throw new Error("Invalid request nonce.");
  if (!payload || payload.length > MAX_BODY_CHARS) throw new Error("Invalid signed payload.");
  if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) throw new Error("Signed request has expired.");
  const secret = PropertiesService.getScriptProperties().getProperty(GATEWAY_SECRET_PROPERTY);
  if (!secret || String(secret).length < 32) throw new Error("Gateway secret is not configured in Apps Script project properties.");
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload, Utilities.Charset.UTF_8);
  const digestBase64Url = base64Url_(digest);
  const canonicalMessage = [timestamp, nonce, digestBase64Url].join("\n");
  const expectedSignature = base64Url_(Utilities.computeHmacSha256Signature(canonicalMessage, secret, Utilities.Charset.UTF_8));
  if (!constantTimeEquals_(expectedSignature, suppliedSignature)) throw new Error("Gateway signature is invalid.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error("Gateway is busy. Retry the request.");
  try {
    // Persist accepted nonces for the full signature-validity window. Unlike CacheService,
    // Script Properties do not silently evict replay markers before their expiry.
    const properties = PropertiesService.getScriptProperties();
    const allProperties = properties.getProperties();
    const expiryCutoff = Date.now() - 10 * 60 * 1000;
    Object.keys(allProperties).forEach(function (key) {
      if (key.indexOf("GATEWAY_NONCE_") === 0 && Number(allProperties[key]) < expiryCutoff) {
        properties.deleteProperty(key);
      }
    });
    const nonceKey = "GATEWAY_NONCE_" + nonce;
    if (properties.getProperty(nonceKey)) throw new Error("Duplicate gateway request was rejected.");
    properties.setProperty(nonceKey, timestamp);
  } finally { lock.releaseLock(); }
}

function dispatchRequest_(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new Error("Invalid gateway operation.");
  switch (String(request.action || "")) {
    case "ping": return { gatewayVersion: GATEWAY_VERSION, effectiveUserEmail: Session.getEffectiveUser().getEmail() || "", folderId: ensureAttachmentFolder_(request.folderId).getId() };
    case "upload": return uploadFile_(request);
    case "download": return downloadFile_(request);
    case "replace": return replaceFile_(request);
    case "delete": return deleteFile_(request);
    default: throw new Error("Unsupported gateway action.");
  }
}

function ensureAttachmentFolder_(preferredFolderId) {
  const properties = PropertiesService.getScriptProperties();
  if (preferredFolderId) {
    const preferredId = safeIdentifier_(preferredFolderId, "company attachment folder ID");
    const preferredFolder = DriveApp.getFolderById(preferredId);
    properties.setProperty(ATTACHMENT_FOLDER_PROPERTY, preferredId);
    return preferredFolder;
  }
  const savedId = properties.getProperty(ATTACHMENT_FOLDER_PROPERTY);
  if (savedId) { try { return DriveApp.getFolderById(savedId); } catch (error) { properties.deleteProperty(ATTACHMENT_FOLDER_PROPERTY); } }
  const matchingFolders = DriveApp.getFoldersByName("Pest Platform Attachments");
  const folder = matchingFolders.hasNext() ? matchingFolders.next() : DriveApp.createFolder("Pest Platform Attachments");
  properties.setProperty(ATTACHMENT_FOLDER_PROPERTY, folder.getId());
  return folder;
}

function uploadFile_(request) {
  const fileName = validateFileName_(request.fileName), mimeType = validateMimeAndExtension_(request.mimeType, fileName);
  const base64 = String(request.fileBase64 || "");
  if (!base64) throw new Error("The upload payload does not contain file data.");
  const bytes = Utilities.base64Decode(base64); validateFileBytes_(bytes);
  const file = ensureAttachmentFolder_().createFile(Utilities.newBlob(bytes, mimeType, fileName));
  file.setDescription("Pest Platform attachment ID: " + safeIdentifier_(request.attachmentId, "attachment ID"));
  return fileSummary_(file);
}

function downloadFile_(request) {
  const file = DriveApp.getFileById(safeIdentifier_(request.driveFileId, "Google Drive file ID"));
  const bytes = file.getBlob().getBytes();
  if (bytes.length > MAX_FILE_BYTES) throw new Error("The stored file exceeds the 20 MiB pilot limit.");
  return { file: fileSummary_(file), dataBase64: Utilities.base64Encode(bytes) };
}

function replaceFile_(request) {
  const oldFile = DriveApp.getFileById(safeIdentifier_(request.driveFileId, "Google Drive file ID"));
  const fileName = validateFileName_(request.fileName || oldFile.getName());
  const mimeType = validateMimeAndExtension_(request.mimeType, fileName), base64 = String(request.fileBase64 || "");
  if (!base64) throw new Error("The replacement payload does not contain file data.");
  const bytes = Utilities.base64Decode(base64); validateFileBytes_(bytes);
  const parents = oldFile.getParents(), folder = parents.hasNext() ? parents.next() : ensureAttachmentFolder_();
  const replacement = folder.createFile(Utilities.newBlob(bytes, mimeType, fileName));
  replacement.setDescription(oldFile.getDescription() || "Pest Platform attachment replacement");
  try { oldFile.setTrashed(true); } catch (error) { replacement.setTrashed(true); throw new Error("New file created, but the previous Drive file could not be retired."); }
  return fileSummary_(replacement);
}

function deleteFile_(request) {
  const id = safeIdentifier_(request.driveFileId, "Google Drive file ID");
  DriveApp.getFileById(id).setTrashed(true);
  return { deleted: true, driveFileId: id, movedToTrash: true };
}

function fileSummary_(file) { return { id: file.getId(), name: file.getName(), mimeType: file.getMimeType() || "application/octet-stream", size: Number(file.getSize() || 0), createdTime: file.getDateCreated().toISOString() }; }
function validateFileName_(value) {
  const name = String(value || "").trim();
  if (!name || name.length > 180 || /[\u0000-\u001f\u007f/\\]/.test(name)) throw new Error("Invalid attachment file name.");
  return name;
}
function validateMimeAndExtension_(mimeType, fileName) {
  const mime = String(mimeType || "").toLowerCase().trim(), match = fileName.match(/\.([a-z0-9]{1,10})$/i);
  const extension = match ? match[1].toLowerCase() : "";
  if (!ALLOWED_TYPES[mime] || ALLOWED_TYPES[mime].indexOf(extension) < 0) throw new Error("This attachment type is not allowed.");
  return mime;
}
function validateFileBytes_(bytes) { if (!bytes || !bytes.length) throw new Error("The selected file is empty."); if (bytes.length > MAX_FILE_BYTES) throw new Error("The maximum attachment size is 20 MiB."); }
function safeIdentifier_(value, label) { const id = String(value || ""); if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw new Error("Invalid " + label + "."); return id; }
function base64Url_(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, ""); }
function constantTimeEquals_(left, right) {
  const a = String(left || ""), b = String(right || ""); let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}

// Run this in the Apps Script editor after authorization. It creates and trashes a tiny binary test file.
function runGatewayDriveSelfTest() {
  const expected = [0, 1, 2, 127, 128, 254, 255];
  const file = ensureAttachmentFolder_().createFile(Utilities.newBlob(expected, "application/octet-stream", "pest-gateway-self-test.bin"));
  try {
    const actual = file.getBlob().getBytes();
    if (actual.length !== expected.length) throw new Error("Drive round-trip byte count did not match.");
    for (let i = 0; i < expected.length; i += 1) if ((actual[i] & 255) !== expected[i]) throw new Error("Drive round-trip binary content did not match.");
    return { success: true, gatewayVersion: GATEWAY_VERSION, effectiveUserEmail: Session.getEffectiveUser().getEmail() || "", testedBytes: actual.length };
  } finally { file.setTrashed(true); }
}
function jsonOutput_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
