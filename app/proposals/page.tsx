"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const ADMIN_EMAILS = ["s411076@nehs.hc.edu.tw", "s411158@nehs.hc.edu.tw"];

const checkIsAdmin = (email?: string) => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
};

export default function ProposalsPage() {
  const [publicProposals, setPublicProposals] = useState<any[]>([]);
  const [pendingProposals, setPendingProposals] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("其他");
  const [loading, setLoading] = useState(false);

  // Auth & Admin State
  const [user, setUser] = useState<any>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // 抓取提案 (區分公開提案與管理員待審核提案)
  const fetchProposals = async (adminFlag: boolean) => {
    // 1. 公開提案 (排除待審核與被退回)
    const { data: publicData } = await supabase
      .from("proposals")
      .select("*")
      .neq("status", "待審核")
      .neq("status", "被退回")
      .order("created_at", { ascending: false });

    if (publicData) setPublicProposals(publicData);

    // 2. 若為管理員，另外抓取「待審核」提案
    if (adminFlag) {
      const { data: pendingData } = await supabase
        .from("proposals")
        .select("*")
        .eq("status", "待審核")
        .order("created_at", { ascending: false });

      if (pendingData) setPendingProposals(pendingData);
    }
  };

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const adminFlag = checkIsAdmin(session.user.email);
        setIsLoggedIn(true);
        setUser(session.user);
        setIsAdmin(adminFlag);
        fetchProposals(adminFlag);
        return;
      }

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const adminFlag = checkIsAdmin(authUser.email);
        setIsLoggedIn(true);
        setUser(authUser);
        setIsAdmin(adminFlag);
        fetchProposals(adminFlag);
        return;
      }

      setIsLoggedIn(false);
      setIsAdmin(false);
      setUser(null);
      fetchProposals(false);
    } catch (e) {
      console.error(e);
      fetchProposals(false);
    }
  };

  useEffect(() => {
    checkAuth();
    const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.user) {
        const adminFlag = checkIsAdmin(session.user.email);
        setIsLoggedIn(true);
        setUser(session.user);
        setIsAdmin(adminFlag);
        fetchProposals(adminFlag);
      } else {
        checkAuth();
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // 學生發起提案（預設為待審核）
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setLoading(true);

    const authorName =
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email?.split("@")[0] ||
      user?.email ||
      "學生";

    const { error } = await supabase.from("proposals").insert([
      {
        title: title.trim(),
        content: content.trim(),
        category,
        author_name: authorName,
        author_email: user?.email || "",
        status: "待審核",
      },
    ]);

    setLoading(false);
    if (error) {
      alert("提交失敗：" + error.message);
    } else {
      setTitle("");
      setContent("");
      alert("學權組已收到你的提案！我們正在慎重審核中，您可在「個人資料」查看審核狀態！");
      fetchProposals(isAdmin);
    }
  };

  // 🔑 管理員核可發布提案
  const handleApprove = async (id: string) => {
    const { error } = await supabase
      .from("proposals")
      .update({ status: "研議中" })
      .eq("id", id);

    if (error) {
      alert("發布失敗：" + error.message);
    } else {
      alert("提案已成功核可並公開至提案區！");
      fetchProposals(true);
    }
  };

  // 🔑 管理員退回提案
  const handleReject = async (id: string) => {
    const confirmReject = window.confirm("確定要退回這項提案嗎？退回後將不會公開，但提案學生可在個人資料查看退回狀態。");
    if (!confirmReject) return;

    const { error } = await supabase
      .from("proposals")
      .update({ status: "被退回" })
      .eq("id", id);

    if (error) {
      alert("退回失敗：" + error.message);
    } else {
      alert("已退回該提案。");
      fetchProposals(true);
    }
  };

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* 標題 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            💡 學生提案區
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            發起關於校園生活與權益的提案，獲得同學支持與學權組關注！
          </p>
        </div>

        {isAdmin && (
          <div className="shrink-0 self-start sm:self-center">
            <span className="px-3 py-1.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full border border-purple-200">
              🔑 您目前為學權组管理員
            </span>
          </div>
        )}
      </div>

      {/* 🔑 管理員專屬：待審核提案區塊 */}
      {isAdmin && (
        <div className="bg-amber-50/60 border-2 border-amber-300 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-amber-200 pb-3">
            <h2 className="text-base font-bold text-amber-900 flex items-center gap-2">
              ⏳ 待審核提案審核區 ({pendingProposals.length})
            </h2>
            <span className="text-xs text-amber-700">僅管理員可見此區塊</span>
          </div>

          {pendingProposals.length === 0 ? (
            <p className="text-xs text-amber-700 text-center py-4">目前沒有等待審核的提案。</p>
          ) : (
            pendingProposals.map((item) => (
              <div key={item.id} className="p-4 bg-white rounded-xl border border-amber-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full">
                    待審核
                  </span>
                  <span className="text-xs text-gray-400">
                    {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                  </span>
                </div>
                <h3 className="text-base font-bold text-gray-900">{item.title}</h3>
                <p className="text-sm text-gray-700 whitespace-pre-line">{item.content}</p>
                <div className="text-xs text-gray-400">提案人：{item.author_name || "學生"} ({item.author_email})</div>

                <div className="flex items-center gap-2 pt-2 border-t border-gray-100 justify-end">
                  <button
                    onClick={() => handleApprove(item.id)}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition shadow-sm"
                  >
                    ✅ 核可發布
                  </button>
                  <button
                    onClick={() => handleReject(item.id)}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-medium rounded-lg transition"
                  >
                    ❌ 退回提案
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 發起提案表單 */}
      {isLoggedIn ? (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">提案標題</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：關於圖書館開館時間建議..."
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">分類</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="環境與設備">環境與設備</option>
                  <option value="學聯與活動">學聯與活動</option>
                  <option value="課程與教學">課程與教學</option>
                  <option value="其他">其他</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">寶貴意見內容</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder="請詳細說明您的想法或建議..."
                className="w-full p-3 border border-gray-300 rounded-xl bg-gray-50 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                required
              />
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-xl text-sm transition shadow-sm disabled:opacity-50"
              >
                {loading ? "發送中..." : "送出提案審核"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="p-3.5 bg-gray-100/90 rounded-2xl text-center text-sm font-semibold text-gray-500 shadow-sm flex items-center justify-center gap-1.5 border border-gray-200/50">
          🔒 請登入後即可發起提案
        </div>
      )}

      {/* 公開提案清單 */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-800 px-1">熱門學生提案</h2>

        {publicProposals.length === 0 ? (
          <p className="text-gray-500 text-center py-10 bg-white rounded-2xl border border-gray-200">
            目前尚無公開提案。
          </p>
        ) : (
          publicProposals.map((item) => (
            <div key={item.id} className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-3 relative">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-100">
                    {item.category || "其他"}
                  </span>
                  <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full border border-blue-200">
                    {item.status || "研議中"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                  </span>
                </div>
              </div>

              <h3 className="text-base font-bold text-gray-900">{item.title}</h3>
              <p className="text-gray-800 whitespace-pre-line text-sm leading-relaxed">{item.content}</p>
              <div className="text-xs text-gray-400">— {item.author_name || "學生"}</div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
