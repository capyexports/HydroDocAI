"use client";

import { useState } from "react";
import type { WaterDocumentState } from "@hydrodocai/shared";
import { useGenerateStream } from "../hooks/useGenerateStream";
import { useResumeStream } from "../hooks/useResumeStream";
import { downloadDocx } from "../lib/downloadDocx";
import { FileText, Loader2, Download, Check, Edit3 } from "lucide-react";

const NODE_LABELS: Record<string, string> = {
  draftNode: "起草中",
  legalVerificationNode: "法律核验",
  auditNode: "审计",
  humanReviewNode: "人工审核",
  exportNode: "导出中",
};

export default function HomePage() {
  const [rawInput, setRawInput] = useState("");
  const [documentType, setDocumentType] = useState<WaterDocumentState["documentType"]>("限期缴纳通知书");
  const [editContent, setEditContent] = useState("");

  const { streamState, startGenerate, reset: resetGenerate } = useGenerateStream();
  const { resumeState, resume, reset: resetResume } = useResumeStream();

  const state = streamState.state ?? resumeState.state;
  const threadId = streamState.threadId;
  const needsHumanReview = state?.needsHumanReview === true;
  const humanReviewReason = state?.humanReviewReason;
  const status = state?.status;
  const isCompleted = status === "completed";
  const isStreaming = streamState.status === "streaming" || resumeState.status === "streaming";
  const isInterrupted = Boolean(threadId && needsHumanReview && streamState.status !== "error");

  const handleSubmit = () => {
    if (!rawInput.trim() || isStreaming) return;
    startGenerate({ rawInput: rawInput.trim(), documentType });
  };

  const handleApprove = () => {
    if (!threadId || isStreaming) return;
    resume({ threadId, approved: true });
  };

  const handleSubmitEdit = () => {
    if (!threadId || isStreaming) return;
    resume({ threadId, approved: false, documentContent: (editContent.trim() || state?.documentContent) ?? "" });
  };

  const handleDownload = () => {
    if (threadId) downloadDocx(threadId);
  };

  const handleReset = () => {
    resetGenerate();
    resetResume();
    setRawInput("");
    setEditContent("");
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-semibold text-slate-800">
        <FileText className="h-7 w-7" />
        水政通 (HydroDoc AI)
      </h1>

      {/* Draft form */}
      {streamState.status === "idle" && !threadId && (
        <section className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-slate-600">公文类型</label>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as WaterDocumentState["documentType"])}
            className="mb-4 w-full rounded border border-slate-300 px-3 py-2 text-slate-800"
          >
            <option value="限期缴纳通知书">限期缴纳通知书</option>
            <option value="行政处罚决定书">行政处罚决定书</option>
          </select>
          <label className="mb-2 block text-sm font-medium text-slate-600">原始素材（现场描述 / OCR / 笔录）</label>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="请输入违规描述、时间、地点、主体等..."
            rows={6}
            className="mb-4 w-full rounded border border-slate-300 px-3 py-2 text-slate-800 placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!rawInput.trim() || isStreaming}
            className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            开始生成
          </button>
        </section>
      )}

      {/* Progress */}
      {(isStreaming || streamState.status === "done" || resumeState.status === "done") && (
        <section className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-slate-600">当前进度</h2>
          <p className="flex items-center gap-2 text-slate-800">
            {isStreaming && <Loader2 className="h-4 w-4 animate-spin" />}
            {streamState.currentNode
              ? NODE_LABELS[streamState.currentNode] ?? streamState.currentNode
              : status === "completed"
                ? "已完成"
                : "处理中..."}
          </p>
        </section>
      )}

      {/* Draft preview */}
      {state?.documentContent && (
        <section className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-slate-600">草案预览</h2>
          <pre className="whitespace-pre-wrap rounded bg-slate-50 p-4 text-sm text-slate-800">
            {state.documentContent}
          </pre>
        </section>
      )}

      {/* Human review */}
      {isInterrupted && (
        <section className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-800">
            <Edit3 className="h-4 w-4" />
            待人工确认
          </h2>
          {humanReviewReason && (
            <p className="mb-4 text-sm text-amber-700">{humanReviewReason}</p>
          )}
          <textarea
            value={editContent || (state?.documentContent ?? "")}
            onChange={(e) => setEditContent(e.target.value)}
            placeholder="可在此修改草案内容后提交..."
            rows={6}
            className="mb-4 w-full rounded border border-amber-300 bg-white px-3 py-2 text-slate-800"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleApprove}
              disabled={isStreaming}
              className="flex items-center gap-2 rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {resumeState.status === "streaming" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              通过
            </button>
            <button
              type="button"
              onClick={handleSubmitEdit}
              disabled={isStreaming}
              className="flex items-center gap-2 rounded bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 disabled:opacity-50"
            >
              修改后提交
            </button>
          </div>
        </section>
      )}

      {/* Download */}
      {isCompleted && threadId && (
        <section className="mb-8 rounded-lg border border-green-200 bg-green-50 p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-green-800">导出公文</h2>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-2 rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            <Download className="h-4 w-4" />
            下载公文 (.docx)
          </button>
        </section>
      )}

      {/* Error */}
      {(streamState.status === "error" || resumeState.status === "error") && (
        <section className="mb-8 rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
          <p>{streamState.errorMessage ?? resumeState.errorMessage}</p>
        </section>
      )}

      {/* Reset / New */}
      {(streamState.status === "done" || isCompleted) && (
        <button
          type="button"
          onClick={handleReset}
          className="rounded border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
        >
          新建一篇
        </button>
      )}
    </main>
  );
}
