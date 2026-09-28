"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function FeedbackPage() {
  const [feedbackList, setFeedbackList] = useState<any[]>([]);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("一般建議");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchFeedback = async () => {
    const { data, error } = await supabase
      .from("feedback")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setFeedbackList(data);
  };

  useEffect(() => {
    fetchFeedback();
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

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">💬 回饋與建言</h1>
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

      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-800">近期建言與官方回應</h2>
        {feedbackList.length === 0 ? (
          <p className="text-gray-500 text-center py-8 bg-white rounded-xl border">目前尚無意見回饋。</p>
        ) : (
          feedbackList.map((item) => (
            <div key={item.id} className="p-5 bg-white rounded-xl border shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full">
                  {item.category || "一般建議"}
                </span>
                <span className="text-xs text-gray-400">
                  {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                </span>
              </div>
              <p className="text-gray-800 whitespace-pre-line">{item.content}</p>
              <div className="text-xs text-gray-500">— {item.author_name || "匿名同學"}</div>

              {item.reply && (
                <div className="mt-3 p-4 bg-blue-50 border-l-4 border-blue-600 rounded-r-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-blue-900 flex items-center gap-1">
                      📢 竹科實中學權組 回覆：
                    </span>
                    {item.replied_at && (
                      <span className="text-xs text-blue-600">
                        {new Date(item.replied_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-blue-950 whitespace-pre-line">{item.reply}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  );
}
