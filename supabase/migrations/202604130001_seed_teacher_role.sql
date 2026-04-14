INSERT INTO public.user_roles (user_id, role)
SELECT id, 'teacher'
FROM auth.users
WHERE email = 'ihyaarabic1@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
