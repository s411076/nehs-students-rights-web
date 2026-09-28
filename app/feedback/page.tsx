"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 🛡️ 授權有回覆權限的「學權組成員 Email 白名單」
const ADMIN_EMAILS = [
  "s4111076@nehs.hc.edu.tw",
  "s411158@nehs.hc.edu.tw",
  // 👈 若有其他成員 Email，可以在這裡繼續新增，例如: "member@nehs.hc.edu.tw"
];

export default function FeedbackPage() {
  const [feedbackList, setFeedbackList] = useState<any[]>([]);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("一般建議");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);

  // Auth State
  const [user, setUser] = useState<any>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Reply State
  const [replyInputs, setReplyInputs] = useState<{ [key: string]: string }>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // 🔍 嚴格檢查目前登入者是否為授權的學權組成員
  const currentUserEmail = user?.email?.toLowerCase() || "";
  const isAdmin = ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(currentUserEmail);

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

  useEffect(() => {
    fetchFeedback();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user || null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    const { error } = await supabase.from("feedback").insert([
      {
        content,
        category,
        is_anonymous: isAnonymous,
        author_name: isAnonymous ? "匿名同學" : "學生",
      },
    ]);
    setLoading(false);
    if (error) {
      alert("提交失敗：" + error.message);
    } else {
      setContent("");
      alert("意見已成功送出！");
      fetchFeedback();
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const inputEmail = email.trim().toLowerCase();

    if (!ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(inputEmail)) {
      alert("權限不符：此 Email 非授權之學權組成員帳號！");
      return;
    }

    setLoginLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: inputEmail,
      password,
    });
    setLoginLoading(false);

    if (error) {
      alert("登入失敗：" + error.message);
    } else {
      setUser(data.user);
      setShowLoginModal(false);
      setEmail("");
      setPassword("");
      alert("已成功登入學權組管理員帳號！");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    alert("已成功登出！");
  };

  const handleSaveReply = async (id: string) => {
    if (!isAdmin) {
      alert("權限不足：只有授權的學權組成員可以發布回覆！");
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

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* 頂部 Header & 登入身分狀態 */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <span className="text-xl font-bold text-gray-800">💬 竹科實中學權組建言平台</span>
        <div>
          {user ? (
            <div className="flex items-center gap-3">
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  isAdmin
                    ? "bg-blue-100 text-blue-800 border border-blue-200"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {isAdmin ? "🛡️ 學權組官方成員" : "👤 一般使用者"} ({user.email})
              </span>
              <button
                onClick={handleLogout}
                className="text-xs text-red-600 hover:underline font-medium"
              >
                登出
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium px-3 py-1.5 rounded-lg transition border border-blue-200"
            >
              🔐 學權組登入
            </button>
          )}
        </div>
      </div>

      {/* 發表意見表單 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">回饋與建言</h1>
        <p className="text-gray-600 mb-6">歡迎向竹科實中學權組提出您的寶貴意見或學校生活中的問題！</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">分類</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full p-2.5 border rounded-lg bg-gray-50 text-gray-800"
            >
              <option value="一般建議">一般建議</option>
              <option value="校園設施">校園設施</option>
              <option value="環境與設備">環境與設備</option>
              <option value="學聯與活動">學聯與活動</option>
              <option value="課程與教學">課程與教學</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">寶貴意見</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="請詳細說明您的想法或建議..."
              className="w-full p-3 border rounded-lg bg-gray-50 text-gray-800 focus:bg-white transition"
              required
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span>🕵️ 匿名發布（隱藏姓名）</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? "發送中..." : "送出建議"}
            </button>
          </div>
        </form>
      </div>

      {/* 建言清單與官方回覆 */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-800">近期建言與官方回應</h2>
        {feedbackList.length === 0 ? (
          <p className="text-gray-500 text-center py-8 bg-white rounded-xl border">目前尚無意見回饋。</p>
        ) : (
          feedbackList.map((item) => (
            <div key={item.id} className="p-5 bg-white rounded-xl border shadow-sm space-y-4">
              {/* 頂部標籤列 */}
              <div className="flex items-center justify-between border-b pb-2">
                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-100">
                  {item.category || "一般建議"}
                </span>
                <span className="text-xs text-gray-400">
                  {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                </span>
              </div>

              {/* 內文與發布者 */}
              <p className="text-gray-800 whitespace-pre-line text-base">{item.content}</p>
              <div className="text-xs text-gray-500">— {item.is_anonymous ? "匿名學生" : item.author_name || "學生"}</div>

              {/* 📢 藍色卡片顯示官方回覆（任何人皆可查看） */}
              {item.reply && (
                <div className="p-4 bg-blue-50/70 border-l-4 border-blue-600 rounded-r-xl space-y-1.5">
                  <div className="font-bold text-blue-900 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5">📢 學權組官方回覆：</span>
                    {item.replied_at && (
                      <span className="text-xs text-blue-600 font-normal">
                        {new Date(item.replied_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="text-blue-950 text-sm whitespace-pre-line pl-0.5">{item.reply}</p>
                </div>
              )}

              {/* 🔒 只有學權組官方成員 (isAdmin === true) 才能看到並進行回覆 */}
              {isAdmin && (
                <div className="p-4 bg-blue-50/40 border border-blue-200 rounded-xl space-y-3">
                  <div className="text-sm font-bold text-blue-900 flex items-center gap-1.5">
                    ✏️ 編輯學權組官方回覆：
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      value={replyInputs[item.id] || ""}
                      onChange={(e) =>
                        setReplyInputs({ ...replyInputs, [item.id]: e.target.value })
                      }
                      placeholder="請輸入學權組官方回應內容..."
                      className="flex-1 p-2.5 border border-blue-300 rounded-lg bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => handleSaveReply(item.id)}
                      disabled={savingId === item.id}
                      className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50 shrink-0 flex items-center justify-center gap-1 shadow-sm"
                    >
                      {savingId === item.id ? "發布中..." : "💾 儲存修改"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 🔐 登入 Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-xl max-w-sm w-full space-y-4 shadow-xl">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-gray-800">🔐 學權組成員登入</h3>
              <p className="text-xs text-gray-500">請輸入已授權之學權組 Email 與密碼</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">學權組 Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="s4111076@nehs.hc.edu.tw"
                  className="w-full p-2 border rounded text-sm text-gray-800"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">密碼</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-2 border rounded text-sm text-gray-800"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="px-4 py-1.5 text-xs bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loginLoading ? "驗證中..." : "登入"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
