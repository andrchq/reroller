import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFloatingIpListPayload, normalizeFloatingIpPayload, normalizeSubnetListPayload } from "@/lib/selectel";

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

test("normalizes Selectel floating IP list payload", () => {
  const result = normalizeFloatingIpListPayload({
    floatingips: [
      {
        id: "fip-1",
        floating_ip_address: "203.0.113.10",
        project_id: "project-1",
        region: "ru-1",
      },
      {
        id: "fip-2",
        ip_address: "198.51.100.7",
        project_id: "project-1",
        region: "ru-2",
      },
    ],
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].floating_ip_address, "203.0.113.10");
  assert.equal(result[1].floating_ip_address, "198.51.100.7");
});

test("normalizes Selectel subnet list payload", () => {
  const result = normalizeSubnetListPayload({
    subnets: [
      {
        id: "row-1",
        subnet_id: "subnet-1",
        network_id: "network-1",
        project_id: "project-1",
        region: "ru-1",
        cidr: "192.168.0.0/24",
        servers: [],
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].subnet_id, "subnet-1");
  assert.equal(result[0].network_id, "network-1");
  assert.equal(result[0].servers.length, 0);
});
