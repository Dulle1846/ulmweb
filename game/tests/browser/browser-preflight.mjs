// Shared Playwright preflight. A real text input is deliberate: Chromium can
// start without fontconfig, but then crashes while rendering native form
// controls. That failure is easy to misdiagnose as a test bug.
export function browserLaunchOptions() {
    const args = ["--no-sandbox", "--disable-dev-shm-usage"];
    // Rootless containers and CI runners often have no GPU. The visual
    // references still need WebGL2, so allow an explicit software path without
    // changing the normal browser suite's launch flags.
    if (process.env.E2E_SOFTWARE_GL === "1") {
        args.push(
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--disable-gpu-sandbox",
            "--disable-dev-shm-usage"
        );
    }
    return {
        headless: process.env.E2E_HEADED !== "1",
        executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
        args
    };
}

export async function checkBrowser() {
    let browser;
    try {
        const { chromium } = await import("playwright");
        browser = await chromium.launch(browserLaunchOptions());
        const page = await browser.newPage();
        await page.setContent('<!doctype html><meta charset="utf-8"><label>E2E font probe <input id="probe" type="text"></label>');
        await page.locator("#probe").fill("font probe");
        if (await page.locator("#probe").inputValue() !== "font probe") {
            throw new Error("The native text input did not retain its value.");
        }
        return { ok: true };
    } catch (error) {
        return { ok: false, error };
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

export function printBrowserHelp(error) {
    console.error("Browser preflight failed.");
    if (error) {
        const message = String(error.message || error).split("\n").slice(0, 4).join(" | ");
        console.error("Launch error: " + message);
    }
    console.error("Install Playwright and Chromium from game/:");
    console.error("  npm install");
    console.error("  npm run test:e2e:setup");
    console.error("On CI or a machine with root, install the system libraries and fonts too:");
    console.error("  npx playwright install --with-deps chromium");
    console.error("On a rootless Linux container, provide Chromium's shared libraries and fontconfig/DejaVu fonts, then set LD_LIBRARY_PATH and FONTCONFIG_FILE. See tests/browser/README.md.");
    console.error("A browser that starts but crashes on <input> usually has no usable fontconfig or fonts, not a broken game.");
}
