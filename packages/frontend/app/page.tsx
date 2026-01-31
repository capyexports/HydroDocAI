"use client";

import { useState } from "react";
import type { WaterDocumentState } from "@hydrodocai/shared";
import { useGenerateStream } from "../hooks/useGenerateStream";
import { useResumeStream } from "../hooks/useResumeStream";
import { downloadDocx } from "../lib/downloadDocx";
import { HydroHeader } from "../components/HydroHeader";
import { StepIndicator, STEPS } from "../components/StepIndicator";
import { ContentPreviewSkeleton } from "../components/ContentPreviewSkeleton";
import { Download, Check, Edit3 } from "lucide-react";

export default function HomePage() {
  const [rawInput, setRawInput] = useState("");
  const [documentType, setDocumentType] = useState<WaterDocumentState["documentType"]>("限期缴纳通知书");
  const [editContent, setEditContent] = useState("");

  const { streamState, startGenerate, reset: resetGenerate } = useGenerateStream();
  const { resumeState, resume, reset: resetResume } = useResumeStream();

  const state = streamState.state ?? resumeState.state;
  const threadId = streamState.threadId;
  /** Effective currentNode for header/step indicator: use resume's when resume is streaming. */
  const currentNode =
    resumeState.status === "streaming" ? resumeState.currentNode : streamState.currentNode;
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
    <div className="min-h-screen">
      <HydroHeader currentNode={currentNode} isStreaming={isStreaming} />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Draft form */}
        {streamState.status === "idle" && !threadId && (
          <section className="mb-6 rounded-hydro border border-slate-200 bg-white p-6">
            <label className="mb-2 block text-sm font-medium text-slate-600">公文类型</label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as WaterDocumentState["documentType"])}
              className="mb-4 w-full rounded-hydro border border-slate-200 px-3 py-2 text-slate-800"
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
              className="mb-4 w-full rounded-hydro border border-slate-200 px-3 py-2 text-slate-800 placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!rawInput.trim() || isStreaming}
              className="flex items-center gap-2 rounded-hydro bg-water-blue px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
            >
              开始生成
            </button>
          </section>
        )}

        {/* Progress with step indicator */}
        {(isStreaming || streamState.status === "done" || resumeState.status === "done") && (
          <section className="mb-6 rounded-hydro border border-slate-200 bg-white p-6">
            <h2 className="mb-3 text-sm font-medium text-slate-600">当前进度</h2>
            <StepIndicator currentNode={currentNode} isCompleted={isCompleted} isStreaming={isStreaming} />
          </section>
        )}

        {/* Content preview: placeholder (skeleton) or live content when SSE is active */}
        {(isStreaming || streamState.status === "done" || resumeState.status === "done") && (
          <section
            className="mb-6 rounded-hydro border border-slate-200 bg-white p-6"
            role="status"
            aria-live="polite"
            aria-label="内容预览"
          >
            <h2 className="mb-3 text-sm font-medium text-slate-600">内容预览</h2>
            {state?.documentContent ? (
              <pre className="whitespace-pre-wrap rounded-hydro border border-slate-200 bg-hydro-bg p-4 font-document text-base text-slate-800">
                {state.documentContent}
              </pre>
            ) : (
              <>
                <p className="mb-3 text-sm text-slate-500 animate-pulse">
                  正在生成…
                  {currentNode && (
                    <span className="ml-2 text-slate-600">
                      （{STEPS.find((s) => s.key === currentNode)?.label ?? currentNode}）
                    </span>
                  )}
                </p>
                <ContentPreviewSkeleton lines={6} />
              </>
            )}
          </section>
        )}

        {/* Human review: breathing animation on approve when needsHumanReview */}
        {isInterrupted && (
          <section className="mb-6 rounded-hydro border border-slate-200 bg-white p-6">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
              <Edit3 className="h-4 w-4 text-water-blue" aria-hidden />
              待人工确认
            </h2>
            {humanReviewReason && (
              <p className="mb-4 text-sm text-slate-600">{humanReviewReason}</p>
            )}
            <textarea
              value={editContent || (state?.documentContent ?? "")}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="可在此修改草案内容后提交..."
              rows={6}
              className="mb-4 w-full rounded-hydro border border-slate-200 bg-white px-3 py-2 text-slate-800"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleApprove}
                disabled={isStreaming}
                className={`flex items-center gap-2 rounded-hydro px-4 py-2 text-white disabled:opacity-50 ${
                  needsHumanReview
                    ? "animate-breathe bg-hydro-success hover:opacity-90"
                    : "bg-hydro-success hover:opacity-90"
                }`}
              >
                <Check className="h-4 w-4" aria-hidden />
                通过
              </button>
              <button
                type="button"
                onClick={handleSubmitEdit}
                disabled={isStreaming}
                className="flex items-center gap-2 rounded-hydro border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                修改后提交
              </button>
            </div>
          </section>
        )}

        {/* Download: hydro-success */}
        {isCompleted && threadId && (
          <section className="mb-6 rounded-hydro border border-slate-200 bg-white p-6">
            <h2 className="mb-3 text-sm font-medium text-slate-600">导出公文</h2>
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-2 rounded-hydro bg-hydro-success px-4 py-2 text-white hover:opacity-90"
            >
              <Download className="h-4 w-4" aria-hidden />
              下载公文 (.docx)
            </button>
          </section>
        )}

        {/* Error: gov-red */}
        {(streamState.status === "error" || resumeState.status === "error") && (
          <section className="mb-6 rounded-hydro border border-gov-red/30 bg-gov-red/5 p-6 text-gov-red">
            <p className="text-sm">{streamState.errorMessage ?? resumeState.errorMessage}</p>
          </section>
        )}

        {/* Reset / New */}
        {(streamState.status === "done" || isCompleted) && (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-hydro border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
          >
            新建一篇
          </button>
        )}
      </main>
    </div>
  );
}
