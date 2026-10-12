"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [myProposals, setMyProposals] = useState<any[]>([]);

  const fetchMyProposals = async (userName: string) => {
    if (!userName) return;

    const { data } = await supabase
      .from("proposals")
      .select("*")
      .eq("author_name", userName)
      .order("created_at", { ascending: false });

    if (data) setMyProposals(data);
  };

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const name =
        session.user.user_metadata?.full_name ||
        session.user.user_metadata?.name ||
        session.user.email?.split("@")[0] ||
        "已登入學生";

      setUser({ ...session.user, displayName: name });
      fetchMyProposals(name);
      return;
    }

    if (typeof window !== "undefined" && localStorage.length > 0) {
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
          const name =
            foundUser?.user_metadata?.full_name ||
            foundUser?.user_metadata?.name ||
            foundUser?.email?.split("@")[0] ||
            "已登入學生";

          setUser({ email: foundUser?.email || "已登入學生", displayName: name });
          fetchMyProposals(name);
          return;
        }
      }
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* 個人帳號資訊 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-3">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          👤 個人帳號資訊
        </h1>
        <div className="text-sm text-gray-700 space-y-1">
          <p><span className="font-semibold">名稱：</span>{user?.displayName || "已登入學生"}</p>
          <p><span className="font-semibold">電子郵件：</span>{user?.email || "未提供"}</p>
        </div>
      </div>

      {/* 我發表的提案 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          📝 我發表的提案 ({myProposals.length})
        </h2>

        {myProposals.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">您目前尚未發表任何提案。</p>
        ) : (
          <div className="space-y-3">
            {myProposals.map((item) => {
              let badgeStyle = "bg-blue-100 text-blue-800 border-blue-200";
              if (item.status === "待審核") {
                badgeStyle = "bg-amber-100 text-amber-800 border-amber-200";
              } else if (item.status === "被退回") {
                badgeStyle = "bg-red-100 text-red-800 border-red-200";
              }

              return (
                <div key={item.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-800 text-sm">{item.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      發布時間：{item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${badgeStyle}`}>
                    {item.status || "研議中"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
