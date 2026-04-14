import { test, expect } from "@playwright/test";

test.describe("首页 - 静态渲染", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("应显示页面标题和副标题", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "水政通 HydroDoc AI" })).toBeVisible();
    await expect(page.getByText("水政监察公文智能辅助系统")).toBeVisible();
  });

  test("应显示公文类型选择器", async ({ page }) => {
    const select = page.locator("select");
    await expect(select).toBeVisible();
    await expect(select).toHaveValue("限期缴纳通知书");
  });

  test("公文类型下拉选项完整", async ({ page }) => {
    const options = page.locator("select option");
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toHaveText("限期缴纳通知书");
    await expect(options.nth(1)).toHaveText("行政处罚决定书");
  });

  test("应显示原始素材文本框和占位符", async ({ page }) => {
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveAttribute("placeholder", "请输入违规描述、时间、地点、主体等...");
  });

  test("开始生成按钮默认禁用", async ({ page }) => {
    await expect(page.getByRole("button", { name: "开始生成" })).toBeDisabled();
  });

  test("输入内容后开始生成按钮启用", async ({ page }) => {
    await page.locator("textarea").first().fill("某企业违规取水，时间：2024-01-01，地点：某河段");
    await expect(page.getByRole("button", { name: "开始生成" })).toBeEnabled();
  });

  test("切换公文类型为行政处罚决定书", async ({ page }) => {
    await page.locator("select").selectOption("行政处罚决定书");
    await expect(page.locator("select")).toHaveValue("行政处罚决定书");
  });
});

test.describe("首页 - 表单验证", () => {
  test("空白输入不触发提交", async ({ page }) => {
    await page.goto("/");
    // Button is disabled so click should not fire
    const button = page.getByRole("button", { name: "开始生成" });
    await expect(button).toBeDisabled();
    // No progress/content sections should appear
    await expect(page.getByText("当前进度")).toHaveCount(0);
    await expect(page.getByText("内容预览")).toHaveCount(0);
  });

  test("仅空白字符时按钮保持禁用", async ({ page }) => {
    await page.goto("/");
    await page.locator("textarea").first().fill("   ");
    await expect(page.getByRole("button", { name: "开始生成" })).toBeDisabled();
  });
});
