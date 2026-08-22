import { describe, expect, it } from "vitest";
import { p1363ToDer, toBase64Url } from "./bytes.js";
import { encodeCbor } from "./cbor.js";

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

describe("encodeCbor", () => {
  it("кодирует малые целые одним байтом", () => {
    expect(hex(encodeCbor(0))).toBe("00");
    expect(hex(encodeCbor(23))).toBe("17");
  });

  it("переходит на длинные формы по мере роста", () => {
    expect(hex(encodeCbor(24))).toBe("1818");
    expect(hex(encodeCbor(500))).toBe("1901f4");
    expect(hex(encodeCbor(70000))).toBe("1a00011170");
  });

  it("кодирует отрицательные как −1 − n", () => {
    expect(hex(encodeCbor(-1))).toBe("20");
    expect(hex(encodeCbor(-7))).toBe("26");
  });

  it("кодирует строки и байты разными типами", () => {
    expect(hex(encodeCbor("fmt"))).toBe("63666d74");
    expect(hex(encodeCbor(Uint8Array.of(1, 2, 3)))).toBe("43010203");
  });

  it("кодирует карты и массивы", () => {
    expect(hex(encodeCbor(new Map([["a", 1]])))).toBe("a1616101");
    expect(hex(encodeCbor([1, 2]))).toBe("820102");
    expect(hex(encodeCbor(new Map()))).toBe("a0");
  });

  it("отказывается от дробных чисел, а не молча их портит", () => {
    expect(() => encodeCbor(1.5)).toThrow();
  });
});

describe("p1363ToDer", () => {
  it("оборачивает пару r‖s в SEQUENCE из двух INTEGER", () => {
    const raw = new Uint8Array(64);
    raw[31] = 1;
    raw[63] = 2;
    expect(hex(p1363ToDer(raw))).toBe("3006020101020102");
  });

  it("добавляет нулевой байт, когда старший бит поднят", () => {
    const raw = new Uint8Array(64);
    raw[0] = 0x80;
    raw[63] = 1;
    const der = p1363ToDer(raw);
    expect(der[0]).toBe(0x30);
    expect(der[2]).toBe(0x02);
    expect(der[4]).toBe(0x00); // padding before the 0x80 byte
    expect(der[5]).toBe(0x80);
  });
});

describe("toBase64Url", () => {
  it("не оставляет символов, недопустимых в URL", () => {
    const encoded = toBase64Url(Uint8Array.of(251, 255, 190, 255));
    expect(encoded).toBe("-_--_w");
  });
});
