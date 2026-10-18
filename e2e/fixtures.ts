import { expect, test as base } from "@playwright/test";

/**
 * Every page used by a test is watched: an uncaught exception or a console
 * error (including Content-Security-Policy violations) fails the test.
 * A test that deliberately opens missing/forbidden pages opts in with
 * `allowNotFoundResponses()` — only the browser's "status of 404" resource
 * messages are then tolerated, never CSP violations or exceptions.
 */
export function allowNotFoundResponses(): void {
  base.info().annotations.push({ type: "allow-404" });
}
/**
 * For a test that deliberately triggers a server error: tolerates only the
 * browser's "status of 500" message and React's production notice for a
 * server-component error (#441) — never CSP violations or page exceptions.
 */
export function allowServerErrorResponses(): void {
  base.info().annotations.push({ type: "allow-500" });
}
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") problems.push(`console.error: ${message.text()}`);
      });
      await use();
      const allow404 = base.info().annotations.some((a) => a.type === "allow-404");
      const allow500 = base.info().annotations.some((a) => a.type === "allow-500");
      const unexpected = problems.filter(
        (p) => !(allow404 && /status of 404/.test(p)) && !(allow500 && /^console\.error: (.*status of 500|Error: Minified React error #441)/.test(p)),
      );
      expect(unexpected, "browser errors during the test").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
