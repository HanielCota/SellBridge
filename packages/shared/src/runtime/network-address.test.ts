import { describe, expect, it } from "vitest";
import { hostnameWithoutBrackets, isNonPublicAddress } from "./network-address.ts";

describe("isNonPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fe80::1",
    "fd00::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::127.0.0.1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::1",
    "::ffff:a9fe:a9fe",
    // Regression: IPv4-translated loopback, site-local and Teredo reached the network.
    "::ffff:0:7f00:1",
    "fec0::1",
    "2001::1",
    "2001:1ff::1",
    // Edges of the private IPv4 ranges.
    "172.16.0.0",
    "100.127.255.255",
  ])("refuses %s", (address) => {
    expect(isNonPublicAddress(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "172.15.255.255",
    "172.32.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "::ffff:8.8.8.8",
  ])("accepts %s", (address) => {
    expect(isNonPublicAddress(address)).toBe(false);
  });

  it("treats host names as not an address", () => {
    expect(isNonPublicAddress("localhost")).toBe(false);
  });

  it("strips IPv6 brackets from URL host names", () => {
    expect(hostnameWithoutBrackets(new URL("http://[::1]:8080/").hostname)).toBe("::1");
    expect(hostnameWithoutBrackets("example.com")).toBe("example.com");
  });
});
