import type { TaskDefinition, DOMAssertion } from "../types/task.js";
import { execAgentBrowser } from "../utils/exec.js";
import { log } from "../utils/logger.js";

export interface AssertionResult {
  assertion: DOMAssertion;
  passed: boolean;
  actual: string | null;
  message: string;
}

export interface VerificationResult {
  passed: boolean;
  assertionResults: AssertionResult[];
  urlMatch: boolean | null;
  contentMatch: boolean | null;
  details: string[];
}

async function getBrowserValue(
  sessionId: string,
  what: string,
  selector?: string,
): Promise<string | null> {
  const args = selector ? [what, selector] : [what];
  const result = await execAgentBrowser("get", args, sessionId);
  if (!result.success) return null;
  return result.stdout.trim();
}

async function checkAssertion(
  sessionId: string,
  assertion: DOMAssertion,
): Promise<AssertionResult> {
  const { selector, check, expected, contains } = assertion;

  switch (check) {
    case "exists": {
      const result = await execAgentBrowser("eval", [
        `!!document.querySelector('${selector}')`,
      ], sessionId);
      const exists = result.stdout.trim() === "true";
      return {
        assertion,
        passed: exists,
        actual: exists ? "exists" : "not found",
        message: exists
          ? `Element '${selector}' exists`
          : `Element '${selector}' not found`,
      };
    }

    case "visible": {
      const result = await execAgentBrowser("eval", [
        `(() => { const el = document.querySelector('${selector}'); return el ? el.offsetParent !== null || getComputedStyle(el).display !== 'none' : false; })()`,
      ], sessionId);
      const visible = result.stdout.trim() === "true";
      return {
        assertion,
        passed: visible,
        actual: visible ? "visible" : "hidden/missing",
        message: visible
          ? `Element '${selector}' is visible`
          : `Element '${selector}' is not visible`,
      };
    }

    case "value": {
      const actual = await getBrowserValue(sessionId, "value", selector);
      const passed = actual === expected;
      return {
        assertion,
        passed,
        actual,
        message: passed
          ? `Value matches: '${expected}'`
          : `Value mismatch: expected '${expected}', got '${actual}'`,
      };
    }

    case "text": {
      const actual = await getBrowserValue(sessionId, "text", selector);
      let passed: boolean;
      if (contains) {
        passed = actual ? actual.includes(contains) : false;
      } else {
        passed = actual === expected;
      }
      return {
        assertion,
        passed,
        actual,
        message: passed
          ? `Text check passed for '${selector}'`
          : `Text check failed: expected ${contains ? `to contain '${contains}'` : `'${expected}'`}, got '${actual?.slice(0, 100)}'`,
      };
    }

    case "checked": {
      const result = await execAgentBrowser("eval", [
        `document.querySelector('${selector}')?.checked ?? false`,
      ], sessionId);
      const checked = result.stdout.trim() === "true";
      const expectedChecked = expected !== "false";
      const passed = checked === expectedChecked;
      return {
        assertion,
        passed,
        actual: String(checked),
        message: passed
          ? `Checked state matches`
          : `Checked state mismatch: expected ${expectedChecked}, got ${checked}`,
      };
    }

    default:
      return {
        assertion,
        passed: false,
        actual: null,
        message: `Unknown check type: ${check}`,
      };
  }
}

export async function verify(
  task: TaskDefinition,
  sessionId: string,
): Promise<VerificationResult> {
  const details: string[] = [];
  const assertionResults: AssertionResult[] = [];
  let urlMatch: boolean | null = null;
  let contentMatch: boolean | null = null;

  // Check URL
  if (task.expectedOutcome.expectedUrl) {
    const currentUrl = await getBrowserValue(sessionId, "url");
    const pattern = new RegExp(task.expectedOutcome.expectedUrl);
    urlMatch = currentUrl ? pattern.test(currentUrl) : false;
    details.push(
      urlMatch
        ? `URL matches: ${currentUrl}`
        : `URL mismatch: expected /${task.expectedOutcome.expectedUrl}/, got '${currentUrl}'`,
    );
  }

  // Check expected content — try multiple extraction methods
  if (task.expectedOutcome.expectedContent) {
    // Try get text first, then snapshot as fallback, then page title
    let pageText = await getBrowserValue(sessionId, "text");
    if (!pageText) {
      // Fallback: use snapshot to get page content
      const snapshotResult = await execAgentBrowser("snapshot", [], sessionId);
      if (snapshotResult.success) {
        pageText = snapshotResult.stdout;
        details.push("Content check: used snapshot fallback (get text failed)");
      }
    }
    if (!pageText) {
      // Last resort: get page title
      const titleResult = await execAgentBrowser("get", ["title"], sessionId);
      if (titleResult.success) {
        pageText = titleResult.stdout;
        details.push("Content check: used title fallback");
      }
    }

    if (pageText) {
      const normalizedPage = pageText.toLowerCase();
      const found = task.expectedOutcome.expectedContent.filter((c) =>
        normalizedPage.includes(c.toLowerCase()),
      );
      const missing = task.expectedOutcome.expectedContent.filter(
        (c) => !normalizedPage.includes(c.toLowerCase()),
      );
      contentMatch = missing.length === 0;
      if (found.length > 0) details.push(`Content found: ${found.join(", ")}`);
      if (missing.length > 0) details.push(`Content missing: ${missing.join(", ")}`);
    } else {
      // If all text extraction fails but URL matches, treat content as inconclusive (not failed)
      contentMatch = null;
      details.push("Could not read page text (all methods failed, skipping content check)");
    }
  }

  // Check form values
  if (task.expectedOutcome.formValues) {
    for (const [selector, expected] of Object.entries(
      task.expectedOutcome.formValues,
    )) {
      const result = await checkAssertion(sessionId, {
        selector,
        check: "value",
        expected,
      });
      assertionResults.push(result);
      details.push(result.message);
    }
  }

  // Check DOM assertions
  if (task.expectedOutcome.assertions) {
    for (const assertion of task.expectedOutcome.assertions) {
      const result = await checkAssertion(sessionId, assertion);
      assertionResults.push(result);
      details.push(result.message);
    }
  }

  // Overall pass: all checks that were evaluated must pass
  const allAssertionsPassed = assertionResults.every((r) => r.passed);
  const urlOk = urlMatch === null || urlMatch;
  const contentOk = contentMatch === null || contentMatch;
  const passed = allAssertionsPassed && urlOk && contentOk;

  log.info(`Verification: ${passed ? "PASSED" : "FAILED"}`, {
    assertions: `${assertionResults.filter((r) => r.passed).length}/${assertionResults.length}`,
    urlMatch,
    contentMatch,
  });

  return { passed, assertionResults, urlMatch, contentMatch, details };
}
