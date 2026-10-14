"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PROPOSAL_CATEGORIES, RIGHTS_FEEDBACK_PATH } from "@/lib/rights/contracts";
import type { FeedbackPublicDTO } from "@/lib/rights/queries";
import { createRightsActionFlight, readRights } from "@/lib/rights/client";
import {
  validateBody,
  validateCategory,
  validateFeedbackTitle,
  validateId,
  validateIsAnonymous,
  validateReply,
} from "@/lib/rights/validation";

function parseFeedbackList(data: unknown): FeedbackPublicDTO[] {
  if (!Array.isArray(data)) throw new TypeError("Invalid feedback payload");
  return data.map((row) => {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new TypeError("Invalid feedback row");
    }
    const record = row as Record<string, unknown>;
    const id = record["id"];
    const title = record["title"];
    const content = record["content"];
    const category = record["category"];
    const isAnonymous = record["is_anonymous"];
    const reply = record["reply"];
    const repliedAt = record["replied_at"];
    const createdAt = record["created_at"];
    if (
      typeof id !== "string" ||
      typeof title !== "string" ||
      typeof content !== "string" ||
      typeof category !== "string" ||
      typeof isAnonymous !== "boolean" ||
      typeof reply !== "string" ||
      (repliedAt !== null && typeof repliedAt !== "string") ||
      typeof createdAt !== "string"
    ) {
      throw new TypeError("Invalid feedback row");
    }
    if (isAnonymous) {
      return {
        id,
        title,
        content,
        category,
        is_anonymous: true,
        reply,
        replied_at: repliedAt,
        created_at: createdAt,
      };
    }
    const serverAuthor = record["author_name"];
    if (typeof serverAuthor !== "string") throw new TypeError("Invalid feedback row");
    return {
      id,
      title,
      content,
      category,
      is_anonymous: false,
      author_name: serverAuthor,
      reply,
      replied_at: repliedAt,
      created_at: createdAt,
    };
  });
}

type ListStatus = "loading" | "ready" | "error";

export default function FeedbackPage() {
  const { isAdmin, isLoggedIn } = useAuth();

  const [feedbackList, setFeedbackList] = useState<FeedbackPublicDTO[]>([]);
  const [listStatus, setListStatus] = useState<ListStatus>("loading");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("其他");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const submitFlight = useMemo(() => createRightsActionFlight(), []);
  const replyFlight = useMemo(() => createRightsActionFlight(), []);
  const deleteFlight = useMemo(() => createRightsActionFlight(), []);

  const loadFeedback = useCallback(async () => {
    setListStatus("loading");
    const result = await readRights(RIGHTS_FEEDBACK_PATH, parseFeedbackList);
    if (!result.ok) {
      setListStatus("error");
      return result;
    }
    setFeedbackList(result.data);
    const initialReplies: Record<string, string> = {};
    result.data.forEach((item) => {
      initialReplies[item.id] = item.reply || "";
    });
    setReplyInputs(initialReplies);
    setListStatus("ready");
    return result;
  }, []);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  const clearFeedback = () => {
    setActionError(null);
    setActionNotice(null);
  };

  // 送出建言：作者由伺服器依驗證身分寫入，瀏覽器只送布林匿名旗標。
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const titleResult = validateFeedbackTitle(title);
    const contentResult = validateBody(content);
    const categoryResult = validateCategory(category);
    const anonymousResult = validateIsAnonymous(isAnonymous);
    if (!titleResult.ok || !contentResult.ok || !categoryResult.ok || !anonymousResult.ok) {
      setActionNotice(null);
      setActionError("資料格式不正確，請檢查後再試一次。");
      return;
    }
    setSubmitting(true);
    clearFeedback();
    void submitFlight(
      {
        action: "createFeedback",
        payload: {
          title: titleResult.data,
          content: contentResult.data,
          category: categoryResult.data,
          isAnonymous: anonymousResult.data,
        },
      },
      loadFeedback,
    ).then((result) => {
      setSubmitting(false);
      if (result.ok && result.refresh === "updated") {
        setTitle("");
        setContent("");
        setActionNotice("建言已成功送出！");
      } else if (result.ok) {
        setTitle("");
        setContent("");
        setActionNotice("已儲存，但清單更新失敗");
      } else if (result.code === "OUTCOME_UNKNOWN") {
        setActionError("無法確認是否已儲存，請先更新清單確認，勿重複提交。");
      } else {
        setActionError("提交失敗，請稍後再試一次。");
      }
    });
  };

  // 發布 / 儲存官方回覆：清空既有回覆前先經管理員確認。
  const handleSaveReply = (id: string) => {
    const idResult = validateId(id);
    const replyResult = validateReply(replyInputs[id] ?? "");
    if (!idResult.ok || !replyResult.ok) {
      setActionNotice(null);
      setActionError("資料格式不正確，請檢查後再試一次。");
      return;
    }
    const current = feedbackList.find((item) => item.id === id);
    if (replyResult.data === "" && (current?.reply ?? "") !== "") {
      if (!window.confirm("確定要清除這則官方回覆嗎？清除後將無法復原！")) return;
    }
    setSavingId(id);
    clearFeedback();
    void replyFlight(
      { action: "saveFeedbackReply", payload: { id: idResult.data, reply: replyResult.data } },
      loadFeedback,
    ).then((result) => {
      setSavingId(null);
      if (result.ok && result.refresh === "updated") {
        setActionNotice("官方回覆已成功儲存！");
      } else if (result.ok) {
        setActionNotice("已儲存，但清單更新失敗");
      } else if (result.code === "OUTCOME_UNKNOWN") {
        setActionError("無法確認是否已儲存，請先更新清單確認，勿重複提交。");
      } else {
        setActionError("發布失敗，請稍後再試一次。");
      }
    });
  };

  // 刪除建言：僅管理員可見，實際權限由伺服器強制執行。
  const handleDeleteFeedback = (id: string) => {
    if (!window.confirm("⚠️ 確定要刪除這條建言嗎？刪除後將無法復原！")) return;
    const idResult = validateId(id);
    if (!idResult.ok) {
      setActionNotice(null);
      setActionError("資料格式不正確，請檢查後再試一次。");
      return;
    }
    setDeletingId(id);
    clearFeedback();
    void deleteFlight(
      { action: "deleteFeedback", payload: { id: idResult.data } },
      loadFeedback,
    ).then((result) => {
      setDeletingId(null);
      if (result.ok && result.refresh === "updated") {
        setActionNotice("建言已成功刪除！");
      } else if (result.ok) {
        setActionNotice("已儲存，但清單更新失敗");
      } else if (result.code === "OUTCOME_UNKNOWN") {
        setActionError("無法確認是否已刪除，請先更新清單確認。");
      } else {
        setActionError("刪除失敗，請稍後再試一次。");
      }
    });
  };

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* 標題與管理員標籤 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            💬 回饋與建言
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            歡迎向竹科實中學權組提出您的寶貴意見或學校生活中的問題！
          </p>
        </div>

        {isAdmin && (
          <div className="shrink-0 self-start sm:self-center">
            <span className="px-3 py-1.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full flex items-center gap-1 border border-purple-200">
              🔑 您目前為學權組管理員
            </span>
          </div>
        )}
      </div>

      {actionError && (
        <p role="alert" className="p-3.5 bg-red-50 rounded-2xl text-center text-sm font-semibold text-red-600 shadow-sm border border-red-200">
          {actionError}
        </p>
      )}
      {actionNotice && (
        <p role="status" className="p-3.5 bg-green-50 rounded-2xl text-center text-sm font-semibold text-green-700 shadow-sm border border-green-200">
          {actionNotice}
        </p>
      )}

      {/* 發表建言區塊：已登入顯示表單；未登入顯示灰色圓角提示條 */}
      {isLoggedIn ? (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="feedback-title" className="block text-sm font-semibold text-gray-700 mb-1">
                  建言標題
                </label>
                <input
                  id="feedback-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：關於圖書館開館時間建議..."
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="feedback-category" className="block text-sm font-semibold text-gray-700 mb-1">
                  分類
                </label>
                <select
                  id="feedback-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {PROPOSAL_CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="feedback-content" className="block text-sm font-semibold text-gray-700 mb-1">
                寶貴意見內容
              </label>
              <textarea
                id="feedback-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder="請詳細說明您的想法或建議..."
                className="w-full p-3 border border-gray-300 rounded-xl bg-gray-50 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                required
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span>🕵️ 匿名發布（隱藏姓名）</span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-xl text-sm transition shadow-sm disabled:opacity-50"
              >
                {submitting ? "發送中..." : "送出建言"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="p-3.5 bg-gray-100/90 rounded-2xl text-center text-sm font-semibold text-gray-500 shadow-sm flex items-center justify-center gap-1.5 border border-gray-200/50">
          🔒 請登入後即可發表建言
        </div>
      )}

      {/* 近期建言與官方回應清單 */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-foreground px-1">
          近期建言與官方回應
        </h2>

        {listStatus === "loading" ? (
          <p className="text-gray-500 text-center py-10 bg-white rounded-2xl border border-gray-200">
            建言載入中…
          </p>
        ) : listStatus === "error" ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-gray-200 space-y-3">
            <p className="text-gray-500">
              無法載入建言，請稍後再試。
            </p>
            <button
              type="button"
              onClick={() => void loadFeedback()}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-xl transition shadow-sm"
            >
              重新載入
            </button>
          </div>
        ) : feedbackList.length === 0 ? (
          <p className="text-gray-500 text-center py-10 bg-white rounded-2xl border border-gray-200">
            目前尚無意見回饋。
          </p>
        ) : (
          feedbackList.map((item) => (
            <div
              key={item.id}
              className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-3 relative"
            >
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-100">
                    {item.category || "其他"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {item.created_at
                      ? new Date(item.created_at).toLocaleDateString()
                      : ""}
                  </span>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleDeleteFeedback(item.id)}
                    disabled={deletingId === item.id}
                    className="text-xs px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg border border-red-200 transition disabled:opacity-50 flex items-center gap-1"
                  >
                    🗑️ {deletingId === item.id ? "刪除中..." : "刪除建言"}
                  </button>
                )}
              </div>

              {item.title && (
                <h3 className="text-base font-bold text-gray-900">
                  {item.title}
                </h3>
              )}
              <p className="text-gray-800 whitespace-pre-line text-sm leading-relaxed">
                {item.content}
              </p>
              <div className="text-xs text-gray-400">
                — {item.is_anonymous ? "匿名學生" : (item.author_name ?? "匿名學生")}
              </div>

              {item.reply && (
                <div className="p-4 bg-blue-50/80 border-l-4 border-blue-600 rounded-r-xl space-y-1 mt-2">
                  <div className="font-bold text-blue-900 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1">
                      📢 學權組官方回覆：
                    </span>
                    {item.replied_at && (
                      <span className="text-xs text-blue-600 font-normal">
                        {new Date(item.replied_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="text-blue-950 text-sm whitespace-pre-line">
                    {item.reply}
                  </p>
                </div>
              )}

              {isAdmin && (
                <div className="p-4 bg-purple-50/60 border border-purple-200 rounded-xl space-y-3 mt-3">
                  <div className="text-xs font-bold text-purple-900 flex items-center gap-1">
                    ✏️ 學權組管理員回覆區：
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      value={replyInputs[item.id] || ""}
                      onChange={(e) =>
                        setReplyInputs({
                          ...replyInputs,
                          [item.id]: e.target.value,
                        })
                      }
                      placeholder="請在此輸入官方回應內容..."
                      aria-label={`回覆「${item.title || item.content.slice(0, 10)}」`}
                      className="flex-1 p-2.5 border border-purple-300 rounded-xl bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveReply(item.id)}
                      disabled={savingId === item.id}
                      className="px-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-medium rounded-xl transition disabled:opacity-50 shrink-0 shadow-sm"
                    >
                      {savingId === item.id ? "發布中..." : "💾 發布官方回覆"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  );
}
