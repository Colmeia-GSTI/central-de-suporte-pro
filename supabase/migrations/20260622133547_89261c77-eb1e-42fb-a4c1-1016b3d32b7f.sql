
DO $$
DECLARE
  v_ids uuid[] := ARRAY['a200c343-0a79-444e-a939-0e32f5567606','e5f1264f-a374-4ca6-87b7-459ba4d7be4e']::uuid[];
  v_ticket_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ticket_ids FROM public.tickets WHERE created_by = ANY(v_ids);

  IF v_ticket_ids IS NOT NULL THEN
    DELETE FROM public.ticket_comments WHERE ticket_id = ANY(v_ticket_ids);
    DELETE FROM public.ticket_history WHERE ticket_id = ANY(v_ticket_ids);
    DELETE FROM public.ticket_time_entries WHERE ticket_id = ANY(v_ticket_ids);
    DELETE FROM public.ticket_pauses WHERE ticket_id = ANY(v_ticket_ids);
    DELETE FROM public.ticket_transfers WHERE ticket_id = ANY(v_ticket_ids);
    DELETE FROM public.ticket_attendance_sessions WHERE ticket_id = ANY(v_ticket_ids);
    DELETE FROM public.ticket_tag_assignments WHERE ticket_id = ANY(v_ticket_ids);
    DELETE FROM public.notifications WHERE related_type = 'ticket' AND related_id = ANY(v_ticket_ids);
    DELETE FROM public.tickets WHERE id = ANY(v_ticket_ids);
  END IF;

  DELETE FROM public.ticket_comments WHERE user_id = ANY(v_ids);
  DELETE FROM public.notifications WHERE user_id = ANY(v_ids);
  DELETE FROM public.push_subscriptions WHERE user_id = ANY(v_ids);
  DELETE FROM public.user_roles WHERE user_id = ANY(v_ids);
  DELETE FROM public.profiles WHERE user_id = ANY(v_ids);
  DELETE FROM public.pending_invites WHERE email ILIKE 'e2e-test%';

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data)
  VALUES (NULL, 'e2e_users_purged', 'auth.users', NULL,
          jsonb_build_object('ids', v_ids, 'tickets_removed', COALESCE(v_ticket_ids, ARRAY[]::uuid[])));

  DELETE FROM auth.users WHERE id = ANY(v_ids);
END $$;
