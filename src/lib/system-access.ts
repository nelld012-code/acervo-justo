export const SYSTEM_OWNER_ID = "89d9645a-6916-4788-8935-5a492d17db19";

export function isSystemOwner(userId: string | null | undefined): boolean {
  return userId === SYSTEM_OWNER_ID;
}

export function shouldBlockSystemAccess({
  userId,
  isActive,
  accessError = false,
}: {
  userId: string | null | undefined;
  isActive: boolean | null | undefined;
  accessError?: boolean;
}): boolean {
  return !isSystemOwner(userId) && (accessError || isActive === false);
}
