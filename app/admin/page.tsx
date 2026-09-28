"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function AdminPage() {
  const [feedbackList, setFeedbackList] = useState<any[]>([]);
  const [replies, setReplies] = useState<{ [key: string]: string }>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

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
      setReplies(initialReplies);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, []);

  const handleSaveReply = async (id: string) => {
    setLoadingId(id);
    const replyText = replies[id] || "";
    const { error } = await supabase
      .from("feedback")
      .update({
        reply: replyText,
        replied_at: new Date().toISOString(),
      })
      .eq("id", id);

    setLoadingId(null);
    if (error) {
      alert("儲存失敗：" + error.message);
    } else {
      alert("官方回覆已成功更新！");
      fetchFeedback();
    }
  };

  return (
    <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">⚙️ 竹科實中學權組 - 後台管理</h1>
        <p className="text-gray-500 text-sm">管理同學們提交的建言並進行官方回覆</p>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-700">建言列表與學權組回覆管理</h2>
        {feedbackList.length === 0 ? (
          <p className="text-gray-500 text-center py-8 bg-white rounded-xl border">目前沒有收到建言。</p>
        ) : (
          feedbackList.map((item) => (
            <div key={item.id} className="p-5 bg-white rounded-xl border shadow-sm space-y-4">
              <div className="flex items-center justify-between text-xs text-gray-500 border-b pb-2">
                <span className="px-2.5 py-1 bg-gray-100 font-medium text-gray-700 rounded-full">
                  {item.category || "一般建議"}
                </span>
                <span>提交時間：{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</span>
              </div>

              <p className="text-gray-800 font-medium whitespace-pre-line">{item.content}</p>
              <div className="text-xs text-gray-400">發布者：{item.author_name || "匿名同學"}</div>

              <div className="pt-3 border-t space-y-2">
                <label className="block text-xs font-bold text-blue-900">
                  📢 填寫/修改「竹科實中學權組」官方回覆：
                </label>
                <textarea
                  value={replies[item.id] || ""}
                  onChange={(e) =>
                    setReplies({ ...replies, [item.id]: e.target.value })
                  }
                  rows={3}
                  placeholder="請輸入針對此建言的官方回應..."
                  className="w-full p-2.5 text-sm border rounded-lg bg-gray-50 focus:bg-white text-gray-800 transition"
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => handleSaveReply(item.id)}
                    disabled={loadingId === item.id}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {loadingId === item.id ? "發布中..." : "發布/更新回覆"}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
