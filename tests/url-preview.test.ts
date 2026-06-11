import { describe, expect, it } from "vitest";
import { ipv4IsPrivate, ipv6IsPrivate } from "../src/pages/api/url-preview";

describe("ipv4IsPrivate", () => {
  it("rejects loopback", () => {
    expect(ipv4IsPrivate("127.0.0.1")).toBe(true);
    expect(ipv4IsPrivate("127.255.255.255")).toBe(true);
    expect(ipv4IsPrivate("127.1.2.3")).toBe(true);
  });

  it("rejects 10.0.0.0/8", () => {
    expect(ipv4IsPrivate("10.1.2.3")).toBe(true);
    expect(ipv4IsPrivate("10.255.255.255")).toBe(true);
  });

  it("rejects 172.16.0.0/12", () => {
    expect(ipv4IsPrivate("172.16.0.1")).toBe(true);
    expect(ipv4IsPrivate("172.31.255.255")).toBe(true);
    expect(ipv4IsPrivate("172.32.0.1")).toBe(false);
  });

  it("rejects 192.168.0.0/16", () => {
    expect(ipv4IsPrivate("192.168.0.5")).toBe(true);
    expect(ipv4IsPrivate("192.168.255.255")).toBe(true);
    expect(ipv4IsPrivate("192.169.0.1")).toBe(false);
  });

  it("rejects 169.254.0.0/16 (link-local)", () => {
    expect(ipv4IsPrivate("169.254.169.254")).toBe(true);
    expect(ipv4IsPrivate("169.254.1.1")).toBe(true);
  });

  it("rejects 0.0.0.0/8", () => {
    expect(ipv4IsPrivate("0.0.0.0")).toBe(true);
    expect(ipv4IsPrivate("0.255.255.255")).toBe(true);
  });

  it("rejects 100.64.0.0/10 (CGN)", () => {
    expect(ipv4IsPrivate("100.64.0.1")).toBe(true);
    expect(ipv4IsPrivate("100.100.0.1")).toBe(true);
    expect(ipv4IsPrivate("100.127.255.255")).toBe(true);
    expect(ipv4IsPrivate("100.128.0.1")).toBe(false);
  });

  it("allows public addresses", () => {
    expect(ipv4IsPrivate("8.8.8.8")).toBe(false);
    expect(ipv4IsPrivate("1.1.1.1")).toBe(false);
    expect(ipv4IsPrivate("93.184.216.34")).toBe(false);
  });

  it("returns false for invalid input", () => {
    expect(ipv4IsPrivate("not.an.ip")).toBe(false);
    expect(ipv4IsPrivate("")).toBe(false);
    expect(ipv4IsPrivate("999.999.999.999")).toBe(false);
  });
});

describe("ipv6IsPrivate", () => {
  it("rejects loopback ::1", () => {
    expect(ipv6IsPrivate("::1")).toBe(true);
  });

  it("rejects fc00::/7 (unique-local)", () => {
    expect(ipv6IsPrivate("fc00::1")).toBe(true);
    expect(ipv6IsPrivate("fd12:3456::1")).toBe(true);
  });

  it("rejects fe80::/10 (link-local)", () => {
    expect(ipv6IsPrivate("fe80::1")).toBe(true);
    expect(ipv6IsPrivate("fe90::1")).toBe(true);
    expect(ipv6IsPrivate("fea0::1")).toBe(true);
    expect(ipv6IsPrivate("feb0::1")).toBe(true);
  });

  it("rejects IPv4-mapped private addresses", () => {
    expect(ipv6IsPrivate("::ffff:127.0.0.1")).toBe(true);
    expect(ipv6IsPrivate("::ffff:10.0.0.1")).toBe(true);
    expect(ipv6IsPrivate("::ffff:192.168.1.1")).toBe(true);
    expect(ipv6IsPrivate("::ffff:8.8.8.8")).toBe(false);
  });

  it("rejects hex-encoded IPv4-mapped private addresses", () => {
    expect(ipv6IsPrivate("::ffff:7f00:1")).toBe(true);
    expect(ipv6IsPrivate("::ffff:0a00:0001")).toBe(true);
    expect(ipv6IsPrivate("::ffff:c0a8:101")).toBe(true);
    expect(ipv6IsPrivate("::ffff:808:808")).toBe(false);
  });

  it("allows public addresses", () => {
    expect(ipv6IsPrivate("2001:4860:4860::8888")).toBe(false);
    expect(ipv6IsPrivate("2606:4700:4700::1111")).toBe(false);
  });
});
