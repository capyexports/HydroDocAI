# Bug 报告：SSE 流式进度未实时渲染

**测试日期：** 2026-04-13  
**严重级别：** 高（核心交互体验问题）  
**影响模块：** 步骤指示器 / Header 状态 / 内容预览实时渲染  
**发现人：** Xiaotian（用户反馈 + 自动化验证）

---

## 一、问题描述

用户反馈：
1. SSE 流没有被实时显示，内容区是**一次性渲染最终结果**
2. 步骤指示器**没有按进度逐步更新**，直接跳到"已完成"

本报告通过注入 fetch 拦截器 + DOM MutationObserver，对一次完整生成流程进行了精确计时验证，**用户反馈属实**。

---

## 二、实测时序数据

**测试输入：** `2026年3月15日，张某某在广东省某市XX河段擅自挖取砂石，未取得水行政许可，造成堤防损毁。`  
**总耗时：** 约 61 秒（draftNode 执行 LLM 调用耗时 ~54 秒）

### SSE 事件时序（后端实际发送）

| 时间戳(ms) | SSE Event | 节点 | 说明 |
|-----------|-----------|------|------|
| +6,307 | `node_start` | draftNode | 起草节点开始 |
| +60,812 | `node_end` | draftNode | **起草完成（54秒后）** |
| +60,819 | `state_update` | — | 含完整 documentContent |
| +60,861 | `node_start` | legalVerificationNode | 法律核验开始 |
| +60,861 | `node_end` | legalVerificationNode | 法律核验完成（<1ms） |
| +60,861 | `node_start` | auditNode | 审计开始 |
| +60,861 | `node_end` | auditNode | 审计完成（<1ms） |
| +60,861 | `node_start` | exportNode | 导出开始 |
| +60,900 | `node_end` | exportNode | 导出完成 |
| +60,900 | `done` | — | 流结束 |

### DOM 步骤条实际变化时序

| 时间戳(ms) | 步骤条状态 | Header 状态 |
|-----------|-----------|------------|
| 0 | `开始生成`（按钮） | 就绪 |
| +5,981 | `1. 起草(正在进行) 2. 法律核验 3. 审计 4. 人工审核 5. 导出` | 处理中... |
| +60,861 | `✓起草 ✓法律核验 ✓审计 ✓人工审核 5. 导出(正在进行)` | 导出中 |
| +60,900 | `✓起草 ✓法律核验 ✓审计 ✓人工审核 ✓导出 已完成` | 就绪 |

---

## 三、根本原因分析

### 原因 1：draftNode 占用了全部等待时间（~54秒）

后端 `draftNode` 内部串行执行：
1. `extractEntities()`：LLM 调用
2. `ragService.searchLaw()`：关键词检索
3. `generateDraft()`：LLM 调用生成全文

这三步全部完成后，`draftNode` 才返回，LangGraph 才发出 `node_end` 事件。  
**SSE 在 draftNode 执行期间完全无输出**，前端只能显示骨架屏等待。

### 原因 2：legalVerificationNode / auditNode / exportNode 在同一毫秒内批量到达

```
+60,861ms  node_start legalVerificationNode
+60,861ms  node_end   legalVerificationNode   ← 同一毫秒
+60,861ms  node_start auditNode
+60,861ms  node_end   auditNode               ← 同一毫秒
+60,861ms  node_start exportNode
```

这 3 个节点（法律核验、审计、导出）耗时 <1ms，其 SSE 事件在同一个 TCP flush 中到达前端，**React 批量合并了这些状态更新**，步骤条从 "1.起草进行中" 直接跳到 "✓1✓2✓3✓4 5.导出进行中"，中间状态（步骤2、3高亮）用户完全看不到。

### 原因 3：前端使用 `flushSync` 但对批量到达的事件无效

`useGenerateStream.ts` 使用了 `flushSync` 逐条更新：
```typescript
// packages/frontend/hooks/useGenerateStream.ts:99
flushSync(() => setStreamState(...))
```
但当多个 SSE 事件在同一个 `reader.read()` 调用中一次性读入时，`flushSync` 在同一同步块内被多次调用，React 仍会合并后续渲染，中间状态无法被用户感知。

---

## 四、用户体验影响

| 设计预期 | 实际表现 |
|---------|---------|
| 5 个步骤依次高亮，用户看到 AI 逐步处理 | 骨架屏等待 ~60秒后，步骤条一次性全部打勾 |
| 起草完成后立即显示预览内容，后续步骤继续推进 | 内容与"已完成"状态同时出现，无中间过渡 |
| Header 显示当前节点名（法律核验中、审计中...） | Header 只显示过"起草中"和"导出中"，其他节点状态从未呈现 |

---

## 五、修复建议

### 方案 A（推荐）：draftNode 拆分 + 流式输出
将 `draftNode` 拆为独立的实体提取节点和起草节点，并对 LLM 调用启用流式输出（streaming），在 token 级别逐步发送内容更新，让用户看到文字逐渐生成的过程。

```typescript
// 后端：LLM 调用改为 stream 模式
const stream = await llmClient.chat.completions.create({ stream: true, ... });
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content ?? '';
  // 通过 SSE 逐 chunk 发送
  sendEvent('content_delta', { delta });
}
```

### 方案 B（快速修复）：后端为快速节点添加人工延迟
在 `legalVerificationNode`、`auditNode` 完成后插入短暂 delay（200-500ms），让 SSE 事件分批到达，给前端渲染时间：

```typescript
// workflow.ts
async function legalVerificationNode(state) {
  // ... 现有逻辑 ...
  await new Promise(r => setTimeout(r, 300)); // 让 SSE flush 分帧
  return { status: 'reviewing', ... };
}
```

### 方案 C：前端为每个 node_end 事件添加最小展示时长
在 `useGenerateStream.ts` 中，每次收到 `node_end` 时，强制保持当前节点高亮至少 500ms 再处理下一个事件：

```typescript
// 在 node_end 处理逻辑中
if (eventType === 'node_end') {
  await new Promise(r => setTimeout(r, 500));
  flushSync(() => setStreamState(...));
}
```

---

## 六、结论

用户反馈完全属实。问题根源是 **draftNode 的 LLM 调用时间过长（~54秒）导致长时间无 SSE 输出**，以及**后续 3 个节点在 <1ms 内批量完成**，前端无法区分各节点状态，造成步骤条"一次性跳完"的视觉效果。这与 PRD §3 中"SSE Client 实时渲染 AI 的思考过程节点"的设计目标不符，建议优先采用方案 A 修复。
