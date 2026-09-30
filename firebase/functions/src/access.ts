import { licenseAccess } from "../../../src/domain/license";

export function canReadWarehouse(license: any): boolean {
  return (
    licenseAccess(
      license?.active === true,
      license?.expires_at?.toMillis() ?? 0,
    ) !== "blocked"
  );
}

export function canEditWarehouse(license: any): boolean {
  return (
    licenseAccess(
      license?.active === true,
      license?.expires_at?.toMillis() ?? 0,
    ) === "active"
  );
}
