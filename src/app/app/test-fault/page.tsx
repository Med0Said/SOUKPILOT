import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { testFaultsEnabled } from "@/lib/server/test-hooks";

/**
 * Exercises the app's error screen and its retry button in end-to-end tests.
 * A plain 404 unless test hooks are enabled (see testFaultsEnabled).
 */
export default async function TestFaultPage() {
  if (!testFaultsEnabled()) notFound();
  if ((await cookies()).get("sp_test_fault")?.value === "1") throw new Error("test fault");
  return <h1 className="text-xl font-semibold">Test fault cleared</h1>;
}
