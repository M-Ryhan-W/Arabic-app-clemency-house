// Synthetic data for visual QA of the real app. No network, credentials, or writes.
export const SUPABASE_URL = "http://127.0.0.1:4174/fixture-disabled";
export const SUPABASE_ANON_KEY = "not-a-real-key";
const screen = new URLSearchParams(window.location.search).get("screen");
let user =
  screen === "signin" || screen === "recovery"
    ? null
    : { id: "design-preview", email: "learner@example.test" };
let onAuth = () => {};
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
}).format(new Date());
const stages = [1, 2, 3].map((id) => ({
  id,
  order: id,
  name: ["First conversations", "Everyday connections", "Express yourself"][
    id - 1
  ],
  description: "Build your Arabic, one conversation at a time.",
}));
const lessons = stages.flatMap((stage) =>
  [1, 2, 3].map((n) => ({
    id: stage.id * 10 + n,
    stage_id: stage.id,
    order: n,
    title: ["A warm welcome", "Meeting someone new", "Making yourself at home"][
      n - 1
    ],
    lesson_format: "dialogue",
    cover_image_url: "/stage-cover-1.webp",
  })),
);
const tables = {
  stages,
  lessons,
  profiles: [
    { id: "design-preview", display_name: "Design Preview", avatar_url: "🌿" },
  ],
  user_daily_stats: [
    {
      user_id: "design-preview",
      date: today,
      daily_goal_minutes: 10,
      total_minutes_spent: 4,
    },
  ],
  lesson_blocks: [
    {
      id: "sample-dialogue",
      block_type: "dialogue",
      order_index: 1,
      text_ar: "أَهْلًا وَسَهْلًا",
      text_en: "Welcome!",
      speakers: { display_name_ar: "أحمد", bubble_side: "left" },
    },
  ],
  word_of_the_day: [
    {
      id: "sample-word",
      arabic_text: "مَرْحَبًا",
      english_text: "Hello",
      transliteration: "Marhaban",
    },
  ],
  word_of_the_day_examples: [
    {
      id: "example",
      word_id: "sample-word",
      example_arabic: "مَرْحَبًا بِكَ",
      example_english: "Hello to you",
      order_index: 1,
    },
  ],
  community_posts: [
    {
      id: "post-1",
      user_id: "design-preview",
      text_content: "أَهْلًا وَسَهْلًا",
      created_at: new Date().toISOString(),
      post_type: "text",
      exercise_type: "daily_question",
    },
  ],
};

function from(table) {
  let rows = [...(tables[table] || [])];
  let single = false;
  let write = false;
  const result = () => ({
    data: write ? null : single ? rows[0] || null : rows,
    error: null,
    count: rows.length,
  });
  const chain = new Proxy(
    {},
    {
      get(_, method) {
        if (method === "then")
          return (resolve, reject) =>
            Promise.resolve(result()).then(resolve, reject);
        if (method === "catch")
          return (reject) => Promise.resolve(result()).catch(reject);
        return (...args) => {
          if (method === "single" || method === "maybeSingle") single = true;
          if (["insert", "update", "upsert", "delete"].includes(method))
            write = true;
          if (method === "eq")
            rows = rows.filter(
              (row) => !(args[0] in row) || row[args[0]] === args[1],
            );
          if (method === "in")
            rows = rows.filter(
              (row) => !(args[0] in row) || args[1].includes(row[args[0]]),
            );
          if (method === "range") rows = rows.slice(args[0], args[1] + 1);
          return chain;
        };
      },
    },
  );
  return chain;
}

export const supabase = {
  from,
  auth: {
    getUser: async () => ({ data: { user }, error: null }),
    getSession: async () => ({
      data: { session: user ? { user } : null },
      error: null,
    }),
    onAuthStateChange(callback) {
      onAuth = callback;
      const timer = setTimeout(
        () =>
          callback(
            screen === "recovery" ? "PASSWORD_RECOVERY" : "INITIAL_SESSION",
            user ? { user } : null,
          ),
        0,
      );
      return {
        data: { subscription: { unsubscribe: () => clearTimeout(timer) } },
      };
    },
    signInWithPassword: async () => ({
      error: { message: "Preview only: no sign-in request was sent." },
    }),
    signUp: async () => ({
      error: { message: "Preview only: no account was created." },
    }),
    resetPasswordForEmail: async () => ({ error: null }),
    updateUser: async () => ({ error: null }),
    signOut: async () => {
      user = null;
      onAuth("SIGNED_OUT", null);
      return { error: null };
    },
  },
  rpc: async (name) => ({
    data:
      name === "get_daily_exercises"
        ? {
            daily_question: {
              id: "question",
              question_ar: "كَيْفَ حَالُكَ؟",
              question_en: "How are you?",
            },
          }
        : [],
    error: null,
  }),
  functions: {
    invoke: async (_name, options) => ({
      data:
        options?.body?.action === "get-scenario"
          ? {
              title: "At the café",
              titleAr: "في المقهى",
              emoji: "☕",
              description: "Order a drink and practise a friendly greeting.",
              situation:
                "You are visiting a café. Greet the barista and order a drink.",
              vocabulary: [],
            }
          : null,
      error: null,
    }),
  },
};
