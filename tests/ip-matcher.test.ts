import assert from "node:assert/strict";
import test from "node:test";
import { findMatchedTarget, targetMatchesIp } from "@/lib/ip-matcher";

test("matches exact IP targets", () => {
  assert.equal(targetMatchesIp("203.0.113.10", "203.0.113.10"), true);
  assert.equal(targetMatchesIp("203.0.113.11", "203.0.113.10"), false);
});

test("matches CIDR targets", () => {
  assert.equal(targetMatchesIp("198.51.100.0/24", "198.51.100.42"), true);
  assert.equal(targetMatchesIp("198.51.100.0/24", "198.51.101.42"), false);
});

test("finds the first matching target", () => {
  assert.equal(findMatchedTarget(["203.0.113.10", "198.51.100.0/24"], "198.51.100.42"), "198.51.100.0/24");
});
