import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecret, encryptSecret } from "../src/lib/crypto";

process.env.APP_SECRET_KEY = "test-secret";

test("encrypts and decrypts secrets", () => {
  const encrypted = encryptSecret("selectel-password");
  assert.notEqual(encrypted, "selectel-password");
  assert.equal(decryptSecret(encrypted), "selectel-password");
});
