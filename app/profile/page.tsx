"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 萬用 JWT Token 解碼器
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

export default function ProfilePage() {
  const [userEmail, setUserEmail] = useState<string>("未提供");
  const [username, setUsername] = useState<string>("已登入學生");
  const [myProposals, setMyProposals] = useState<any[]>([]);

  // 搜尋並比對該帳號發表過的所有提案
  const fetchMyProposals = async (email: string, realName: string) => {
    try {
      const { data } = await supabase
        .from("proposals")
        .select("*")
        .order("created_at", { ascending: false });

      if (data) {
        const fullEmail = (email || "").toLowerCase().trim();
        const prefix = fullEmail.includes("@") ? fullEmail.split("@")[0] : fullEmail;
        const lowerName = (realName || "").toLowerCase().trim();

        const matched = data.filter((item) => {
          const author = (item.author_name || "").toLowerCase().trim();
          const authorEmail = (item.author_email || "").toLowerCase().trim();

          if (!author && !authorEmail) return false;

          return (
            (fullEmail && authorEmail === fullEmail) ||
            (fullEmail && author.includes(fullEmail)) ||
            (prefix && author.includes(prefix)) ||
            (lowerName && author.includes(lowerName)) ||
            (author && lowerName && lowerName.includes(author)) ||
            (author && prefix && prefix.includes(author))
          );
        });

        setMyProposals(matched);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 🔍 深度萬用登入檢測
  const checkAuth = async () => {
    let foundEmail = "";
    let foundRealName = "";

    try {
      // 1. Supabase Session API
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        foundEmail = session.user.email || "";
        foundRealName =
          session.user.user_metadata?.full_name ||
          session.user.user_metadata?.name ||
          "";
      }

      // 2. Supabase User API
      if (!foundEmail) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          foundEmail = authUser.email || "";
          foundRealName =
            authUser.user_metadata?.full_name ||
            authUser.user_metadata?.name ||
            "";
        }
      }

      // 3. 掃描 LocalStorage (含 JWT 解碼)
      if (!foundEmail && typeof window !== "undefined") {
        for (let i = 0; i < localStorage.length; i++) {
          const rawKey = localStorage.key(i) || "";
          const val = localStorage.getItem(rawKey) || "";
          if (!val) continue;

          try {
            const parsed = JSON.parse(val);
            const targetUser =
              parsed?.user ||
              parsed?.currentSession?.user ||
              (parsed?.email ? parsed : null);

            if (targetUser?.email) {
              foundEmail = targetUser.email;
              foundRealName =
                targetUser?.user_metadata?.full_name ||
                targetUser?.user_metadata?.name ||
                "";
              break;
            }
          } catch (e) {}

          if (val.includes("eyJ")) {
            const jwtObj = parseJwt(val);
            if (jwtObj?.email) {
              foundEmail = jwtObj.email;
              foundRealName =
                jwtObj?.user_metadata?.full_name ||
                jwtObj?.user_metadata?.name ||
                "";
              break;
            }
          }
        }
      }

      // 4. 掃描 Cookie JWT Token
      if (!foundEmail && typeof window !== "undefined") {
        const cookies = document.cookie.split(";");
        for (const cookie of cookies) {
          const val = cookie.trim().split("=")[1] || "";
          if (val.includes("eyJ")) {
            const jwtObj = parseJwt(val);
            if (jwtObj?.email) {
              foundEmail = jwtObj.email;
              foundRealName =
                jwtObj?.user_metadata?.full_name ||
                jwtObj?.user_metadata?.name ||
                "";
              break;
            }
          }
        }
      }

      if (foundEmail) {
        setUserEmail(foundEmail);
        const prefix = foundEmail.includes("@") ? foundEmail.split("@")[0] : foundEmail;
        const displayName = foundRealName || prefix || "已登入學生";
        setUsername(displayName);
        fetchMyProposals(foundEmail, foundRealName || prefix);
      } else {
        setUserEmail("未提供");
        setUsername("已登入學生");
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    checkAuth();

    const timer = setTimeout(() => {
      checkAuth();
    }, 500);

    const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.user) {
        const email = session.user.email || "";
        const name =
          session.user.user_metadata?.full_name ||
          session.user.user_metadata?.name ||
          "";
        setUserEmail(email);
        const prefix = email.includes("@") ? email.split("@")[0] : email;
        const displayName = name || prefix || "已登入學生";
        setUsername(displayName);
        fetchMyProposals(email, name || prefix);
      } else {
        checkAuth();
      }
    });

    return () => {
      clearTimeout(timer);
      authListener.subscription.unsubscribe();
    };
  }, []);

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* 個人帳號資訊 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-3">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          👤 個人帳號資訊
        </h1>
        <div className="text-sm text-gray-700 space-y-1">
          <p><span className="font-semibold">名稱：</span>{username}</p>
          <p><span className="font-semibold">電子郵件：</span>{userEmail}</p>
        </div>
      </div>

      {/* 我發表的提案 (完整連動) */}
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
