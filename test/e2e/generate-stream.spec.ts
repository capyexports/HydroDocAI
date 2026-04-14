import { test, expect } from "@playwright/test";

/**
 * Backend streaming tests use a mocked SSE endpoint so they run without a
 * live backend. The mock intercepts POST /api/generate and returns a minimal
 * SSE sequence that exercises the full UI state machine.
 */

const MOCK_SSE = [
  `event: node_start\ndata: ${JSON.stringify({ threadId: "test-thread-1", node: "draftNode", state: {} })}\n\n`,
  `event: node_end\ndata: ${JSON.stringify({ threadId: "test-thread-1", node: "draftNode", state: { documentContent: "草案内容（测试）" } })}\n\n`,
  `event: done\ndata: ${JSON.stringify({ threadId: "test-thread-1", state: { documentContent: "草案内容（测试）", status: "completed" } })}\n\n`,
].join("");

test.describe("生成流程 - SSE streaming (mocked)", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept the generate endpoint with a mock SSE response
    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: MOCK_SSE,
      });
    });

    await page.goto("/");
  });

  test("提交后显示进度区域", async ({ page }) => {
    await page.locator("textarea").first().fill("测试违规描述");
    await page.getByRole("button", { name: "开始生成" }).click();

    // Progress and content sections should appear
    await expect(page.getByText("当前进度")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("内容预览")).toBeVisible({ timeout: 5000 });
  });

  test("SSE 完成后显示文档内容", async ({ page }) => {
    await page.locator("textarea").first().fill("测试违规描述");
    await page.getByRole("button", { name: "开始生成" }).click();

    await expect(page.getByText("草案内容（测试）")).toBeVisible({ timeout: 8000 });
  });

  test("SSE 完成后步骤指示器标记已完成", async ({ page }) => {
    await page.locator("textarea").first().fill("测试违规描述");
    await page.getByRole("button", { name: "开始生成" }).click();

    await expect(page.getByText("已完成")).toBeVisible({ timeout: 8000 });
  });

  test("SSE 完成后显示新建一篇按钮", async ({ page }) => {
    await page.locator("textarea").first().fill("测试违规描述");
    await page.getByRole("button", { name: "开始生成" }).click();

    await expect(page.getByRole("button", { name: "新建一篇" })).toBeVisible({ timeout: 8000 });
  });

  test("点击新建一篇重置表单", async ({ page }) => {
    await page.locator("textarea").first().fill("测试违规描述");
    await page.getByRole("button", { name: "开始生成" }).click();

    await page.getByRole("button", { name: "新建一篇" }).click({ timeout: 8000 });

    // Back to initial form
    await expect(page.getByRole("button", { name: "开始生成" })).toBeVisible();
    await expect(page.locator("textarea").first()).toHaveValue("");
  });
});

test.describe("生成流程 - 人工审核中断 (mocked)", () => {
  test("需人工审核时显示审核区域", async ({ page }) => {
    const humanReviewSSE = [
      `event: node_start\ndata: ${JSON.stringify({ threadId: "review-thread", node: "draftNode", state: {} })}\n\n`,
      `event: node_end\ndata: ${JSON.stringify({ threadId: "review-thread", node: "draftNode", state: { documentContent: "待审核草案", needsHumanReview: true, humanReviewReason: "内容存疑，请确认" } })}\n\n`,
      // No "done" event — workflow is interrupted waiting for human
    ].join("");

    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: humanReviewSSE,
      });
    });

    await page.goto("/");
    await page.locator("textarea").first().fill("测试描述");
    await page.getByRole("button", { name: "开始生成" }).click();

    await expect(page.getByText("待人工确认")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("内容存疑，请确认")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "通过" })).toBeVisible();
    await expect(page.getByRole("button", { name: "修改后提交" })).toBeVisible();
  });

  /**
   * Regression test for bug: insufficient rawInput (e.g. "123") was passing through
   * draftNode without triggering human review, because legalVerificationNode only
   * validated citation accuracy, not input quality. Fixed by adding a sufficiency
   * check at the start of draftNode.
   *
   * This test verifies the SSE shape that the fixed backend now produces:
   * draftNode ends with needsHumanReview=true and no documentContent,
   * then the graph interrupts (no "done" event).
   */
  test("素材不足（如输入'123'）触发人工审核，不直接完成", async ({ page }) => {
    // Mock the SSE shape that the fixed draftNode now emits for insufficient input:
    // needsHumanReview=true, no documentContent, stream ends without "done".
    const insufficientInputSSE = [
      `event: node_start\ndata: ${JSON.stringify({ threadId: "insufficient-thread", node: "draftNode", state: {} })}\n\n`,
      `event: node_end\ndata: ${JSON.stringify({
        threadId: "insufficient-thread",
        node: "draftNode",
        state: {
          documentContent: "",
          needsHumanReview: true,
          humanReviewReason: "原始素材不足，请补充违规主体、时间、地点或违规行为描述后重新提交。",
        },
      })}\n\n`,
      `event: node_start\ndata: ${JSON.stringify({ threadId: "insufficient-thread", node: "humanReviewNode", state: {} })}\n\n`,
      `event: node_end\ndata: ${JSON.stringify({ threadId: "insufficient-thread", node: "humanReviewNode", state: { status: "reviewing" } })}\n\n`,
      // No "done" — graph interrupted at humanReviewNode
    ].join("");

    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: insufficientInputSSE,
      });
    });

    await page.goto("/");
    await page.locator("textarea").first().fill("123");
    await page.getByRole("button", { name: "开始生成" }).click();

    // Must show human review section
    await expect(page.getByText("待人工确认")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("原始素材不足")).toBeVisible({ timeout: 5000 });

    // Must NOT have jumped straight to completion
    await expect(page.getByText("已完成")).toHaveCount(0);
    await expect(page.getByText("导出公文")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "下载公文 (.docx)" })).toHaveCount(0);
  });

  test("素材不足时不显示文档内容，只显示审核原因", async ({ page }) => {
    const insufficientInputSSE = [
      `event: node_start\ndata: ${JSON.stringify({ threadId: "insufficient-thread-2", node: "draftNode", state: {} })}\n\n`,
      `event: node_end\ndata: ${JSON.stringify({
        threadId: "insufficient-thread-2",
        node: "draftNode",
        state: {
          documentContent: "",
          needsHumanReview: true,
          humanReviewReason: "原始素材不足，请补充违规主体、时间、地点或违规行为描述后重新提交。",
        },
      })}\n\n`,
      `event: node_start\ndata: ${JSON.stringify({ threadId: "insufficient-thread-2", node: "humanReviewNode", state: {} })}\n\n`,
      `event: node_end\ndata: ${JSON.stringify({ threadId: "insufficient-thread-2", node: "humanReviewNode", state: { status: "reviewing" } })}\n\n`,
    ].join("");

    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: insufficientInputSSE,
      });
    });

    await page.goto("/");
    await page.locator("textarea").first().fill("123");
    await page.getByRole("button", { name: "开始生成" }).click();

    await expect(page.getByText("待人工确认")).toBeVisible({ timeout: 8000 });
    // The review textarea should be empty (no generated content to show)
    const reviewTextarea = page.locator("textarea").last();
    await expect(reviewTextarea).toHaveValue("");
  });

  test("有效素材正常完成流程，不触发人工审核", async ({ page }) => {
    // Regression guard: valid input must NOT get stuck in human review.
    const validInputSSE = [
      `event: node_start\ndata: ${JSON.stringify({ threadId: "valid-thread", node: "draftNode", state: {} })}\n\n`,
      `event: node_end\ndata: ${JSON.stringify({
        threadId: "valid-thread",
        node: "draftNode",
        state: { documentContent: "正式公文内容", needsHumanReview: false },
      })}\n\n`,
      `event: node_start\ndata: ${JSON.stringify({ threadId: "valid-thread", node: "exportNode", state: {} })}\n\n`,
      `event: node_end\ndata: ${JSON.stringify({ threadId: "valid-thread", node: "exportNode", state: { status: "completed" } })}\n\n`,
      `event: done\ndata: ${JSON.stringify({ threadId: "valid-thread" })}\n\n`,
    ].join("");

    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: validInputSSE,
      });
    });

    await page.goto("/");
    await page.locator("textarea").first().fill("某企业违规取水，时间：2024-01-01，地点：某河段，主体：某水务公司");
    await page.getByRole("button", { name: "开始生成" }).click();

    await expect(page.getByText("已完成")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("待人工确认")).toHaveCount(0);
  });
});

test.describe("生成流程 - 后端错误 (mocked)", () => {
  test("后端返回错误时显示错误信息", async ({ page }) => {
    const errorSSE = `event: error\ndata: ${JSON.stringify({ message: "服务暂时不可用" })}\n\n`;

    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: errorSSE,
      });
    });

    await page.goto("/");
    await page.locator("textarea").first().fill("测试描述");
    await page.getByRole("button", { name: "开始生成" }).click();

    await expect(page.getByText("服务暂时不可用")).toBeVisible({ timeout: 5000 });
  });

  test("网络请求失败时显示连接错误", async ({ page }) => {
    await page.route("**/api/generate", async (route) => {
      await route.abort("failed");
    });

    await page.goto("/");
    await page.locator("textarea").first().fill("测试描述");
    await page.getByRole("button", { name: "开始生成" }).click();

    await expect(page.getByText(/无法连接后端|连接/)).toBeVisible({ timeout: 5000 });
  });
});
