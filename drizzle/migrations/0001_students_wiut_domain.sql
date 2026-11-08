CREATE OR REPLACE FUNCTION public.is_allowed_email(_email text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(coalesce(_email,'')) LIKE '%@students.wiut.uz' OR lower(coalesce(_email,'')) = 'zukhrdnvoybek@gmail.com'
$$;