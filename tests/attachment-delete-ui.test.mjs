import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("record attachments, chat files, and previews provide a delete action", () => {
  assert.match(app, /canDeleteRecordAttachment\\(entityType,entityId\\)&&<button[^>]*onClick=\{\(\)=>removeRecordAttachment\(entityType,entityId,item\)\}/);
  assert.match(app, /canDeleteRecordAttachment\('message'\)&&<button[\s\S]{0,500}removeRecordAttachment\('message',messageId,file\)/);
  assert.match(app, /removeRecordAttachment\('message',messageId,file\)/);
  assert.match(app, /attachmentPreview\\.attachment&&\\(attachmentPreview\\.onDelete\\|\\|canDeleteRecordAttachment\\(attachmentPreview\\.entityType,attachmentPreview\\.entityId\\)\\)/);
  assert.match(app, /async function removeRecordAttachment\(entityType,entityId,attachment\)/);
  assert.match(app, /async function deleteAttachmentFromPreview\(\)/);
  assert.match(app, /attachmentPreview\.onDelete/);
});

test("attachment manager and common record screens use the same Worker delete endpoint", () => {
  assert.match(app, /attachmentWorkerRequest\('\/attachments','DELETE',\{id:attachment\.id,entityType:attachmentEntityType,entityId:attachmentEntityId\}\)/);
  assert.match(app, /attachmentWorkerRequest\('\/attachments','DELETE',\{id:attachment\.id,entityType,entityId\}\)/);
});

const worker = readFileSync(new URL("../cloudflare/worker.js", import.meta.url), "utf8");

test("Google Drive status detects invalid refresh tokens and asks for reauthorization", () => {
  assert.match(worker, /error\.reauthorizationRequired=code==="invalid_grant"/);
  assert.match(worker, /await googleDriveAccessToken\(env,connection\)/);
  assert.match(worker, /needsReauthorization,authorizationStatus,authorizationError/);
  assert.match(app, /driveConnectionStatus\.needsReauthorization/);
  assert.match(app, /Reconnect Google Drive account/);
  assert.match(app, /connected:false,needsReauthorization:true,authorizationStatus:'reauthorization_required'/);
  assert.match(app, /attachment-appsscript-gateway-20261125-4/);
  assert.match(app, /const mainScreenAttachmentModules=/);
  assert.match(app, /screenAttachmentContext&&renderRecordAttachments\(screenAttachmentContext\.entityType,screenAttachmentContext\.entityId/);
  assert.match(app, /entityType==='screen'&&hasPermission\('attachments','add'\)/);
  assert.match(app, /layout='side',onDelete=null/);
  assert.match(app, /layout:'modal'/);
  assert.match(app, /layout:'side'/);
});
