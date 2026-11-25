import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const ID_KEY = "acervo_work_session_id";
const IDLE_MS = 5 * 60 * 1000;

export async function endWorkSession() {
  const id = sessionStorage.getItem(ID_KEY);
  if (!id) return;
  await supabase.from("user_work_sessions").update({ ended_at: new Date().toISOString() }).eq("id", id);
  sessionStorage.removeItem(ID_KEY);
}

export function WorkSessionTracker() {
  useEffect(() => {
    let disposed = false;
    let sessionId: string | null = null;
    let timer: number | undefined;
    let lastActivity = Date.now();
    let lastSaved = Date.now();
    let paused = false;
    const touch = () => {
      lastActivity = Date.now();
      if (paused) paused = false;
    };
    const start = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (disposed || !auth.user) return;
      const stored = sessionStorage.getItem(ID_KEY);
      if (stored) {
        const { data } = await supabase.from("user_work_sessions").select("id, ended_at, last_activity_at").eq("id", stored).maybeSingle();
        if (data && !data.ended_at && Date.now() - new Date(data.last_activity_at).getTime() < IDLE_MS) {
          sessionId = data.id;
          lastActivity = Date.now();
          lastSaved = Date.now();
        }
      }
      if (!sessionId) {
        if (stored) await supabase.from("user_work_sessions").update({ ended_at: new Date().toISOString() }).eq("id", stored);
        const { data, error } = await supabase.from("user_work_sessions").insert({ user_id: auth.user.id }).select("id").single();
        if (error || !data || disposed) return;
        sessionId = data.id;
        sessionStorage.setItem(ID_KEY, data.id);
      }
      const persist = async () => {
        if (!sessionId || disposed) return;
        const now = Date.now();
        const idle = now - lastActivity >= IDLE_MS;
        const elapsed = Math.max(0, Math.min(90, Math.floor((now - lastSaved) / 1000)));
        if (!paused && !idle && elapsed > 0) {
          const { data: row } = await supabase.from("user_work_sessions").select("active_seconds").eq("id", sessionId).maybeSingle();
          await supabase.from("user_work_sessions").update({
            active_seconds: (row?.active_seconds ?? 0) + elapsed,
            last_activity_at: new Date(lastActivity).toISOString(),
          }).eq("id", sessionId);
        } else if (idle && !paused) {
          await supabase.from("user_work_sessions").update({ last_activity_at: new Date(lastActivity).toISOString() }).eq("id", sessionId);
          paused = true;
        } else if (!idle && paused) {
          await supabase.from("user_work_sessions").update({ last_activity_at: new Date(now).toISOString() }).eq("id", sessionId);
          paused = false;
        }
        lastSaved = now;
      };
      timer = window.setInterval(() => void persist(), 60_000);
      const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
      events.forEach((event) => window.addEventListener(event, touch, { passive: true }));
      window.addEventListener("focus", touch);
      window.addEventListener("beforeunload", () => { void persist(); });
      return () => {
        events.forEach((event) => window.removeEventListener(event, touch));
        window.removeEventListener("focus", touch);
      };
    };
    let cleanup: (() => void) | undefined;
    void start().then((fn) => { cleanup = fn; });
    return () => {
      disposed = true;
      if (timer) window.clearInterval(timer);
      cleanup?.();
    };
  }, []);
  return null;
}
