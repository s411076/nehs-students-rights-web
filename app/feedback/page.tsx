"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function FeedbackPage() {
  const [feedbackList, setFeedbackList] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("一般建議");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);

  // Auth & Admin State
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Reply & Delete State
  const [replyInputs, setReplyInputs] = useState<{ [key: string]: string }>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 取得建言資料
  const fetchFeedback = async () => {
    const { data, error } = await supabase
      .from("feedback")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) {
      setFeedbackList(data);
      const initialReplies: { [key: string]: string } = {};
      data.forEach((item) => {
        initialReplies[item.id] = item.reply || "";
      });
      setReplyInputs(initialReplies);
    }
  };

  // 🔍 全面同步首頁登入狀態 (同時檢查 Supabase Auth 與 localStorage)
  const syncAuthState = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    let currentUser = session?.user || null;

    // 檢查全站 localStorage 登入紀錄
    let localUserData: any = null;
    try {
      const keys = ["currentUser", "user", "student_user", "admin_user", "sb_user"];
      for (const key of keys) {
        const item = localStorage.getItem(key);
        if (item) {
          try {
            localUserData = JSON.parse(item);
            break;
          } catch {
            localUserData = { name: item, email: item };
          }
        }
      }
    } catch (e) {
      console.error(e);
    }

    const activeUser = currentUser || localUserData;
    setUser(activeUser);

    // 判斷管理員身份：比對 Email、姓名或角色標籤
    const userString = JSON.stringify(activeUser || {}).toLowerCase() + " " + JSON.stringify(localUserData || {}).toLowerCase();
    const isManager =
      userString.includes("林維恩") ||
      userString.includes("h20205") ||
      userString.includes("s4111076") ||
      userString.includes("s411158") ||
      userString.includes("admin") ||
      userString.includes("學權組");

    setIsAdmin(!!isManager);
  };

  useEffect(() => {
    fetchFeedback();
    syncAuthState();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      syncAuthState();
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // 提交建言（修復 title violates not-null constraint 錯誤）
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);

    // 確保 title 一定有值，解決資料庫 Not-Null 限制
    const finalTitle = title.trim() || (content.length > 15 ? content.slice(0, 15) + "..." : content) || "無標題建言";

    const authorName = isAnonymous
      ? "匿名學生"
      : user?.user_metadata?.full_name || user?.name || user?.email || "學生";

    const { error } = await supabase.from("feedback").insert([
      {
        title: finalTitle, // 傳送標題，修復報錯
        content: content.trim(),
        category,
        is_anonymous: isAnonymous,
        author_name: authorName,
      },
    ]);

    setLoading(false);
    if (error) {
      alert("提交失敗：" + error.message);
    } else {
      setTitle("");
      setContent("");
      alert("建言已成功送出！");
      fetchFeedback();
    }
  };

  // 管理員儲存/更新官方回覆
  const handleSaveReply = async (id: string) => {
    if (!isAdmin) {
      alert("權限不足：只有學權組管理員可以發布回覆！");
      return;
    }

    setSavingId(id);
    const replyText = replyInputs[id] || "";

    const { error } = await supabase
      .from("feedback")
      .update({
        reply: replyText,
        replied_at: new Date().toISOString(),
      })
      .eq("id", id);

    setSavingId(null);
    if (error) {
      alert("發布失敗：" + error.message);
    } else {
      alert("官方回覆已成功儲存！");
      fetchFeedback();
    }
  };

  // 管理員刪除建言
  const handleDeleteFeedback = async (id: string) => {
    if (!isAdmin) {
      alert("權限不足：只有學權組管理員可以刪除建言！");
      return;
    }

    const confirmDelete = window.confirm("⚠️ 確定要刪除這條建言嗎？刪除後將無法復原！");
    if (!confirmDelete) return;

    setDeletingId(id);
    const { error } = await supabase.from("feedback").delete().eq("id", id);
    setDeletingId(null);

    if (error) {
      alert("刪除失敗：" + error.message);
    } else {
      alert("建言已成功刪除！");
      fetchFeedback();
    }
  };

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* 頁面頂部標題列 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            💬 回饋與建言
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            歡迎向竹科實中學權組提出您的寶貴意見或學校生活中的問題！
          </p>
        </div>

        {/* 管理員權限標籤 (首頁登入後自動同步顯示) */}
        {isAdmin && (
          <div className="shrink-0 self-start sm:self-center">
            <span className="px-3 py-1.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full flex items-center gap-1 border border-purple-200">
              🔑 您目前為學權組管理員
            </span>
          </div>
        )}
      </div>

      {/* 發表建言表單區塊 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                建言標題
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：關於圖書館開館時間建議..."
                className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                分類
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="一般建議">一般建議</option>
                <option value="校園設施">校園設施</option>
                <option value="環境與設備">環境與設備</option>
                <option value="學聯與活動">學聯與活動</option>
                <option value="課程與教學">課程與教學</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              寶貴意見內容
            </label>
            <textarea
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
              disabled={loading}
              className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-xl text-sm transition shadow-sm disabled:opacity-50"
            >
              {loading ? "發送中..." : "送出建言"}
            </button>
          </div>
        </form>
      </div>

      {/* 近期建言與官方回應清單 */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-800 px-1">
          近期建言與官方回應
        </h2>

        {feedbackList.length === 0 ? (
          <p className="text-gray-500 text-center py-10 bg-white rounded-2xl border border-gray-200">
            目前尚無意見回饋。
          </p>
        ) : (
          feedbackList.map((item) => (
            <div
              key={item.id}
              className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-3 relative"
            >
              {/* 頂部標籤與刪除按鈕 */}
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-100">
                    {item.category || "一般建議"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {item.created_at
                      ? new Date(item.created_at).toLocaleDateString()
                      : ""}
                  </span>
                </div>

                {/* 🗑️ 管理員專用刪除按鈕 */}
                {isAdmin && (
                  <button
                    onClick={() => handleDeleteFeedback(item.id)}
                    disabled={deletingId === item.id}
                    className="text-xs px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg border border-red-200 transition disabled:opacity-50 flex items-center gap-1"
                  >
                    🗑️ {deletingId === item.id ? "刪除中..." : "刪除建言"}
                  </button>
                )}
              </div>

              {/* 標題與內文 */}
              {item.title && (
                <h3 className="text-base font-bold text-gray-900">
                  {item.title}
                </h3>
              )}
              <p className="text-gray-800 whitespace-pre-line text-sm leading-relaxed">
                {item.content}
              </p>
              <div className="text-xs text-gray-400">
                — {item.is_anonymous ? "匿名學生" : item.author_name || "學生"}
              </div>

              {/* 📢 官方回覆展示區 */}
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

              {/* ✏️ 管理員專用：發布 / 編輯官方回覆 */}
              {isAdmin && (
                <div className="p-4 bg-purple-50/50 border border-purple-200 rounded-xl space-y-3 mt-3">
                  <div className="text-xs font-bold text-purple-900 flex items-center gap-1">
                    ✏️ 管理員區：發布 / 修改官方回覆
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
                      placeholder="請輸入學權組官方回應..."
                      className="flex-1 p-2.5 border border-purple-300 rounded-xl bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      onClick={() => handleSaveReply(item.id)}
                      disabled={savingId === item.id}
                      className="px-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-medium rounded-xl transition disabled:opacity-50 shrink-0 shadow-sm"
                    >
                      {savingId === item.id ? "儲存中..." : "💾 發布官方回覆"}
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
