import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRegRuRegletIp, normalizeRegRuServer } from "@/lib/regru";

test("normalizes Reg.ru server as project binding", () => {
  const result = normalizeRegRuServer({
    id: 6891,
    name: "prod",
    ip: "193.124.206.121",
    region_slug: "msk1",
  });

  assert.equal(result?.id, "6891");
  assert.equal(result?.name, "prod / 193.124.206.121");
  assert.deepEqual(result?.regions, ["msk1"]);
});

test("skips archived Reg.ru servers", () => {
  const result = normalizeRegRuServer({
    id: 6891,
    name: "old",
    region_slug: "msk1",
    status: "archive",
  });

  assert.equal(result, null);
});

test("normalizes Reg.ru server IP payload", () => {
  const result = normalizeRegRuRegletIp({
    id: 3319,
    ip: "193.124.204.254",
    region_slug: "msk1",
    status: "active",
  });

  assert.equal(result?.id, "3319");
  assert.equal(result?.floating_ip_address, "193.124.204.254");
  assert.equal(result?.project_id, "3319");
  assert.equal(result?.region, "msk1");
});
