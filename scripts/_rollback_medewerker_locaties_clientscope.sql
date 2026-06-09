-- Rollback van _migrate_medewerker_locaties_clientscope.sql:
-- herstelt de oorspronkelijke (ongescopede) clienten-SELECT-policy. De koppeltabel +
-- helpers blijven staan (ongebruikt = onschadelijk); droppen kan los indien gewenst.
drop policy if exists "clienten_select_begeleider_of_hr" on public.clienten;
create policy "clienten_select_begeleider_of_hr"
  on public.clienten for select to authenticated
  using (is_admin(auth.uid()) or is_hr() or is_begeleider());
