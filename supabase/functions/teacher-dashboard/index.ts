import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_BOT_USER_ID = "00000000-0000-0000-0000-000000000001";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Invalid auth" }, 401);
    }

    const viewerId = userData.user.id;
    const viewerRoles = await getUserRoles(supabase, viewerId);
    const canViewDashboard = viewerRoles.includes("teacher") || viewerRoles.includes("admin");

    if (!canViewDashboard) {
      return jsonResponse({ error: "Teacher or admin access required" }, 403);
    }

    const [
      { data: profiles, error: profilesError },
      { data: allRoles, error: rolesError },
    ] = await Promise.all([
      supabase.from("profiles").select("id, display_name, avatar_url, created_at"),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    if (profilesError || rolesError) {
      console.error("teacher-dashboard required query error:", profilesError || rolesError);
      return jsonResponse({ error: "Failed to load teacher dashboard data" }, 500);
    }

    const [
      dailyStatsResult,
      lessonProgressResult,
      communityPostsResult,
      totalBookLessonsResult,
    ] = await Promise.all([
      safeQuery(
        supabase
          .from("user_daily_stats")
          .select("user_id, date, total_minutes_spent, scenario_completed, picture_completed, created_at, updated_at"),
        [],
        "user_daily_stats",
      ),
      safeQuery(
        supabase
          .from("lesson_progress")
          .select("user_id, lesson_id, hearts_left, completed_at"),
        [],
        "lesson_progress",
      ),
      safeQuery(
        supabase
          .from("community_posts")
          .select("id, user_id, created_at"),
        [],
        "community_posts",
      ),
      safeCountQuery(
        supabase.from("lessons").select("id", { count: "exact", head: true }),
        0,
        "lessons_count",
      ),
    ]);

    const dailyStats = dailyStatsResult.data;
    const lessonProgress = lessonProgressResult.data;
    const communityPosts = communityPostsResult.data;
    const totalBookLessons = totalBookLessonsResult.count;

    const emailMap = await listUserEmails(supabase);
    const roleMap = new Map<string, string[]>();
    for (const row of allRoles || []) {
      const roles = roleMap.get(row.user_id) || [];
      roles.push(row.role);
      roleMap.set(row.user_id, roles);
    }

    const privilegedUserIds = new Set<string>();
    for (const [userId, roles] of roleMap.entries()) {
      if (roles.includes("teacher") || roles.includes("admin")) {
        privilegedUserIds.add(userId);
      }
    }

    const dailyStatsByUser = groupByUser(dailyStats || []);
    const lessonProgressByUser = groupByUser(lessonProgress || []);
    const postsByUser = groupByUser(communityPosts || []);
    const today = isoDate(new Date());

    const students = (profiles || [])
      .filter((profile) => profile.id !== AI_BOT_USER_ID && !privilegedUserIds.has(profile.id))
      .map((profile) => {
        const userDailyStats = dailyStatsByUser.get(profile.id) || [];
        const userLessonRows = lessonProgressByUser.get(profile.id) || [];
        const userPosts = postsByUser.get(profile.id) || [];
        const todayStats = getDailyStatForDate(userDailyStats, today);

        const activeDates = buildActiveDateSet(userDailyStats, userLessonRows, userPosts);
        const activeDateList = Array.from(activeDates).sort();

        const minutesToday = getMinutesForDate(userDailyStats, today);
        const minutesLast7Days = sumMinutesSince(userDailyStats, 6);
        const totalMinutes = userDailyStats.reduce(
          (sum, row) => sum + Number(row.total_minutes_spent || 0),
          0,
        );
        const bookLessonsCompleted = new Set(
          userLessonRows
            .filter((row) => Number(row.hearts_left || 0) > 0)
            .map((row) => row.lesson_id),
        ).size;
        const lastActiveAt = getLastActivityAt(userDailyStats, userLessonRows, userPosts, profile.created_at);
        const lastActiveDate = lastActiveAt ? isoDate(new Date(lastActiveAt)) : null;

        return {
          user_id: profile.id,
          display_name: profile.display_name || "Learner",
          avatar_url: profile.avatar_url || null,
          email: emailMap.get(profile.id) || "",
          joined_at: profile.created_at,
          last_active_at: lastActiveAt,
          stats: {
            minutes_today: minutesToday,
            minutes_last_7_days: minutesLast7Days,
            total_minutes: totalMinutes,
            active_days_last_30: countDatesSince(activeDateList, 29),
            current_streak: computeCurrentStreak(activeDateList),
            longest_streak: computeLongestStreak(activeDateList),
            book_lessons_completed: bookLessonsCompleted,
            book_progress_percent: percent(bookLessonsCompleted, totalBookLessons || 0),
            posts_last_7_days: countPostsSince(userPosts, 6),
            total_posts: userPosts.length,
            scenario_completed_today: Boolean(todayStats?.scenario_completed),
            picture_completed_today: Boolean(todayStats?.picture_completed),
            was_active_today: lastActiveDate === today,
          },
        };
      })
      .sort((a, b) => {
        const aTime = a.last_active_at ? new Date(a.last_active_at).getTime() : 0;
        const bTime = b.last_active_at ? new Date(b.last_active_at).getTime() : 0;
        return bTime - aTime;
      });

    const overview = {
      student_count: students.length,
      active_today: students.filter((student) => student.stats.was_active_today).length,
      total_book_lessons: totalBookLessons || 0,
    };

    return jsonResponse({
      roles: viewerRoles,
      generated_at: new Date().toISOString(),
      overview,
      students,
    });
  } catch (err) {
    console.error("teacher-dashboard error:", err);
    return jsonResponse({ error: err.message || "Unexpected error" }, 500);
  }
});

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function safeQuery(query: Promise<any>, fallback: any[], label: string) {
  const { data, error } = await query;
  if (error) {
    console.error(`teacher-dashboard optional query error (${label}):`, error);
    return { data: fallback };
  }
  return { data: data || fallback };
}

async function safeCountQuery(query: Promise<any>, fallback: number, label: string) {
  const { count, error } = await query;
  if (error) {
    console.error(`teacher-dashboard optional count error (${label}):`, error);
    return { count: fallback };
  }
  return { count: count ?? fallback };
}

async function getUserRoles(supabase: any, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    console.error("teacher-dashboard roles lookup error:", error);
    return [];
  }

  return (data || []).map((row: { role: string }) => row.role);
}

async function listUserEmails(supabase: any) {
  const emailMap = new Map<string, string>();
  let page = 1;
  const perPage = 200;

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("teacher-dashboard listUsers error:", error);
      break;
    }

    const users = data?.users || [];
    for (const row of users) {
      emailMap.set(row.id, row.email || "");
    }

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  return emailMap;
}

function groupByUser(rows: any[]) {
  const map = new Map<string, any[]>();
  for (const row of rows) {
    const existing = map.get(row.user_id) || [];
    existing.push(row);
    map.set(row.user_id, existing);
  }
  return map;
}

function buildActiveDateSet(dailyStats: any[], lessonRows: any[], posts: any[]) {
  const dates = new Set<string>();

  for (const row of dailyStats) {
    if (Number(row.total_minutes_spent || 0) > 0 || row.scenario_completed || row.picture_completed) {
      dates.add(row.date);
    }
  }

  for (const row of lessonRows) {
    if (row.completed_at) {
      dates.add(isoDate(new Date(row.completed_at)));
    }
  }

  for (const row of posts) {
    if (row.created_at) {
      dates.add(isoDate(new Date(row.created_at)));
    }
  }

  return dates;
}

function getDailyStatForDate(rows: any[], targetDate: string) {
  return rows.find((row) => row.date === targetDate) || null;
}

function getMinutesForDate(rows: any[], targetDate: string) {
  return rows
    .filter((row) => row.date === targetDate)
    .reduce((sum, row) => sum + Number(row.total_minutes_spent || 0), 0);
}

function sumMinutesSince(rows: any[], daysAgo: number) {
  const cutoff = isoDate(shiftDays(new Date(), -daysAgo));
  return rows.reduce((sum, row) => {
    if (row.date >= cutoff) {
      return sum + Number(row.total_minutes_spent || 0);
    }
    return sum;
  }, 0);
}

function countDatesSince(dateList: string[], daysAgo: number) {
  const cutoff = isoDate(shiftDays(new Date(), -daysAgo));
  return dateList.filter((date) => date >= cutoff).length;
}

function countPostsSince(rows: any[], daysAgo: number) {
  const cutoff = shiftDays(new Date(), -daysAgo).getTime();
  return rows.filter((row) => row.created_at && new Date(row.created_at).getTime() >= cutoff).length;
}

function getLastActivityAt(dailyStats: any[], lessonRows: any[], posts: any[], fallback: string) {
  const timestamps: number[] = [];

  for (const row of dailyStats) {
    if (row.updated_at) timestamps.push(new Date(row.updated_at).getTime());
    else if (row.date) timestamps.push(new Date(row.date).getTime());
  }

  for (const row of lessonRows) {
    if (row.completed_at) timestamps.push(new Date(row.completed_at).getTime());
  }

  for (const row of posts) {
    if (row.created_at) timestamps.push(new Date(row.created_at).getTime());
  }

  if (timestamps.length === 0) {
    return fallback || null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function computeCurrentStreak(dateList: string[]) {
  if (!dateList.length) return 0;

  const activeSet = new Set(dateList);
  const today = new Date();
  const todayStr = isoDate(today);
  const yesterdayStr = isoDate(shiftDays(today, -1));
  const startOffset = activeSet.has(todayStr) ? 0 : activeSet.has(yesterdayStr) ? 1 : -1;

  if (startOffset === -1) return 0;

  let streak = 0;
  for (let i = startOffset; i < 365; i += 1) {
    const date = isoDate(shiftDays(today, -i));
    if (!activeSet.has(date)) break;
    streak += 1;
  }
  return streak;
}

function computeLongestStreak(dateList: string[]) {
  if (!dateList.length) return 0;

  const sorted = [...new Set(dateList)].sort();
  let longest = 1;
  let current = 1;

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = new Date(sorted[i - 1]);
    const nextExpected = isoDate(shiftDays(previous, 1));
    if (sorted[i] === nextExpected) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function shiftDays(date: Date, delta: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + delta);
  return next;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
