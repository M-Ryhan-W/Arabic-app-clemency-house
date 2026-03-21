CREATE TABLE IF NOT EXISTS public.user_daily_stats (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_minutes_spent INTEGER DEFAULT 0 NOT NULL,
    daily_goal_minutes INTEGER DEFAULT 15 NOT NULL,
    scenario_completed BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, date)
);

ALTER TABLE public.user_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own daily stats."
    ON public.user_daily_stats FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily stats."
    ON public.user_daily_stats FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily stats."
    ON public.user_daily_stats FOR UPDATE
    USING (auth.uid() = user_id);

-- trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_daily_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_daily_stats_updated_at ON public.user_daily_stats;
CREATE TRIGGER trigger_user_daily_stats_updated_at
    BEFORE UPDATE ON public.user_daily_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_user_daily_stats_updated_at();
