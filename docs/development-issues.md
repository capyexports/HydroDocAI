# 本次开发遇到的问题与解决办法

本文档记录水政通 (HydroDoc AI) 在本轮开发中遇到的主要问题及对应解决方案，便于后续排查与参考。

---

## 1. 前端一直显示「处理中…」，无法进入「已完成」

**现象**：流程跑完后，进度区仍显示「处理中…」，不出现「已完成」和下载按钮。

**原因**：  
- 进度文案依赖的是**图状态** `state?.status`（如 `"completed"`），不是流状态 `streamState.status`（`"done"`）。  
- 收到 SSE `done` 时只把 `streamState.status` 设为 `"done"`，没有同步把 `streamState.state.status` 设为 `"completed"`。  
- 若最后的 `state_update` 因顺序或缓冲未到达，`state` 仍为上一节点状态（如 `"reviewing"`），界面就一直是「处理中…」。

**解决办法**：  
在 `useGenerateStream` 中，收到 `done` 或流结束时，除设置 `streamState.status = "done"` 外，同时把 **`streamState.state.status`** 设为 **`"completed"`**（保留其余字段），使 `status === "completed"` 成立，UI 正确显示「已完成」和下载区。

**涉及文件**：`packages/frontend/hooks/useGenerateStream.ts`

---

## 2. 点击「下载公文」返回 404

**现象**：流程完成并显示「已完成」后，点击下载请求 `GET /api/download/:threadId` 返回 404。

**原因**：  
- 此前为规避 docx 导出阻塞事件循环，默认不执行 docx 导出（需 `ENABLE_DOCX_EXPORT=1` 才导出）。  
- 未导出时 `exportNode` 不往 `exportedDocxBuffers` 写入，下载接口取不到 buffer，故返回 404。

**解决办法**：  
- 在 `exportNode` 中**始终执行** docx 导出（不再依赖 `ENABLE_DOCX_EXPORT`），将生成的 buffer 写入 `exportedDocxBuffers`。  
- 使用 **`Promise.race` + 15 秒超时** 包裹 `exportToDocx`，避免长时间阻塞事件循环；超时或异常时仅打日志，该次会话下载可能 404，但不影响流程结束。

**涉及文件**：`packages/backend/src/graph/workflow.ts`

---

## 3. 进度条只有两种状态，不按节点逐步高亮

**现象**：进度条上各步骤（起草、法律核验、审计等）没有随流程逐步高亮，直接跳到「已完成」。

**原因**：  
- 后端连续发送所有 node 事件，响应被缓冲，前端在一次 `read()` 中收到整批事件并批量 `setState`，只渲染最终状态。  
- 前端未对每个节点更新做同步渲染，中间状态被合并掉。

**解决办法**：  
- **后端**：`sendEvent` 改为返回 `Promise`，在 `res.write(..., callback)` 的 callback 中 resolve；每次发完 `node_start` / `node_end` 后 `await sendEvent(...)` 并 `await new Promise(r => setImmediate(r))`，让事件尽快发出，减少缓冲。  
- **前端**：在解析到 `node_start` / `node_end` 并 `setStreamState` 时使用 **`flushSync(() => setStreamState(...))`**，强制同步提交并重绘，使进度条能按节点逐步高亮。  
- **步骤条**：在 `isStreaming` 且尚未收到任何 node 时，将第一步「1. 起草」显示为「正在进行」，避免长时间空白。

**涉及文件**：`packages/backend/src/index.ts`，`packages/frontend/hooks/useGenerateStream.ts`，`packages/frontend/components/StepIndicator.tsx`

---

## 4. 内容预览完成后仍显示「正在生成…」和骨架屏

**现象**：流程结束、进度显示「已完成」、可下载公文，但「内容预览」区仍显示「正在生成…」和骨架屏，不显示正文。

**原因**（经 Debug 日志确认）：  
1. **后端事件名不符**：LangGraph 实际发出的是 **`on_chain_start` / `on_chain_end`**，不是 `on_node_start` / `on_node_end`。后端只处理了 `on_node_*`，因此从未发送 `node_start` 和 `state_update`，前端收不到任何 state。  
2. **后端只发 delta**：即便后来修正事件名，`event.data.output` 是节点返回的 **delta**（如 `exportNode` 只返回 `{ status: "completed" }`），不是合并后的完整 state。若前端用 `data.state` 直接**替换** `streamState.state`，会丢失之前的 `documentContent`。  
3. **前端依赖 React state 时序**：在 SSE 循环里依赖多次 `setState` 的连续更新不可靠（批处理/闭包），收到 `done` 时 `s.state` 可能仍为空，导致最终展示的 state 没有 `documentContent`。

**解决办法**：  
- **后端**：  
  - 改为监听 **`on_chain_start` / `on_chain_end`**，且仅对图节点名（`draftNode`、`legalVerificationNode`、`auditNode`、`humanReviewNode`、`exportNode`）发送 SSE，忽略 `__start__`、`ChannelWrite`、`Branch`、`LangGraph` 等。  
  - 在循环内维护 **`accumulatedState`**，每次 `on_chain_end` 将 `event.data.output`（delta）合并进去，然后发送 **完整 accumulatedState** 的 `node_end` 和 `state_update`，确保至少有一次 state 包含 `documentContent`。  
- **前端**：  
  - 在 SSE 回调闭包内维护 **`accumulatedState`**，在每次 `node_start` / `node_end` / `state_update` 时用 `data.state` 合并进该变量。  
  - 收到 **`done`**（或流结束）时，用 **`accumulatedState`** 构造 `finalState`（并设 `status: "completed"`）写回 `setStreamState`，不再依赖当时的 `s.state`。  

**涉及文件**：`packages/backend/src/index.ts`，`packages/frontend/hooks/useGenerateStream.ts`

---

## 5. 内容预览与草案区重复展示同一正文

**现象**：「内容预览」与「草案与法律依据」两处都展示同一份生成正文，内容重复。

**解决办法**：  
仅保留「内容预览」作为正文展示区域，移除下方的「草案与法律依据」整块（含左右分栏的 AI 生成稿与法律依据）。  
同时删除未再使用的变量 `legalCitations`、`hasDiffView`。

**涉及文件**：`packages/frontend/app/page.tsx`

---

## 6. Resume 流程与 Generate 的 SSE 行为一致

**现象**：`/api/resume` 仍按 `on_node_start` / `on_node_end` 处理并只发 delta，与人审后恢复流程的预期不一致。

**解决办法**：  
`/api/resume` 与 `/api/generate` 使用同一套逻辑：监听 **`on_chain_start` / `on_chain_end`**，仅处理上述图节点名，并在后端累积 **accumulatedState**，每次发送完整 state 的 `node_end` 和 `state_update`，保证前端 resume 时也能正确拿到 `documentContent` 并更新内容预览。

**涉及文件**：`packages/backend/src/index.ts`

---

## 小结

| 问题 | 根因概要 | 解决方向 |
|------|----------|----------|
| 一直「处理中…」 | 完成态依赖图状态 `state.status`，未在收到 `done` 时设为 `completed` | 收到 `done` 时同时设置 `state.status = "completed"` |
| 下载 404 | 默认不执行 docx 导出，未写入 buffer | 始终执行导出并写入 buffer，用超时防阻塞 |
| 进度不按节点高亮 | SSE 缓冲 + 前端批量更新 | 后端 await 写回调与 setImmediate；前端 flushSync 更新 |
| 内容预览不显示正文 | LangGraph 发 on_chain_* 且只发 delta；前端 state 时序不可靠 | 后端用 on_chain_* + 累积完整 state 下发；前端闭包内累积并在 done 时写回 |
| 内容预览与草案重复 | 两处都展示 documentContent | 只保留内容预览，移除草案与法律依据区块 |
| Resume 与 Generate 不一致 | resume 仍用 on_node_* 且只发 delta | resume 复用 on_chain_* + 累积 state 逻辑 |
