import { test, expect, type Page } from "@playwright/test";
import { signInAs, wedgeScan } from "./helpers";
import { encodeCode128 } from "../../src/device/code128";

const sscc = "006141411234567890";
async function barcodePhoto(page: Page) {
  const barcode = encodeCode128(`00${sscc}`);
  const base64 = await page.evaluate(({ widths, modules }) => {
    const canvas = document.createElement("canvas");
    canvas.width = modules * 3 + 60;
    canvas.height = 180;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "black";
    let x = 30;
    widths.forEach((width, index) => {
      if (index % 2 === 0) context.fillRect(x, 10, width * 3, 160);
      x += width * 3;
    });
    return canvas.toDataURL("image/png").split(",")[1];
  }, barcode);
  return {
    name: "supplier-sscc.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  };
}
for (const width of [375, 1280])
  test(`receive and find a supplier barcode at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await signInAs(page, "owner");
    await page.goto("/?demo=1#receive");
    await expect(
      page.getByRole("heading", { name: "Receive a pallet" }),
    ).toBeVisible();
    const photo = await barcodePhoto(page);
    await page
      .getByRole("button", { name: "Scan supplier barcode", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await dialog.getByLabel("Barcode photo").setInputFiles(photo);
    await expect(dialog).toBeHidden();
    await expect(page.locator("#rcv-sup")).toHaveValue(sscc);
    await expect(
      page.getByText("SSCC pallet number captured.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pallet saved" }),
    ).toHaveCount(0);
    await page.locator("#rcv-job").waitFor({state:"attached"}); if (await page.getByRole("button", {name:"Add job (optional)", exact:true}).isVisible()) await page.getByRole("button", {name:"Add job (optional)", exact:true}).click();
await page.locator("#rcv-job").selectOption({ index: 1 });
    await page.locator("#rcv-desc").fill("Supplier scan receiving test");
    await page.screenshot({
      path: `test-results/supplier-receive-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Save pallet", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Pallet saved" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Receive another like this" })
      .click();
    await expect(page.locator("#rcv-desc")).toHaveValue(
      "Supplier scan receiving test",
    );
    await expect(page.locator("#rcv-sup")).toHaveValue("");
    // Clear the copied description before navigation so there is no unsaved draft.
    await page.locator("#rcv-desc").fill("");
    await page.goto("/?demo=1#find");
    await page.getByRole("button", { name: "Dispatched", exact: true }).click();
    await page
      .getByRole("button", { name: "Scan barcode", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Barcode photo")
      .setInputFiles(photo);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.locator("#find-q")).toHaveValue(sscc);
    await expect(
      page.getByRole("button", { name: "Dispatched", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".results .result")).toHaveCount(1);
    await expect(page.locator(".results")).toContainText(
      "Supplier scan receiving test",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `test-results/supplier-find-${width}.png`,
      fullPage: true,
    });
  });

test("hardware scans stay on Receive and Find; invalid labels never overwrite a receipt", async ({
  page,
}) => {
  await signInAs(page, "owner");
  await page.goto("/?demo=1#receive");
  await expect(
    page.getByRole("heading", { name: "Receive a pallet" }),
  ).toBeVisible();
  await wedgeScan(page, `00${sscc}`);
  await expect(page.locator("#rcv-sup")).toHaveValue(sscc);
  await page
    .getByRole("button", { name: "Scan supplier barcode", exact: true })
    .click();
  await page
    .getByLabel("Printed barcode number")
    .fill("(00)006141411234567891");
  await page.getByRole("button", { name: "Use barcode", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "check digit does not match",
  );
  await expect(page.locator("#rcv-sup")).toHaveValue(sscc);
  await page.getByLabel("Printed barcode number").fill("OTHER-PALLET");
  await page.getByRole("button", { name: "Use barcode", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Clear the current supplier reference",
  );
  await page.keyboard.press("Escape");
  await page.locator("#rcv-sup").fill("");
  await page.goto("/?demo=1#find");
  await wedgeScan(page, "ACME-LOT-114");
  await expect(page.locator("#find-q")).toHaveValue("ACME-LOT-114");
  await expect(
    page.getByRole("heading", { name: "Find materials" }),
  ).toBeVisible();
});

test("a receiving QR photo fills the description and remains searchable by its supplier reference", async ({
  page,
}) => {
  const { default: QRCode } = await import("qrcode");
  const description = "24 cartons of LED light fixtures";
  const payload = `WHR1:${JSON.stringify({ supplier_ref: sscc, description })}`;
  const png = await QRCode.toBuffer(payload, { width: 650, margin: 4 });
  await signInAs(page, "owner");
  await page.goto("/?demo=1#receive");
  await page
    .getByRole("button", { name: "Scan supplier barcode", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Barcode photo")
    .setInputFiles({
      name: "receiving-qr.png",
      mimeType: "image/png",
      buffer: png,
    });
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("#rcv-sup")).toHaveValue(sscc);
  await expect(page.locator("#rcv-desc")).toHaveValue(description);
  await expect(page.locator("#rcv-job")).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Pallet saved" })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Scan supplier barcode", exact: true })
    .click();
  await page
    .getByLabel("Printed barcode number")
    .fill(
      `WHR1:${JSON.stringify({ supplier_ref: sscc, description: "Different goods" })}`,
    );
  await page.getByRole("button", { name: "Use barcode", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Clear the current description",
  );
  await expect(page.locator("#rcv-desc")).toHaveValue(description);
  await page.keyboard.press("Escape");
  await page.locator("#rcv-job").waitFor({state:"attached"}); if (await page.getByRole("button", {name:"Add job (optional)", exact:true}).isVisible()) await page.getByRole("button", {name:"Add job (optional)", exact:true}).click();
await page.locator("#rcv-job").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Save pallet", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pallet saved" }),
  ).toBeVisible();
  await page.goto("/?demo=1#find");
  await page.getByRole("button", { name: "Scan barcode", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Barcode photo")
    .setInputFiles({
      name: "receiving-qr.png",
      mimeType: "image/png",
      buffer: png,
    });
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("#find-q")).toHaveValue(sscc);
  await expect(page.locator(".result")).toContainText(description);
});

test('camera fallback reads a linear barcode and stops its stream after capture', async ({page}) => {
  await signInAs(page, 'owner');
  await page.addInitScript(({widths, modules}) => {
    Object.defineProperty(window, 'BarcodeDetector', {value: undefined, configurable: true});
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value: async () => {
      const canvas = document.createElement('canvas'); canvas.width = modules * 3 + 60; canvas.height = 240;
      const context = canvas.getContext('2d')!;
      context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'black'; let x = 30;
      for (let i = 0; i < widths.length; i++) {if (i % 2 === 0) context.fillRect(x, 20, widths[i] * 3, 200); x += widths[i] * 3;}
      const stream = canvas.captureStream(10);
      (window as any).__testCameraTracks = stream.getTracks();
      return stream;
    }});
  }, encodeCode128(`00${sscc}`));
  await page.goto('/?demo=1#receive');
  await page.getByRole('button', {name: 'Scan supplier barcode', exact: true}).click();
  await expect(page.locator('#rcv-sup')).toHaveValue(sscc);
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await page.evaluate(() => (window as any).__testCameraTracks.every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
});
