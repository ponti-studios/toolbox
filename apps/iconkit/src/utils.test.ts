import { describe, test, expect } from "bun:test";
import { fmtSize, parseSize, stripExt } from "./utils";

describe("fmtSize", () => {
  test("formats bytes", () => {
    expect(fmtSize(0)).toBe("0B");
    expect(fmtSize(512)).toBe("512B");
    expect(fmtSize(1023)).toBe("1023B");
  });

  test("formats kilobytes", () => {
    expect(fmtSize(1024)).toBe("1.0KB");
    expect(fmtSize(1536)).toBe("1.5KB");
    expect(fmtSize(102400)).toBe("100.0KB");
  });

  test("formats megabytes", () => {
    const mb = 1024 * 1024;
    expect(fmtSize(mb)).toBe("1.0MB");
    expect(fmtSize(Math.round(2.5 * mb))).toBe("2.5MB");
  });

  test("formats gigabytes", () => {
    const gb = 1024 * 1024 * 1024;
    expect(fmtSize(gb)).toBe("1.0GB");
    expect(fmtSize(Math.round(1.5 * gb))).toBe("1.5GB");
  });
});

describe("parseSize", () => {
  test("parses standard sizes", () => {
    expect(parseSize("500x500")).toEqual({ width: 500, height: 500 });
    expect(parseSize("1200x630")).toEqual({ width: 1200, height: 630 });
    expect(parseSize("16x16")).toEqual({ width: 16, height: 16 });
  });

  test("parses large sizes", () => {
    expect(parseSize("3840x2160")).toEqual({ width: 3840, height: 2160 });
  });

  test("throws on missing dimension", () => {
    expect(() => parseSize("500x")).toThrow();
    expect(() => parseSize("x500")).toThrow();
  });

  test("throws on non-numeric input", () => {
    expect(() => parseSize("axb")).toThrow();
    expect(() => parseSize("foo")).toThrow();
  });

  test("throws on empty string", () => {
    expect(() => parseSize("")).toThrow();
  });

  test("throws on extra characters", () => {
    expect(() => parseSize("500x500 ")).toThrow();
    expect(() => parseSize(" 500x500")).toThrow();
  });
});

describe("stripExt", () => {
  test("strips single extension", () => {
    expect(stripExt("foo.png")).toBe("foo");
    expect(stripExt("image.jpg")).toBe("image");
  });

  test("strips only last extension", () => {
    expect(stripExt("foo.bar.png")).toBe("foo.bar");
    expect(stripExt("archive.tar.gz")).toBe("archive.tar");
  });

  test("handles files without extension", () => {
    expect(stripExt("foo")).toBe("foo");
    expect(stripExt("makefile")).toBe("makefile");
  });

  test("handles paths", () => {
    expect(stripExt("/path/to/file.png")).toBe("file");
    expect(stripExt("/path/to/archive.tar.gz")).toBe("archive.tar");
  });

  test("handles dotfiles", () => {
    expect(stripExt(".hidden")).toBe(".hidden");
    expect(stripExt(".hidden.txt")).toBe(".hidden");
  });
});
