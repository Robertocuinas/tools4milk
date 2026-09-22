const { chromium } = require("playwright");
const fs = require("node:fs");

const appUrl = "http://localhost:3001";

const routes = [
  "/dashboard",
  "/report",
  "/leanfarming",
  "/incidents",
  "/shifts",
  "/quality",
  "/predictions",
  "/zones",
  "/handover",
  "/orders",
  "/animals",
  "/profile",
  "/management",
  "/settings",
  "/integration",
  "/audit-log",
];

async function inspect(page, route, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`${appUrl}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);

  return page.evaluate(
    ({ route, width, height }) => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > 0 &&
          rect.bottom > 0 &&
          rect.left < innerWidth &&
          rect.top < innerHeight &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      };

      const label = (element) =>
        (element.innerText ||
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.getAttribute("value") ||
          element.getAttribute("alt") ||
          "")
          .trim()
          .slice(0, 60);

      const controls = [
        ...document.querySelectorAll("button, a, input, select, textarea, [role='button']"),
      ].filter(visible);

      const unnamed = controls
        .filter((element) => !label(element))
        .map((element) => element.outerHTML.slice(0, 180))
        .slice(0, 8);

      const tiny = controls
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            name: label(element),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        })
        .slice(0, 15);

      const dead = [
        ...document.querySelectorAll("a[href='#'], a:not([href]), button:not([type])"),
      ]
        .filter(visible)
        .map((element) => ({
          tag: element.tagName,
          name: label(element),
          html: element.outerHTML.slice(0, 180),
        }));

      const rects = controls.map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
        name: label(element),
      }));
      const overlaps = [];
      for (let first = 0; first < rects.length; first += 1) {
        for (let second = first + 1; second < rects.length; second += 1) {
          const a = rects[first];
          const b = rects[second];
          if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
          const x = Math.max(0, Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left));
          const y = Math.max(0, Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top));
          if (x * y > 64) overlaps.push([a.name, b.name, Math.round(x * y)]);
          if (overlaps.length >= 8) break;
        }
      }

      const smallText = [...document.querySelectorAll("body *")]
        .filter(visible)
        .filter((element) => {
          const style = getComputedStyle(element);
          return (
            parseFloat(style.fontSize) < 11 &&
            element.childElementCount === 0 &&
            (element.textContent || "").trim()
          );
        })
        .map((element) => ({
          text: (element.textContent || "").trim().slice(0, 60),
          size: getComputedStyle(element).fontSize,
        }))
        .slice(0, 15);

      const parseRgb = (value) => {
        const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        return match
          ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])]
          : null;
      };
      const luminance = ([red, green, blue]) => {
        const channels = [red, green, blue].map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.03928
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const contrast = (first, second) => {
        const light = Math.max(luminance(first), luminance(second));
        const dark = Math.min(luminance(first), luminance(second));
        return (light + 0.05) / (dark + 0.05);
      };
      const backgroundOf = (element) => {
        let current = element;
        while (current) {
          const color = parseRgb(getComputedStyle(current).backgroundColor);
          if (color && color[3] > 0.98) return color;
          current = current.parentElement;
        }
        return [255, 255, 255, 1];
      };
      const lowContrast = [...document.querySelectorAll("body *")]
        .filter(visible)
        .filter((element) => element.childElementCount === 0 && (element.textContent || "").trim())
        .map((element) => {
          const style = getComputedStyle(element);
          const foreground = parseRgb(style.color);
          const background = backgroundOf(element);
          if (!foreground) return null;
          const ratio = contrast(foreground, background);
          const size = parseFloat(style.fontSize);
          const weight = Number(style.fontWeight) || 400;
          const threshold = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
          return ratio < threshold
            ? {
                text: (element.textContent || "").trim().slice(0, 60),
                ratio: Number(ratio.toFixed(2)),
                color: style.color,
                background: getComputedStyle(element).backgroundColor,
                size: style.fontSize,
              }
            : null;
        })
        .filter(Boolean)
        .filter((item, index, items) =>
          index === items.findIndex((candidate) => candidate.text === item.text && candidate.ratio === item.ratio),
        )
        .slice(0, 15);

      const sidebar = document.querySelector("aside");
      const sidebarRect = sidebar?.getBoundingClientRect();

      return {
        route,
        viewport: `${width}x${height}`,
        documentOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth,
        documentSize: {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight,
        },
        controlCount: controls.length,
        unnamed,
        tiny,
        dead,
        overlaps,
        smallText,
        lowContrast,
        sidebar: sidebarRect
          ? {
              left: Math.round(sidebarRect.left),
              right: Math.round(sidebarRect.right),
              width: Math.round(sidebarRect.width),
              transform: getComputedStyle(sidebar).transform,
            }
          : null,
      };
    },
    { route, width, height },
  );
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--disable-web-security"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const missingResources = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push({ type: "console", url: page.url(), text: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    errors.push({ type: "pageerror", url: page.url(), text: error.message });
  });
  page.on("response", (response) => {
    if (response.status() === 404) missingResources.push(response.url());
  });

  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /roberto\.castro/i }).click();
  await page.getByRole("button", { name: /entrar|iniciar/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 15_000 });
  await page.waitForTimeout(1_000);

  const results = [];
  for (const route of routes) {
    results.push(await inspect(page, route, 1440, 900));
    results.push(await inspect(page, route, 375, 812));
  }

  const interactionChecks = [];
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${appUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const sidebarBefore = await page.locator("aside").boundingBox();
  await page.getByRole("button", { name: /abrir navegaci/i }).click();
  await page.waitForTimeout(250);
  const sidebarOpen = await page.locator("aside").boundingBox();
  await page.getByRole("button", { name: /cerrar navegaci/i }).last().click();
  await page.waitForTimeout(250);
  const sidebarClosed = await page.locator("aside").boundingBox();
  interactionChecks.push({
    name: "mobile navigation",
    passed: sidebarBefore.x < 0 && sidebarOpen.x === 0 && sidebarClosed.x < 0,
    details: { before: sidebarBefore.x, open: sidebarOpen.x, closed: sidebarClosed.x },
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  for (const check of [
    { route: "/incidents", button: /^Nueva$/ },
    { route: "/orders", button: /Nuevo pedido/i },
    { route: "/shifts", button: /Nuevo turno/i },
  ]) {
    await page.goto(`${appUrl}${check.route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    const trigger = page.getByRole("button", { name: check.button }).first();
    const exists = (await trigger.count()) > 0;
    const fieldsBefore = await page.locator("input, textarea, select").count();
    if (exists) await trigger.click();
    await page.waitForTimeout(200);
    const fieldsAfter = await page.locator("input, textarea, select").count();
    interactionChecks.push({
      name: `${check.route} creation control`,
      passed: exists && fieldsAfter > fieldsBefore,
      details: { triggerFound: exists, fieldsBefore, fieldsAfter },
    });
  }

  await page.goto(`${appUrl}/shifts`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  const weekBefore = await page.locator("main").getByText(/\d{1,2}.*\d{1,2}/).first().textContent();
  const previousWeekButton = page.locator("button:has(.lucide-chevron-left)").first();
  await previousWeekButton.click();
  await page.waitForTimeout(150);
  const weekAfter = await page.locator("main").getByText(/\d{1,2}.*\d{1,2}/).first().textContent();
  interactionChecks.push({
    name: "shift week navigation",
    passed: Boolean(weekBefore && weekAfter && weekBefore !== weekAfter),
    details: { weekBefore, weekAfter, accessibleName: await previousWeekButton.getAttribute("aria-label") },
  });

  const loginPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await loginPage.goto(appUrl, { waitUntil: "domcontentloaded" });
  await loginPage.waitForTimeout(500);
  const forgotPassword = loginPage.getByRole("link", { name: /olvidaste/i });
  interactionChecks.push({
    name: "password recovery",
    passed: (await forgotPassword.getAttribute("href")) !== "#",
    details: { href: await forgotPassword.getAttribute("href") },
  });
  await loginPage.close();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${appUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: "../docs/ux-audit/assets/current-dashboard-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${appUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: "../docs/ux-audit/assets/current-dashboard-mobile.png", fullPage: true });

  const output = { results, interactionChecks, errors, missingResources: [...new Set(missingResources)] };
  fs.writeFileSync("../docs/ux-audit/audit-data.json", JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    pages: results.length,
    overflow: results.filter((result) => result.documentOverflow).map((result) => `${result.route} ${result.viewport}`),
    unnamed: results.filter((result) => result.unnamed.length).map((result) => ({ route: result.route, viewport: result.viewport, count: result.unnamed.length })),
    overlaps: results.filter((result) => result.overlaps.length).map((result) => ({ route: result.route, viewport: result.viewport, count: result.overlaps.length })),
    lowContrast: results.filter((result) => result.lowContrast.length).map((result) => ({ route: result.route, viewport: result.viewport, count: result.lowContrast.length })),
    errors,
    missingResources: output.missingResources,
    interactionChecks,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
