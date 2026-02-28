"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface FAQCandidate {
  id: string;
  question: string;
  answer: string;
  category: string;
  source_type: string;
  confidence: number;
  status: string;
  slug: string;
  seo_keywords: string[];
  seo_intent: string;
  created_at: string;
}

interface FAQResponse {
  candidates: FAQCandidate[];
  summary: Record<string, number>;
  total: number;
}

const CATEGORIES = [
  "insurance",
  "process",
  "pricing",
  "materials",
  "storm-damage",
  "scheduling",
  "company",
  "maintenance",
];

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-[#d29922]/15", text: "text-[#d29922]" },
  approved: { bg: "bg-[#3fb950]/15", text: "text-[#3fb950]" },
  rejected: { bg: "bg-[#f85149]/15", text: "text-[#f85149]" },
  published: { bg: "bg-[#58a6ff]/15", text: "text-[#58a6ff]" },
};

const SOURCE_LABELS: Record<string, string> = {
  call_transcript: "Call",
  sms: "SMS",
  review: "Review",
  knowledge_base: "KB",
  competitor: "Competitor",
  manual: "Manual",
};

export default function FAQReviewPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const { data, isLoading, error } = useQuery<FAQResponse>({
    queryKey: ["faq-review", statusFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      const res = await fetch(`/api/faq-review?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const mutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/faq-review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faq-review"] });
      setEditingId(null);
    },
  });

  function startEdit(faq: FAQCandidate) {
    setEditingId(faq.id);
    setEditQuestion(faq.question);
    setEditAnswer(faq.answer);
    setEditCategory(faq.category);
  }

  function saveEdit() {
    if (!editingId) return;
    mutation.mutate({
      id: editingId,
      action: "edit",
      question: editQuestion,
      answer: editAnswer,
      category: editCategory,
    });
  }

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3] mb-2">FAQ Review</h1>
        <p className="text-[#8b949e] mb-8">Loading FAQ candidates...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3] mb-2">FAQ Review</h1>
        <p className="text-[#f85149]">Failed to load FAQ data</p>
      </div>
    );
  }

  const totalAll = Object.values(data.summary).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] mb-1">
            FAQ Review
          </h1>
          <p className="text-[#8b949e] text-sm">
            Review AI-extracted FAQ candidates before publishing to the website.
          </p>
        </div>
        <div className="text-right text-xs text-[#8b949e]">
          <p>{totalAll} total candidates</p>
          <p>{data.summary.pending || 0} pending review</p>
        </div>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {(["pending", "approved", "rejected", "published"] as const).map(
          (s) => {
            const style = STATUS_STYLES[s];
            const count = data.summary[s] || 0;
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
                className={`bg-[#161b22] border rounded-lg p-3 text-left transition-colors ${
                  isActive
                    ? "border-[#58a6ff]"
                    : "border-[#30363d] hover:border-[#8b949e]"
                }`}
              >
                <p className="text-xs text-[#8b949e] capitalize mb-1">{s}</p>
                <p className={`text-xl font-bold ${style.text}`}>{count}</p>
              </button>
            );
          }
        )}
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        <button
          onClick={() => setCategoryFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
            categoryFilter === "all"
              ? "bg-[#58a6ff]/15 text-[#58a6ff]"
              : "bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3]"
          }`}
        >
          All Categories
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() =>
              setCategoryFilter(categoryFilter === cat ? "all" : cat)
            }
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              categoryFilter === cat
                ? "bg-[#58a6ff]/15 text-[#58a6ff]"
                : "bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3]"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* FAQ cards */}
      {data.candidates.length === 0 ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-12 text-center">
          <p className="text-[#8b949e]">
            No FAQ candidates match the current filters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.candidates.map((faq) => {
            const style = STATUS_STYLES[faq.status] || STATUS_STYLES.pending;
            const isEditing = editingId === faq.id;

            return (
              <div
                key={faq.id}
                className="bg-[#161b22] border border-[#30363d] rounded-lg p-5"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${style.bg} ${style.text}`}
                    >
                      {faq.status}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#21262d] text-[10px] text-[#8b949e]">
                      {faq.category}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#21262d] text-[10px] text-[#8b949e]">
                      {SOURCE_LABELS[faq.source_type] || faq.source_type}
                    </span>
                    <span className="text-[10px] text-[#8b949e]">
                      {Math.round(faq.confidence * 100)}% confidence
                    </span>
                  </div>
                  <span className="text-[10px] text-[#8b949e] whitespace-nowrap">
                    {new Date(faq.created_at).toLocaleDateString()}
                  </span>
                </div>

                {isEditing ? (
                  /* Edit mode */
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] text-[#8b949e] mb-1">
                        Question
                      </label>
                      <input
                        type="text"
                        value={editQuestion}
                        onChange={(e) => setEditQuestion(e.target.value)}
                        className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#8b949e] mb-1">
                        Answer
                      </label>
                      <textarea
                        value={editAnswer}
                        onChange={(e) => setEditAnswer(e.target.value)}
                        rows={4}
                        className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none resize-y"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#8b949e] mb-1">
                        Category
                      </label>
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={saveEdit}
                        disabled={mutation.isPending}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-[#58a6ff]/15 text-[#58a6ff] hover:bg-[#58a6ff]/25 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <>
                    <h3 className="text-sm font-semibold text-[#e6edf3] mb-2">
                      Q: {faq.question}
                    </h3>
                    <p className="text-xs text-[#8b949e] leading-relaxed mb-3">
                      {faq.answer}
                    </p>

                    {/* Keywords */}
                    {faq.seo_keywords && faq.seo_keywords.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap mb-3">
                        {faq.seo_keywords.map((kw, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-[#21262d] text-[#8b949e]"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      {faq.status === "pending" && (
                        <>
                          <button
                            onClick={() =>
                              mutation.mutate({
                                id: faq.id,
                                action: "approve",
                              })
                            }
                            disabled={mutation.isPending}
                            className="px-3 py-1.5 rounded text-xs font-medium bg-[#3fb950]/15 text-[#3fb950] hover:bg-[#3fb950]/25 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() =>
                              mutation.mutate({
                                id: faq.id,
                                action: "reject",
                              })
                            }
                            disabled={mutation.isPending}
                            className="px-3 py-1.5 rounded text-xs font-medium bg-[#f85149]/15 text-[#f85149] hover:bg-[#f85149]/25 transition-colors"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => startEdit(faq)}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
