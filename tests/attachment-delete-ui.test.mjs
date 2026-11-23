import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("record attachments, chat files, and previews provide a delete action", () => {
  assert.match(app, /hasPermission\('attachments','delete'\)&&<button[^>]*onClick=\{?[^>]*removeRecordAttachment/);
  assert.match(app, /removeRecordAttachment\('message',messageId,file\)/);
  assert.match(app, /attachmentPreview\.attachment&&hasPermission\('attachments','delete'\)/);
  assert.match(app, /async function removeRecordAttachment\(entityType,entityId,attachment\)/);
});

test("attachment manager and common record screens use the same Worker delete endpoint", () => {
  assert.match(app, /attachmentWorkerRequest\('\/attachments','DELETE',\{id:attachment\.id,entityType:attachmentEntityType,entityId:attachmentEntityId\}\)/);
  assert.match(app, /attachmentWorkerRequest\('\/attachments','DELETE',\{id:attachment\.id,entityType,entityId\}\)/);
});
