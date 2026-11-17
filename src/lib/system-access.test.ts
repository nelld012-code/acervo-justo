// @ts-expect-error Vitest é executado sob demanda com bunx, sem dependência fixa no projeto.
import { describe, expect, it } from "vitest";
import { isSystemOwner, shouldBlockSystemAccess, SYSTEM_OWNER_ID } from "./system-access";

describe("system access suspension", () => {
  it("allows only the exact owner UUID to bypass an inactive system", () => {
    expect(isSystemOwner(SYSTEM_OWNER_ID)).toBe(true);
    expect(shouldBlockSystemAccess({ userId: SYSTEM_OWNER_ID, isActive: false })).toBe(false);
  });

  it("blocks another administrator's UUID when the system is inactive", () => {
    const anotherAdministratorId = "00000000-0000-4000-8000-000000000001";
    expect(isSystemOwner(anotherAdministratorId)).toBe(false);
    expect(shouldBlockSystemAccess({ userId: anotherAdministratorId, isActive: false })).toBe(true);
  });

  it("blocks a signed-out visitor when the system is inactive", () => {
    expect(shouldBlockSystemAccess({ userId: null, isActive: false })).toBe(true);
  });

  it("does not block non-owners while the system is active", () => {
    expect(
      shouldBlockSystemAccess({ userId: "00000000-0000-4000-8000-000000000001", isActive: true }),
    ).toBe(false);
  });

  it("fails closed for non-owners if the access status cannot be read", () => {
    expect(
      shouldBlockSystemAccess({
        userId: "00000000-0000-4000-8000-000000000001",
        isActive: null,
        accessError: true,
      }),
    ).toBe(true);
  });

  it("lets the owner enter even if the access status cannot be read", () => {
    expect(
      shouldBlockSystemAccess({ userId: SYSTEM_OWNER_ID, isActive: null, accessError: true }),
    ).toBe(false);
  });
});
