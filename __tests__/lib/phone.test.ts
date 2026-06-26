import {
  formatPhoneForStorage,
  isValidPhoneNumber,
} from "@/lib/phone"

describe("phone", () => {
  describe("Polish numbers", () => {
    it("validates national and +48 formats", () => {
      expect(isValidPhoneNumber("500123456")).toBe(true)
      expect(isValidPhoneNumber("500 123 456")).toBe(true)
      expect(isValidPhoneNumber("+48 500 123 456")).toBe(true)
      expect(isValidPhoneNumber("48500123456")).toBe(true)
    })

    it("normalizes Polish numbers to +48", () => {
      expect(formatPhoneForStorage("500 123 456")).toBe("+48500123456")
      expect(formatPhoneForStorage("+48 500 123 456")).toBe("+48500123456")
    })
  })

  describe("Belgian numbers", () => {
    it("validates national and +32 formats", () => {
      expect(isValidPhoneNumber("0470123456")).toBe(true)
      expect(isValidPhoneNumber("0470 12 34 56")).toBe(true)
      expect(isValidPhoneNumber("+32 470 12 34 56")).toBe(true)
      expect(isValidPhoneNumber("32470123456")).toBe(true)
      expect(isValidPhoneNumber("02 123 45 67")).toBe(true)
    })

    it("normalizes Belgian numbers to +32", () => {
      expect(formatPhoneForStorage("0470 12 34 56")).toBe("+32470123456")
      expect(formatPhoneForStorage("+32 470 12 34 56")).toBe("+32470123456")
      expect(formatPhoneForStorage("32470123456")).toBe("+32470123456")
    })
  })

  it("rejects invalid numbers", () => {
    expect(isValidPhoneNumber("")).toBe(false)
    expect(isValidPhoneNumber("12345")).toBe(false)
    expect(isValidPhoneNumber("0012345678")).toBe(false)
    expect(isValidPhoneNumber("+1 555 123 4567")).toBe(false)
  })
})
