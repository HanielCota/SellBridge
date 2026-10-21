import { BlockList, isIP } from "node:net";

/**
 * Addresses a server-side request must never reach on behalf of a customer (SSRF): this
 * machine, private networks, cloud metadata (169.254.169.254), carrier NAT, multicast and
 * reserved ranges. IPv4-mapped IPv6 (`::ffff:10.0.0.1`) is checked against the IPv4 rules by
 * `BlockList` itself.
 */
const NON_PUBLIC_RANGES: readonly [string, number, "ipv4" | "ipv6"][] = [
  ["0.0.0.0", 8, "ipv4"],
  ["10.0.0.0", 8, "ipv4"],
  ["100.64.0.0", 10, "ipv4"],
  ["127.0.0.0", 8, "ipv4"],
  ["169.254.0.0", 16, "ipv4"],
  ["172.16.0.0", 12, "ipv4"],
  ["192.0.0.0", 24, "ipv4"],
  ["192.0.2.0", 24, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["198.18.0.0", 15, "ipv4"],
  ["198.51.100.0", 24, "ipv4"],
  ["203.0.113.0", 24, "ipv4"],
  ["224.0.0.0", 4, "ipv4"],
  ["240.0.0.0", 4, "ipv4"],
  // Unspecified, loopback and the deprecated IPv4-compatible form (::127.0.0.1).
  ["::", 96, "ipv6"],
  // NAT64 and 6to4 embed an IPv4 address (64:ff9b::7f00:1 is 127.0.0.1): a gateway would
  // forward to it, and it may be private.
  ["64:ff9b::", 96, "ipv6"],
  ["64:ff9b:1::", 48, "ipv6"],
  ["2002::", 16, "ipv6"],
  ["100::", 64, "ipv6"],
  ["2001:db8::", 32, "ipv6"],
  // IPv4-translated (SIIT, ::ffff:0:7f00:1 is 127.0.0.1): `BlockList` maps only ::ffff:0:0/96.
  ["::ffff:0:0:0", 96, "ipv6"],
  // IETF protocol assignments, Teredo among them, which also embeds an IPv4 address.
  ["2001::", 23, "ipv6"],
  ["fc00::", 7, "ipv6"],
  ["fe80::", 10, "ipv6"],
  // Deprecated site-local, still routed inside some networks.
  ["fec0::", 10, "ipv6"],
  ["ff00::", 8, "ipv6"],
];

const nonPublicAddresses = new BlockList();
for (const [network, prefix, family] of NON_PUBLIC_RANGES) {
  nonPublicAddresses.addSubnet(network, prefix, family);
}

/** True for an IP literal outside the public internet; false for public ones and non-IPs. */
export function isNonPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 0) {
    return false;
  }
  return nonPublicAddresses.check(address, version === 4 ? "ipv4" : "ipv6");
}

/** `URL.hostname` keeps the brackets of IPv6 literals (`[::1]`); DNS and `isIP` do not want them. */
export function hostnameWithoutBrackets(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}
