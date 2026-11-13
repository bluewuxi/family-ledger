import assert from "node:assert/strict";
import { ApiClientError } from "./src/lib/apiClient";
import { AuthClientError } from "./src/lib/authClient";
import { describeUiError, translateUiError } from "./src/i18n/uiErrors";

const reason = { kind: "workflow", reason: "ADMIN_PASSWORD_REJECTED" } as const;
const rejected = new AuthClientError(401, "UNAUTHORIZED", { ...reason, submittedValue: "fake-secret" });
assert.deepEqual(rejected.details, reason);
const descriptor = describeUiError(rejected, "passwordReset");
assert.equal(descriptor.key, "adminPasswordRejected");
assert.notEqual(translateUiError(descriptor, "en"), translateUiError(descriptor, "zh-CN"));
assert.equal(describeUiError(rejected, "login").key, "invalidCredentials");

const invalid = new ApiClientError("fake-secret", "VALIDATION_ERROR", 400, { kind: "workflow", reason: "UNKNOWN" });
assert.equal(invalid.details, undefined);
assert.equal(describeUiError(invalid, "educationSave").key, "educationInvalid");
const old = new ApiClientError("Legacy", "FORBIDDEN", 403, { reason: "EXTRA_PASSWORD_REJECTED" });
assert.equal(describeUiError(old, "gateSave").key, "investment");
assert.equal(describeUiError(new ApiClientError("Legacy", "CONFLICT", 409), "accessSave").key, "accessConflict");
assert.equal(describeUiError(new Error("fake-secret"), "accessSave").key, "uncertainWrite");
assert.equal(describeUiError(new Error("fake-secret"), "passwordReset").key, "resetUnknown");
console.log("Phase 4 client error compatibility and disclosure checks passed.");
