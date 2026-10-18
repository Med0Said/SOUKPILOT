import "server-only";

/**
 * Test-only hooks (end-to-end tests): enabled only with SP_TEST_FAULTS=1 AND a
 * site running on localhost, so a production deployment can never turn them on.
 */
export function testFaultsEnabled(): boolean {
  return process.env.SP_TEST_FAULTS === "1" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(process.env.NEXT_PUBLIC_SITE_URL ?? "");
}
