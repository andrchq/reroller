import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTimewebFloatingIp } from "@/lib/timeweb";

test("normalizes Timeweb floating IP payload", () => {
  const result = normalizeTimewebFloatingIp({
    ip: {
      id: "4df0e781-cafb-4419-9636-ce5fc93591af",
      ip: "82.97.244.202",
      availability_zone: "spb-1",
    },
  });

  assert.equal(result?.id, "4df0e781-cafb-4419-9636-ce5fc93591af");
  assert.equal(result?.floating_ip_address, "82.97.244.202");
  assert.equal(result?.region, "spb-1");
});
