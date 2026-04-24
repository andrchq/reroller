import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFloatingIpPayload } from "@/lib/selectel";

test("normalizes documented Selectel floating IP payload", () => {
  const result = normalizeFloatingIpPayload({
    floatingip: {
      id: "fip-1",
      floating_ip_address: "203.0.113.10",
      project_id: "project-1",
      region: "ru-1",
      status: "ACTIVE",
    },
  });

  assert.equal(result?.id, "fip-1");
  assert.equal(result?.floating_ip_address, "203.0.113.10");
});

test("normalizes array wrapped Selectel floating IP payload", () => {
  const result = normalizeFloatingIpPayload({
    floatingips: [
      {
        id: "fip-2",
        ip_address: "198.51.100.7",
        project_id: "project-1",
        region: "ru-2",
      },
    ],
  });

  assert.equal(result?.id, "fip-2");
  assert.equal(result?.floating_ip_address, "198.51.100.7");
});
