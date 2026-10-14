"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase";
import { createRightsActionFlight, readRights, sendRightsAction } from "@/lib/rights/client";
import { RIGHTS_PENDING_PATH, ADMIN_ACTIONS, makeFailure } from "@/lib/rights/contracts";
import { parseActionRequest } from "@/lib/rights/validation";
import { PROPOSAL_SELECT_STRING, COMMENT_SELECT_STRING, PUBLIC_STATUSES, toProposalDTO, toCommentDTO, isPublicStatus } from "@/lib/rights/queries";
import type { ProposalDTO, CommentDTO } from "@/lib/rights/queries";

function parseProposals(data: unknown): ProposalDTO[] {
  if (!Array.isArray(data)) throw new TypeError("Invalid proposals response");
  return data.flatMap(row => { const item = toProposalDTO(row); return item ? [item] : []; });
}

export default function ProposalsPage() {
  const [supabase] = useState(createClient);
  const auth = useAuth();
  const { isLoggedIn, isAdmin, generation } = auth;
  const currentAuth = useRef(auth);
  currentAuth.current = auth;
  const [publicProposals, setPublicProposals] = useState<ProposalDTO[]>([]);
  const [pendingProposals, setPendingProposals] = useState<ProposalDTO[]>([]);
  const [publicListStatus, setPublicListStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pendingListStatus, setPendingListStatus] = useState<"loading" | "ready" | "error">("loading");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("環境與設備");

  const [errorMessage, setErrorMessage] = useState("");
  const [pendingAction, setPendingAction] = useState(false);
  const flight = useRef(false);
  const mounted = useRef(true);

  const [statusInputs, setStatusInputs] = useState<{ [key: string]: string }>({});
  const [replyInputs, setReplyInputs] = useState<{ [key: string]: string }>({});
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({});
  const [commentAnon, setCommentAnon] = useState<{ [key: string]: boolean }>({});
  const [commentsMap, setCommentsMap] = useState<Record<string, CommentDTO[]>>({});
  const [upvotesMap, setUpvotesMap] = useState<{ [key: string]: number }>({});
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const verifiedUserId = auth.status === "verified" ? auth.identity?.id : undefined;
  const voteFlights = useRef(new Map<string, ReturnType<typeof createRightsActionFlight>>());
  const committedVotedIds = useRef<string[]>([]);
  const [pendingVotes, setPendingVotes] = useState<string[]>([]);

  useEffect(() => {
    voteFlights.current.clear();
    setPendingVotes([]);
    let ids: string[] = [];
    if (verifiedUserId) {
      try {
        const saved = localStorage.getItem(`voted_proposals:${verifiedUserId}`);
        const parsed: unknown = saved ? JSON.parse(saved) : [];
        if (Array.isArray(parsed) && parsed.every((id): id is string => typeof id === "string")) ids = parsed;
      } catch (error) {
        console.warn("無法讀取本機連署標記", error);
      }
    }
    committedVotedIds.current = ids;
    setVotedIds(ids);
  }, [verifiedUserId, generation]);

  const fetchComments = useCallback(async (proposalIds: string[]) => {
    if (!proposalIds.length) { setCommentsMap({}); return { ok: true }; }
    const version = currentAuth.current.generation;
    try {
      const { data, error } = await supabase
        .from("proposal_comments")
        .select(COMMENT_SELECT_STRING)
        .in("proposal_id", proposalIds)
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (mounted.current && currentAuth.current.generation === version && data) {
        const grouped: Record<string, CommentDTO[]> = {};
        data.forEach((row) => {
          const c = toCommentDTO(row);
          if (!c || !proposalIds.includes(c.proposal_id)) return;
          if (!grouped[c.proposal_id]) grouped[c.proposal_id] = [];
          grouped[c.proposal_id].push(c);
        });
        setCommentsMap(grouped);
      }
      return { ok: true };
    } catch {
      if (mounted.current && currentAuth.current.generation === version) setErrorMessage("留言清單更新失敗，請重新整理。");
      return makeFailure("UNAVAILABLE");
    }
  }, [supabase]);

  const fetchProposals = useCallback(async () => {
    const version = currentAuth.current.generation;
    setPublicListStatus("loading");
    try {
    const { data, error } = await supabase
      .from("proposals")
      .select(PROPOSAL_SELECT_STRING)
      .in("status", [...PUBLIC_STATUSES])
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!mounted.current || currentAuth.current.generation !== version) return makeFailure("UNAVAILABLE");
      const publicData = parseProposals(data).filter(item => isPublicStatus(item.status));
      setPublicProposals(publicData);
      const initialStatuses: { [key: string]: string } = {};
      const initialReplies: { [key: string]: string } = {};
      const initialUpvotes: { [key: string]: number } = {};

      const pIds = publicData.map((item) => {
        initialStatuses[item.id] = item.status || "研議中";
        initialReplies[item.id] = item.reply || "";
        initialUpvotes[item.id] = item.upvotes_count || 0;
        return item.id;
      });

      setStatusInputs(initialStatuses);
      setReplyInputs(initialReplies);
      setUpvotesMap(initialUpvotes);
      setPublicListStatus("ready");
      return await fetchComments(pIds);
    } catch {
      if (mounted.current && currentAuth.current.generation === version) {
        setPublicListStatus("error");
      }
      return makeFailure("UNAVAILABLE");
    }
  }, [supabase, fetchComments]);

  const fetchPending = useCallback(async () => {
    const version = currentAuth.current.generation;
    if (!currentAuth.current.isAdmin) return { ok: true };
    setPendingListStatus("loading");
    try {
    const result = await readRights(RIGHTS_PENDING_PATH, parseProposals);
    if (!mounted.current || currentAuth.current.generation !== version || !currentAuth.current.isAdmin) return result;
    if (result.ok) {
      setPendingProposals(result.data.filter(item => item.status === "待審核"));
      setPendingListStatus("ready");
    } else setPendingListStatus("error");
    return result;
    } catch {
      if (mounted.current && currentAuth.current.generation === version && currentAuth.current.isAdmin) {
        setPendingListStatus("error");
      }
      return makeFailure("UNAVAILABLE");
    }
  }, []);

  const refresh = async () => {
    const result = await fetchProposals();
    if (!result.ok) return result;
    return fetchPending();
  };

  useEffect(() => {
    mounted.current = true;
    const version = generation;
    void fetchProposals().then(undefined, () => {
      if (mounted.current && currentAuth.current.generation === version) setPublicListStatus("error");
    });
    return () => { mounted.current = false; };
  }, [fetchProposals, generation]);

  useEffect(() => {
    setPendingProposals([]);
    setPendingListStatus("loading");
    if (isAdmin) void fetchPending();
  }, [isAdmin, generation, fetchPending]);

  const mutate = async (request: unknown, afterSuccess?: () => void) => {
    if (flight.current) return;
    const parsed = parseActionRequest(request);
    if (!parsed.ok) { setErrorMessage(parsed.message); return; }
    if (!isLoggedIn || (ADMIN_ACTIONS.some(action => action === parsed.data.action) && !isAdmin)) {
      setErrorMessage(makeFailure(isLoggedIn ? "FORBIDDEN" : "UNAUTHORIZED").message);
      return;
    }
    flight.current = true;
    setPendingAction(true);
    setErrorMessage("");
    const version = generation;
    try {
      const result = await sendRightsAction(parsed.data, refresh);
      if (!mounted.current || currentAuth.current.generation !== version) return;
      if (!result.ok) setErrorMessage(result.message);
      else {
        afterSuccess?.();
        if (result.refresh === "failed") setErrorMessage(result.message || "已儲存，但清單更新失敗");
      }
    } finally {
      flight.current = false;
      if (mounted.current && currentAuth.current.generation === version) {
        setPendingAction(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await mutate({ action: "createProposal", payload: { title, content, category } }, () => {
      setTitle("");
      setContent("");
      alert("學權組已收到你的提案！提案將由學權組審核，核可後才會公開發布。");
    });
  };

  // Local single-flight/cache is only UI recovery: client-total writes still permit
  // duplicate ballots and lost updates across tabs/users; this is not ballot integrity.
  const handleUpvote = async (id: string) => {
    if (!isLoggedIn || !verifiedUserId) {
      alert("請先登入才能進行覆議！");
      return;
    }
    if (voteFlights.current.has(id)) return;
    const snapshot = {
      count: upvotesMap[id] ?? publicProposals.find(p => p.id === id)?.upvotes_count ?? 0,
      voted: committedVotedIds.current.includes(id),
    };
    const count = snapshot.voted ? Math.max(0, snapshot.count - 1) : snapshot.count + 1;
    const request = parseActionRequest({ action: "setVoteCount", payload: { proposalId: id, count } });
    if (!request.ok) { setErrorMessage(request.message); return; }
    const run = createRightsActionFlight();
    voteFlights.current.set(id, run);
    setPendingVotes(prev => [...prev, id]);
    setUpvotesMap(prev => ({ ...prev, [id]: count }));
    setErrorMessage("");
    const version = generation;
    const ownerId = verifiedUserId;
    const current = () => mounted.current && currentAuth.current.generation === version &&
      currentAuth.current.status === "verified" && currentAuth.current.identity?.id === ownerId;
    try {
      const result = await run(request.data);
      if (!current()) return;
      if (!result.ok && result.code !== "OUTCOME_UNKNOWN") {
        setUpvotesMap(prev => ({ ...prev, [id]: snapshot.count }));
        setErrorMessage(result.message);
        return;
      }
      const receipt = result.ok ? result.data : null;
      if (receipt && typeof receipt === "object" && "id" in receipt && receipt.id === id &&
          "upvotes_count" in receipt && typeof receipt.upvotes_count === "number" &&
          Number.isSafeInteger(receipt.upvotes_count) && receipt.upvotes_count >= 0) {
        const confirmedCount = receipt.upvotes_count;
        setUpvotesMap(prev => ({ ...prev, [id]: confirmedCount }));
        const ids = snapshot.voted ? committedVotedIds.current.filter(vId => vId !== id) : [...committedVotedIds.current, id];
        committedVotedIds.current = ids;
        setVotedIds(ids);
        try {
          localStorage.setItem(`voted_proposals:${ownerId}`, JSON.stringify(ids));
        } catch (error) {
          console.warn("已儲存連署，但無法寫入本機標記", error);
        }
        return;
      }
      setUpvotesMap(prev => ({ ...prev, [id]: snapshot.count }));
      setErrorMessage("無法確認是否已儲存，請先更新清單確認，勿重複提交。");
      // No public readRights proposal endpoint exists; use the existing public read,
      // never the admin-only pending endpoint, and never replay the mutation.
      try {
        const { data, error } = await supabase.from("proposals").select(PROPOSAL_SELECT_STRING)
          .in("status", [...PUBLIC_STATUSES]).eq("id", id);
        if (!current()) return;
        if (!error && data) {
          const item = parseProposals(data).find(p => p.id === id && isPublicStatus(p.status));
          if (item) setUpvotesMap(prev => ({ ...prev, [id]: item.upvotes_count }));
        }
      } catch (error) {
        if (current()) console.warn("無法更新連署票數", error);
      }
    } finally {
      if (current() && voteFlights.current.get(id) === run) {
        voteFlights.current.delete(id);
        setPendingVotes(prev => prev.filter(vId => vId !== id));
      }
    }
  };

  const handleSaveControl = async (id: string) => {
    const newStatus = statusInputs[id] || "研議中";
    const newReply = replyInputs[id] || "";
    if (publicProposals.find(item => item.id === id)?.reply && !newReply.trim() && !window.confirm("確定要清除官方回覆嗎？")) return;
    await mutate({ action: "updateProposalControl", payload: { id, status: newStatus, reply: newReply } });
  };

  const handleDeleteProposal = async (id: string) => {
    const confirmDelete = window.confirm("⚠️ 確定要刪除這條提案嗎？刪除後將無法復原！");
    if (!confirmDelete) return;

    await mutate({ action: "deleteProposal", payload: { id } });
  };

  const handleApprove = async (id: string) => {
    await mutate({ action: "approveProposal", payload: { id } });
  };

  const handleReject = async (id: string) => {
    const confirmReject = window.confirm("確定要退回這項提案嗎？");
    if (!confirmReject) return;

    await mutate({ action: "rejectProposal", payload: { id } });
  };

  const handleAddComment = async (proposalId: string) => {
    const commentText = commentInputs[proposalId] || "";
    const isAnon = commentAnon[proposalId] || false;
    await mutate({ action: "addComment", payload: { proposalId, content: commentText, isAnonymous: isAnon } }, () => {
      setCommentInputs(prev => ({ ...prev, [proposalId]: "" }));
    });
  };

  const handleDeleteComment = async (commentId: string, proposalId: string) => {
    await mutate({ action: "deleteComment", payload: { id: commentId, proposalId } });
  };

  // React does not await event handlers; this boundary owns unexpected rejections.
  const runEvent = (operation: () => Promise<unknown>) => {
    const version = generation;
    const reportFailure = () => {
      if (mounted.current && currentAuth.current.generation === version) {
        setErrorMessage("無法確認是否已儲存，請先更新清單確認，勿重複提交。");
      }
    };
    try { void operation().catch(reportFailure); }
    catch { reportFailure(); }
  };
  const loadErrors = [
    publicListStatus === "error" ? "提案清單更新失敗，請重試。" : "",
    isAdmin && pendingListStatus === "error" ? "待審核提案清單更新失敗，請重試。" : "",
  ].filter(Boolean).join(" ");

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {errorMessage && <p role="alert" className="p-3 rounded-xl bg-red-50 text-red-700">{errorMessage}</p>}
      {loadErrors && <p role="alert" className="p-3 rounded-xl bg-red-50 text-red-700">{loadErrors}</p>}
      <fieldset disabled={pendingAction} className="contents">
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
              ⏳ 待審核提案區 {pendingListStatus === "ready" ? `(${pendingProposals.length})` : ""}
            </h2>
            <span className="text-xs text-amber-700 font-medium">僅管理員可見此區塊</span>
          </div>

          {pendingListStatus === "loading" ? (
            <p role="status" className="text-xs text-amber-700 text-center py-4">待審核提案載入中…</p>
          ) : pendingListStatus === "error" ? (
            <button type="button" onClick={() => runEvent(fetchPending)} className="px-3 py-1.5 bg-white text-amber-900 text-xs font-medium rounded-lg">重試待審核提案</button>
          ) : pendingProposals.length === 0 ? (
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
                    onClick={() => runEvent(() => handleApprove(item.id))}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition shadow-sm"
                  >
                    ✅ 核可發布
                  </button>
                  <button
                    onClick={() => runEvent(() => handleReject(item.id))}
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
          <form onSubmit={e => { e.preventDefault(); runEvent(() => handleSubmit(e)); }} className="space-y-4">
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
                 disabled={pendingAction}
                className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-xl text-sm transition shadow-sm disabled:opacity-50"
              >
                 {pendingAction ? "發送中..." : "送出提案"}
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

        {publicListStatus === "loading" ? (
          <p role="status" className="text-gray-500 text-center py-10">公開提案載入中…</p>
        ) : publicListStatus === "error" ? (
          <button type="button" onClick={() => runEvent(fetchProposals)} className="px-4 py-2 bg-blue-700 text-white font-medium rounded-xl text-sm">重試公開提案</button>
        ) : publicProposals.length === 0 ? (
          <p className="text-gray-500 text-center py-10 bg-white rounded-2xl border border-gray-200">
            目前尚無公開提案。
          </p>
        ) : (
          publicProposals.map((item) => {
            const comments = commentsMap[item.id] || [];
            const isVoted = votedIds.includes(item.id);
            const dbCount = item.upvotes_count || 0;
            const stateCount = upvotesMap[item.id];
            const rawCount = stateCount !== undefined ? stateCount : dbCount;
            const currentCount = rawCount;

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
                      onClick={() => runEvent(() => handleDeleteProposal(item.id))}
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
                    onClick={() => runEvent(() => handleUpvote(item.id))}
                    disabled={pendingVotes.includes(item.id)}
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
                        onClick={() => runEvent(() => handleSaveControl(item.id))}
                        disabled={pendingAction}
                        className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white text-xs font-medium rounded-xl transition disabled:opacity-50 shrink-0 shadow-sm"
                      >
                        {pendingAction ? "儲存中..." : "💾 儲存修改"}
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
                              onClick={() => runEvent(() => handleDeleteComment(c.id, item.id))}
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
                          onClick={() => runEvent(() => handleAddComment(item.id))}
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
      </fieldset>
    </main>
  );
}
