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

function parseJwt(token: string) {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export default function ProposalsPage() {
  const [publicProposals, setPublicProposals] = useState<any[]>([]);
  const [pendingProposals, setPendingProposals] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("環境與設備");
  const [loading, setLoading] = useState(false);

  const [user, setUser] = useState<any>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [statusInputs, setStatusInputs] = useState<{ [key: string]: string }>({});
  const [replyInputs, setReplyInputs] = useState<{ [key: string]: string }>({});
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({});
  const [commentAnon, setCommentAnon] = useState<{ [key: string]: boolean }>({});
  const [commentsMap, setCommentsMap] = useState<{ [key: string]: any[] }>({});
  const [upvotesMap, setUpvotesMap] = useState<{ [key: string]: number }>({});
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const getUserDisplayName = (u: any) => {
    if (!u) return "已登入學生";
    const realName = u?.user_metadata?.full_name || u?.user_metadata?.name || u?.name;
    if (realName && realName !== "已登入學生") return realName;
    const email = u?.email || "";
    if (email) {
      return email.split("@")[0];
    }
    return "已登入學生";
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedVoted = localStorage.getItem("voted_proposals");
      if (savedVoted) {
        try {
          setVotedIds(JSON.parse(savedVoted));
        } catch (e) {}
      }

      const savedMap = localStorage.getItem("proposal_upvotes_map");
      if (savedMap) {
        try {
          setUpvotesMap(JSON.parse(savedMap));
        } catch (e) {}
      }
    }
  }, []);

  const fetchComments = async (proposalIds: string[]) => {
    if (!proposalIds.length) return;
    try {
      const { data, error } = await supabase
        .from("proposal_comments")
        .select("*")
        .in("proposal_id", proposalIds)
        .order("created_at", { ascending: true });

      if (!error && data) {
        const grouped: { [key: string]: any[] } = {};
        data.forEach((c) => {
          if (!grouped[c.proposal_id]) grouped[c.proposal_id] = [];
          grouped[c.proposal_id].push(c);
        });
        setCommentsMap(grouped);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProposals = async (adminFlag: boolean) => {
    const { data: publicData } = await supabase
      .from("proposals")
      .select("*")
      .neq("status", "待審核")
      .neq("status", "被退回")
      .order("created_at", { ascending: false });

    if (publicData) {
      setPublicProposals(publicData);
      const initialStatuses: { [key: string]: string } = {};
      const initialReplies: { [key: string]: string } = {};
      const pIds = publicData.map((item) => {
        initialStatuses[item.id] = item.status || "研議中";
        initialReplies[item.id] = item.reply || "";
        return item.id;
      });
      setStatusInputs(initialStatuses);
      setReplyInputs(initialReplies);
      fetchComments(pIds);
    }

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
      let detectedUser: any = null;
      let detectedLoggedIn = false;
      let detectedAdmin = false;

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        detectedUser = session.user;
        detectedLoggedIn = true;
        detectedAdmin = checkIsAdmin(session.user.email);
      } else {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          detectedUser = authUser;
          detectedLoggedIn = true;
          detectedAdmin = checkIsAdmin(authUser.email);
        } else if (typeof window !== "undefined") {
          for (let i = 0; i < localStorage.length; i++) {
            const rawKey = localStorage.key(i) || "";
            const val = localStorage.getItem(rawKey) || "";
            if (!val) continue;

            try {
              const parsed = JSON.parse(val);
              const candidate = parsed?.user || (parsed?.email ? parsed : null);
              if (candidate?.email) {
                detectedUser = candidate;
                detectedLoggedIn = true;
                detectedAdmin = checkIsAdmin(candidate.email);
                break;
              }
            } catch (e) {}

            if (val.includes("eyJ")) {
              const jwtObj = parseJwt(val);
              if (jwtObj?.email) {
                detectedUser = {
                  email: jwtObj.email,
                  user_metadata: jwtObj.user_metadata || { full_name: jwtObj.name },
                };
                detectedLoggedIn = true;
                detectedAdmin = checkIsAdmin(jwtObj.email);
                break;
              }
            }
          }
        }
      }

      setIsLoggedIn(detectedLoggedIn);
      setIsAdmin(detectedAdmin);
      setUser(detectedUser);
      fetchProposals(detectedAdmin);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setLoading(true);

    const rawTitle = title.trim();
    const finalTitle = rawTitle.startsWith("[") ? rawTitle : `[${category}] ${rawTitle}`;
    const authorName = getUserDisplayName(user);

    const { error } = await supabase.from("proposals").insert([
      {
        title: finalTitle,
        content: content.trim(),
        author_name: authorName,
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

  const handleUpvote = (id: string) => {
    if (!isLoggedIn) {
      alert("請先登入才能進行覆議！");
      return;
    }

    let updatedVotedIds: string[];
    let delta = 0;

    if (votedIds.includes(id)) {
      updatedVotedIds = votedIds.filter((vId) => vId !== id);
      delta = -1;
    } else {
      updatedVotedIds = [...votedIds, id];
      delta = 1;
    }

    setVotedIds(updatedVotedIds);

    const newMap = {
      ...upvotesMap,
      [id]: Math.max(0, (upvotesMap[id] || 0) + delta),
    };
    setUpvotesMap(newMap);

    if (typeof window !== "undefined") {
      localStorage.setItem("voted_proposals", JSON.stringify(updatedVotedIds));
      localStorage.setItem("proposal_upvotes_map", JSON.stringify(newMap));
    }
  };

  const handleSaveControl = async (id: string) => {
    setSavingId(id);
    const newStatus = statusInputs[id] || "研議中";
    const newReply = replyInputs[id] || "";

    const { error } = await supabase
      .from("proposals")
      .update({
        status: newStatus,
        reply: newReply,
      })
      .eq("id", id);

    setSavingId(null);
    if (error) {
      alert("儲存失敗：" + error.message);
    } else {
      alert("已成功更新提案狀態與官方回覆！");
      fetchProposals(true);
    }
  };

  const handleDeleteProposal = async (id: string) => {
    const confirmDelete = window.confirm("⚠️ 確定要刪除這條提案嗎？刪除後將無法復原！");
    if (!confirmDelete) return;

    const { error } = await supabase.from("proposals").delete().eq("id", id);
    if (error) {
      alert("刪除失敗：" + error.message);
    } else {
      alert("提案已成功刪除！");
      fetchProposals(isAdmin);
    }
  };

  const handleApprove = async (id: string) => {
    const { error } = await supabase
      .from("proposals")
      .update({ status: "研議中" })
      .eq("id", id);

    if (error) {
      alert("核可失敗：" + error.message);
    } else {
      alert("提案已成功核可公開！");
      fetchProposals(true);
    }
  };

  const handleReject = async (id: string) => {
    const confirmReject = window.confirm("確定要退回這項提案嗎？");
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

  const handleAddComment = async (proposalId: string) => {
    const commentText = commentInputs[proposalId] || "";
    if (!commentText.trim()) return;

    const isAnon = commentAnon[proposalId] || false;
    const authorName = isAnon ? "匿名學生" : getUserDisplayName(user);

    const { error } = await supabase.from("proposal_comments").insert([
      {
        proposal_id: proposalId,
        content: commentText.trim(),
        author_name: authorName,
      },
    ]);

    if (error) {
      alert("留言失敗：" + error.message);
    } else {
      setCommentInputs({ ...commentInputs, [proposalId]: "" });
      fetchComments([proposalId]);
    }
  };

  const handleDeleteComment = async (commentId: string, proposalId: string) => {
    const { error } = await supabase.from("proposal_comments").delete().eq("id", commentId);
    if (!error) {
      fetchComments([proposalId]);
    }
  };

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
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
              🔑 您目前為學權組管理員
            </span>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="bg-amber-50/60 border-2 border-amber-300 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-amber-200 pb-3">
            <h2 className="text-base font-bold text-amber-900 flex items-center gap-2">
              ⏳ 待審核提案區 ({pendingProposals.length})
            </h2>
            <span className="text-xs text-amber-700 font-medium">僅管理員可見此區塊</span>
          </div>

          {pendingProposals.length === 0 ? (
            <p className="text-xs text-amber-700 text-center py-4">目前尚無等待審核的提案。</p>
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
                <div className="text-xs text-gray-400">提案人：{item.author_name || "學生"}</div>

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

      {isLoggedIn ? (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
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
                  placeholder="例如：關於圖書館開館時間建議..."
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

            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-xl text-sm transition shadow-sm disabled:opacity-50"
              >
                {loading ? "發送中..." : "送出提案"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="p-3.5 bg-gray-100/90 rounded-2xl text-center text-sm font-semibold text-gray-500 shadow-sm flex items-center justify-center gap-1.5 border border-gray-200/50">
          🔒 請登入後即可發起提案
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-800 px-1">熱門學生提案</h2>

        {publicProposals.length === 0 ? (
          <p className="text-gray-500 text-center py-10 bg-white rounded-2xl border border-gray-200">
            目前尚無公開提案。
          </p>
        ) : (
          publicProposals.map((item) => {
            const comments = commentsMap[item.id] || [];
            const isVoted = votedIds.includes(item.id);
            const currentCount = upvotesMap[item.id] || 0;

            return (
              <div
                key={item.id}
                className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-4 relative"
              >
                <div className="flex items-center justify-between pb-1 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full border border-blue-200">
                      {item.status || "研議中"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleDateString()
                        : ""}
                    </span>
                  </div>

                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteProposal(item.id)}
                      className="text-xs px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg border border-red-200 transition flex items-center gap-1"
                    >
                      🗑️ 刪除
                    </button>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                  <div className="text-xs text-gray-400 mt-1">
                    提案人：{item.author_name || "學生"} • 發布時間：
                    {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
                  </div>
                </div>

                <p className="text-gray-800 whitespace-pre-line text-sm leading-relaxed">
                  {item.content}
                </p>

                <div className="pt-1">
                  <button
                    onClick={() => handleUpvote(item.id)}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-full border transition flex items-center gap-1.5 shadow-sm ${
                      isVoted
                        ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                        : "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                    }`}
                  >
                    👍 {isVoted ? "已聯署 (點擊取消)" : "覆議/聯署"}{" "}
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[11px] ${
                        isVoted ? "bg-blue-800 text-white" : "bg-blue-200 text-blue-900"
                      }`}
                    >
                      {currentCount}
                    </span>
                  </button>
                </div>

                {isAdmin && (
                  <div className="p-4 bg-purple-50/60 border border-purple-200 rounded-xl space-y-3 mt-3">
                    <div className="text-xs font-bold text-purple-900 flex items-center gap-1">
                      🔑 管理員控制台（修改狀態與官方回覆）：
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <select
                        value={statusInputs[item.id] || "研議中"}
                        onChange={(e) =>
                          setStatusInputs({ ...statusInputs, [item.id]: e.target.value })
                        }
                        className="p-2 border border-purple-300 rounded-xl bg-white text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="研議中">研議中</option>
                        <option value="通過">通過</option>
                        <option value="已採納">已採納</option>
                        <option value="不採納">不採納</option>
                      </select>

                      <input
                        type="text"
                        value={replyInputs[item.id] || ""}
                        onChange={(e) =>
                          setReplyInputs({ ...replyInputs, [item.id]: e.target.value })
                        }
                        placeholder="輸入官方回覆內容..."
                        className="flex-1 p-2 border border-purple-300 rounded-xl bg-white text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />

                      <button
                        onClick={() => handleSaveControl(item.id)}
                        disabled={savingId === item.id}
                        className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white text-xs font-medium rounded-xl transition disabled:opacity-50 shrink-0 shadow-sm"
                      >
                        {savingId === item.id ? "儲存中..." : "💾 儲存修改"}
                      </button>
                    </div>
                  </div>
                )}

                {item.reply && (
                  <div className="p-4 bg-purple-50/80 border-l-4 border-purple-600 rounded-r-xl space-y-1 mt-2">
                    <div className="font-bold text-purple-900 flex items-center gap-1 text-xs">
                      📢 學權組官方回覆：
                    </div>
                    <p className="text-purple-950 text-sm whitespace-pre-line">
                      {item.reply}
                    </p>
                  </div>
                )}

                <hr className="border-gray-100 my-2" />

                <div className="space-y-3 pt-1">
                  <div className="text-xs font-bold text-gray-700 flex items-center gap-1">
                    💬 討論與留言 ({comments.length})
                  </div>

                  {comments.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1 relative"
                    >
                      <div className="flex items-center justify-between text-gray-500">
                        <span className="font-semibold text-gray-800 flex items-center gap-1">
                          👤 {c.author_name || "學生"}
                        </span>
                        <div className="flex items-center gap-2">
                          <span>
                            {c.created_at
                              ? new Date(c.created_at).toLocaleString()
                              : ""}
                          </span>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteComment(c.id, item.id)}
                              className="text-red-500 hover:text-red-700 font-bold"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-gray-800 text-xs">{c.content}</p>
                    </div>
                  ))}

                  {isLoggedIn && (
                    <div className="space-y-2 pt-2">
                      <textarea
                        value={commentInputs[item.id] || ""}
                        onChange={(e) =>
                          setCommentInputs({ ...commentInputs, [item.id]: e.target.value })
                        }
                        rows={2}
                        placeholder="寫下您的看法與建議..."
                        className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={commentAnon[item.id] || false}
                            onChange={(e) =>
                              setCommentAnon({ ...commentAnon, [item.id]: e.target.checked })
                            }
                            className="w-3.5 h-3.5 text-blue-600 rounded"
                          />
                          <span>🕵️ 匿名留言 (隱藏姓名)</span>
                        </label>
                        <button
                          onClick={() => handleAddComment(item.id)}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-xl transition shadow-sm"
                        >
                          送出留言
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
