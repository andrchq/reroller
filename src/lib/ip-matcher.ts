function ipToInt(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((acc, part) => (acc << 8) + part, 0) >>> 0;
}

export function targetMatchesIp(target: string, ip: string) {
  if (target === ip) return true;
  if (!target.includes("/")) return false;

  const [networkRaw, bitsRaw] = target.split("/");
  const network = ipToInt(networkRaw);
  const candidate = ipToInt(ip);
  const bits = Number(bitsRaw);
  if (network === null || candidate === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (network & mask) === (candidate & mask);
}

export function findMatchedTarget(targets: string[], ip: string) {
  return targets.find((target) => targetMatchesIp(target, ip)) ?? null;
}
