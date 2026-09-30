import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./helpers";
import { toCsv } from "../../src/domain/csv";

async function scan(page: Page, code: string) {
  await page
    .getByRole("button", { name: "Scan supplier barcode", exact: true })
    .click();
  await page.getByLabel("Printed barcode number").fill(code);
  await page.getByRole("button", { name: "Use barcode", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}
for (const width of [375, 1280])
  test(`product memory, editable details, labels and reminders at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await signInAs(page, "owner");
    await page.goto("/?demo=1#receive");
    await scan(page, "BIRCH-WHITE");
    await page.locator("#rcv-job").waitFor({state:"attached"}); if (await page.getByRole("button", {name:"Add job (optional)", exact:true}).isVisible()) await page.getByRole("button", {name:"Add job (optional)", exact:true}).click();
await page.locator("#rcv-job").selectOption({ index: 1 });
    await page.getByLabel("Description", { exact: true }).fill("White birch");
    await page
      .getByLabel("Product barcode or code (optional)")
      .fill("BIRCH-WHITE");
    await page
      .getByLabel("Save as a product, so the next scan of this code fills in the name, unit and category")
      .check();
    await page.getByLabel("Quantity (optional)", { exact: true }).fill("48");
    await page.getByLabel("Unit (optional)", { exact: true }).fill("logs");
    await page
      .getByLabel("Destination / going to (optional)")
      .fill("North distribution center");
    await page
      .getByLabel("Remind me if still here on (optional)")
      .fill("2020-01-01");
    await page.getByRole("button", { name: "Add custom detail" }).click();
    await page.getByLabel("Detail 1 name").fill("Grade");
    await page.getByLabel("Detail 1 value").fill("A");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `test-results/pallet-details-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Save pallet", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Pallet saved" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Print label", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "White birch · 48 logs",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.getByRole("button", { name: /Receive another for/ }).click();
    await scan(page, "BIRCH-WHITE");
    await expect(page.locator("#rcv-desc")).toHaveValue("White birch");
    await expect(page.locator("#pallet-quantity")).toHaveValue("");
    await expect(page.locator("#detail-name-0")).toHaveValue("Grade");
    await expect(page.locator("#detail-value-0")).toHaveValue("");
    await expect(page.locator("#pallet-destination")).toHaveValue("");
    await expect(page.locator("#pallet-reminder")).toHaveValue("");
    await page.locator("#rcv-job").waitFor({state:"attached"}); if (await page.getByRole("button", {name:"Add job (optional)", exact:true}).isVisible()) await page.getByRole("button", {name:"Add job (optional)", exact:true}).click();
await page.locator("#rcv-job").selectOption({ index: 1 });
    await page.locator("#pallet-quantity").fill("60");
    await page
      .getByRole("button", { name: "Save pallet", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Pallet saved" }),
    ).toBeVisible();
    await page.goto("/?demo=1#overview");
    const reminders = page.getByRole("region", {
      name: "Still here reminders",
    });
    await expect(reminders).toContainText("White birch · 48 logs");
    await expect(reminders).not.toContainText("60 logs");
    await reminders.getByRole("button").click();
    await expect(page.locator('[data-tour="pallet-details"]')).toContainText(
      "North distribution center",
    );
    await page
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Quantity (optional)", { exact: true })
      .fill("47");
    await page
      .getByRole("dialog")
      .getByLabel("Remind me if still here on (optional)")
      .fill("");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    const savedUrl = page.url();
    await page.reload();
    await expect(page).toHaveURL(savedUrl);
    await expect(page.locator('[data-tour="pallet-details"]')).toContainText(
      "47 logs",
    );
    await page.goto("/?demo=1#overview");
    await expect(
      page.getByRole("region", { name: "Still here reminders" }),
    ).toHaveCount(0);
  });

test("expected shipment import prefills receiving; ambiguous matches require a choice", async ({
  page,
}) => {
  await signInAs(page, "owner");
  await page.goto("/?demo=1#import");
  await page
    .getByRole("group", { name: "What to import" })
    .getByRole("button", { name: "Incoming", exact: true })
    .click();
  await page.getByLabel("CSV text").fill(
    toCsv([
      {
        barcode: "BIRCH-INCOMING",
        job_code: "JOB-1",
        description: "White birch",
        quantity: "48",
        unit: "logs",
        destination: "North DC",
      },
      {
        barcode: "BIRCH-INCOMING",
        job_code: "JOB-1",
        description: "White birch",
        quantity: "60",
        unit: "logs",
        destination: "South DC",
      },
    ]),
  );
  await page.getByRole("button", { name: /Import 2 rows/ }).click();
  await expect(
    page.getByText("added to Incoming", { exact: false }).first(),
  ).toBeVisible();
  await page.goto("/?demo=1#receive");
  await scan(page, "BIRCH-INCOMING");
  await expect(
    page.getByRole("heading", {
      name: "Expected deliveries matching this barcode",
    }),
  ).toBeVisible();
  await expect(page.locator("#rcv-desc")).toHaveValue("");
  await page
    .getByRole("button", {
      name: "White birch · 48 logs · North DC",
      exact: true,
    })
    .click();
  await expect(page.locator("#rcv-desc")).toHaveValue("White birch");
  await expect(page.locator("#pallet-quantity")).toHaveValue("48");
  await page.locator("#rcv-desc").fill("Warehouse birch");
  await page.getByRole("button", { name: "Save pallet", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pallet saved" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Receive another for/ }).click();
  await scan(page, "BIRCH-INCOMING");
  await expect(page.locator("#pallet-quantity")).toHaveValue("60");
  await expect(page.locator("#pallet-destination")).toHaveValue("South DC");
});
