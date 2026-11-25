import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("record attachments, chat files, and previews provide a delete action", () => {
  assert.match(app, /canDeleteRecordAttachment\(entityType\)&&<button[^>]*onClick=\{\(\)=>removeRecordAttachment\(entityType,entityId,item\)\}/);
  assert.match(app, /canDeleteRecordAttachment\('message'\)&&<button[\s\S]{0,500}removeRecordAttachment\('message',messageId,file\)/);
  assert.match(app, /removeRecordAttachment\('message',messageId,file\)/);
  assert.match(app, /attachmentPreview\.attachment&&canDeleteRecordAttachment\(attachmentPreview\.entityType\)/);
  assert.match(app, /async function removeRecordAttachment\(entityType,entityId,attachment\)/);
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
  assert.match(app, /attachment-appsscript-gateway-20261125-2/);
});
