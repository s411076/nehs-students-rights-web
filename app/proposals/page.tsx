"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 🔒 管理員 Email 白名單
const ADMIN_EMAILS = ["s411076@nehs.hc.edu.tw", "s411158@nehs.hc.edu.tw"];

const checkIsAdmin = (email?: string) => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
};

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("其他");
  const [loading, setLoading] = useState(false);

  // Auth & Admin State
  const [user, setUser] = useState<any>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // 🔍 抓取提案列表（管理員可看全部含待審核，一般學生僅看已核可通過的提案）
  const fetchProposals = async (adminStatus: boolean) => {
    let query = supabase.from("proposals").select("*");

    if (!adminStatus) {
      // 非管理員僅顯示已審核通過的提案
      query = query.eq("status", "通過");
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (!error && data) {
      setProposals(data);
    }
  };

  // 🔍 檢查身份
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

      // LocalStorage 備份檢查
      if (typeof window !== "undefined") {
        for (let i = 0; i < localStorage.length; i++) {
          const rawKey = localStorage.key(i) || "";
          const val = localStorage.getItem(rawKey) || "";
          if (!val || val === "false" || val === "null" || val === "undefined") continue;

          const k = rawKey.toLowerCase();
          if (k.includes("sb") || k.includes("user") || k.includes("auth")) {
            let parsedObj: any = null;
            try {
              parsedObj = JSON.parse(val);
            } catch (e) {}

            const foundUser = parsedObj?.user || (parsedObj?.email ? parsedObj : null);
            const foundEmail = foundUser?.email || parsedObj?.email || "";
            const adminFlag = checkIsAdmin(foundEmail);

            setIsLoggedIn(true);
            setUser(foundUser || { name: "學生", email: foundEmail });
            setIsAdmin(adminFlag);
            fetchProposals(adminFlag);
            return;
          }
        }
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

  // 學生發起提案（狀態設為待審核）
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setLoading(true);

    const authorName =
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email?.split("@")[0] ||
      user?.email ||
      "已登入學生";

    const { error } = await supabase.from("proposals").insert([
      {
        title: title.trim(),
        content: content.trim(),
        category,
        author_name: authorName,
        status: "待審核", // 預設需要審核
      },
    ]);

    setLoading(false);
    if (error) {
      alert("提交失敗：" + error.message);
    } else {
      setTitle("");
      setContent("");
      alert("學權組已收到你的提案！我們正在慎重審核中！");
      fetchProposals(isAdmin);
    }
  };

  // 🔑 管理員核可提案發布
  const handleApprove = async (id: string) => {
    const { error } = await supabase
      .from("proposals")
      .update({ status: "通過" })
      .eq("id", id);

    if (error) {
      alert("核可失敗：" + error.message);
    } else {
      alert("提案已成功核可公開！");
      fetchProposals(true);
    }
  };

  // 🔑 管理員刪除/退回提案
  const handleDelete = async (id: string) => {
    const confirmDelete = window.confirm("⚠️ 確定要刪除或退回此提案嗎？");
    if (!confirmDelete) return;

    const { error } = await supabase.from("proposals").delete().eq("id", id);
    if (error) {
      alert("刪除失敗：" + error.message);
    } else {
      alert("已刪除該提案。");
      fetchProposals(isAdmin);
    }
  };

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* 標題與管理員標籤 */}
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
            <span className="px-3 py-1.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full flex items-center gap-1 border border-purple-200">
              🔑 您目前為學權組管理員 (具備審核權限)
            </span>
          </div>
        )}
      </div>

      {/* 提案表單區塊 */}
      {isLoggedIn ? (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
            ✍️ 發起新提案
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  提案標題
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="請輸入明確的提案主題..."
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
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
                  <option value="環境與設備">環境與設備</option>
                  <option value="學聯與活動">學聯與活動</option>
                  <option value="課程與教學">課程與教學</option>
                  <option value="其他">其他</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                提案詳細內容
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder="請詳細說明現狀、改進建議與預期效益..."
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
                {loading ? "提交中..." : "提交提案審核"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="p-3.5 bg-gray-100/90 rounded-2xl text-center text-sm font-semibold text-gray-500 shadow-sm flex items-center justify-center gap-1.5 border border-gray-200/50">
          🔒 請登入後即可發起提案
        </div>
      )}

      {/* 提案清單 */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-800 px-1">
          {isAdmin ? "提案審核與公開清單" : "熱門學生提案"}
        </h2>

        {proposals.length === 0 ? (
          <p className="text-gray-500 text-center py-10 bg-white rounded-2xl border border-gray-200">
            目前尚無可顯示的提案。
          </p>
        ) : (
          proposals.map((item) => {
            const isPending = item.status === "待審核";

            return (
              <div
                key={item.id}
                className={`p-5 bg-white rounded-2xl border shadow-sm space-y-3 relative ${
                  isPending ? "border-amber-300 bg-amber-50/20" : "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-100">
                      {item.category || "其他"}
                    </span>
                    <span
                      className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                        isPending
                          ? "bg-amber-100 text-amber-800 border border-amber-200"
                          : "bg-blue-100 text-blue-800 border border-blue-200"
                      }`}
                    >
                      {item.status || "待審核"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleDateString()
                        : ""}
                    </span>
                  </div>

                  {/* 管理員控制按鈕 */}
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      {isPending && (
                        <button
                          onClick={() => handleApprove(item.id)}
                          className="text-xs px-3 py-1 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition shadow-sm"
                        >
                          ✅ 核可發布
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg border border-red-200 transition"
                      >
                        🗑️ 刪除/退回
                      </button>
                    </div>
                  )}
                </div>

                <h3 className="text-base font-bold text-gray-900">
                  {item.title}
                </h3>
                <p className="text-gray-800 whitespace-pre-line text-sm leading-relaxed">
                  {item.content}
                </p>
                <div className="text-xs text-gray-400">
                  提案人：{item.author_name || "學生"}
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
