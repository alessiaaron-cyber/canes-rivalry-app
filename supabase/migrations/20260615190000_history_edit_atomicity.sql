create or replace function public.save_history_game_edit(
  p_game_id bigint,
  p_game_date date,
  p_opponent text,
  p_game_type text,
  p_first_picker_user_id uuid,
  p_first_goal_scorer text,
  p_winner_user_id uuid,
  p_recap text,
  p_picks jsonb,
  p_scores jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game record;
  v_pick jsonb;
  v_score jsonb;
  v_user_id uuid;
  v_pick_slot integer;
  v_player_name text;
  v_goals integer;
  v_assists integer;
  v_points integer;
begin
  if not public.is_allowed_user() then
    raise exception 'Not allowed';
  end if;

  if not exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  ) then
    raise exception 'Admin access required';
  end if;

  select id, season_id into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'Game not found';
  end if;

  if p_first_picker_user_id is not null and not exists (
    select 1 from public.user_profiles where id = p_first_picker_user_id and is_active = true
  ) then
    raise exception 'Invalid first picker';
  end if;

  if p_winner_user_id is not null and not exists (
    select 1 from public.user_profiles where id = p_winner_user_id and is_active = true
  ) then
    raise exception 'Invalid winner';
  end if;

  update public.games
  set game_date = p_game_date,
      opponent = nullif(trim(p_opponent), ''),
      game_type = coalesce(nullif(trim(p_game_type), ''), 'Regular Season'),
      first_picker_user_id = p_first_picker_user_id,
      first_goal_scorer = nullif(trim(p_first_goal_scorer), ''),
      winner_user_id = p_winner_user_id,
      recap = nullif(trim(p_recap), '')
  where id = p_game_id;

  for v_pick in select * from jsonb_array_elements(coalesce(p_picks, '[]'::jsonb)) loop
    v_user_id := nullif(v_pick->>'owner_user_id', '')::uuid;
    v_pick_slot := coalesce((v_pick->>'pick_slot')::integer, 0);
    v_player_name := nullif(trim(v_pick->>'player_name'), '');
    v_goals := greatest(coalesce((v_pick->>'goals')::integer, 0), 0);
    v_assists := greatest(coalesce((v_pick->>'assists')::integer, 0), 0);
    v_points := greatest(coalesce((v_pick->>'points')::integer, 0), 0);

    if v_user_id is null or v_pick_slot <= 0 then
      raise exception 'Invalid pick payload';
    end if;

    if not exists (select 1 from public.user_profiles where id = v_user_id and is_active = true) then
      raise exception 'Invalid pick owner';
    end if;

    update public.picks
    set player_name = v_player_name,
        goals = case when v_player_name is null then 0 else v_goals end,
        assists = case when v_player_name is null then 0 else v_assists end,
        points = case when v_player_name is null then 0 else v_points end,
        updated_by_user_id = auth.uid(),
        updated_at = now()
    where game_id = p_game_id
      and owner_user_id = v_user_id
      and pick_slot = v_pick_slot;

    if not found then
      insert into public.picks (game_id, owner_user_id, pick_slot, player_name, goals, assists, points, updated_by_user_id, updated_at)
      values (
        p_game_id,
        v_user_id,
        v_pick_slot,
        v_player_name,
        case when v_player_name is null then 0 else v_goals end,
        case when v_player_name is null then 0 else v_assists end,
        case when v_player_name is null then 0 else v_points end,
        auth.uid(),
        now()
      );
    end if;
  end loop;

  for v_score in select * from jsonb_array_elements(coalesce(p_scores, '[]'::jsonb)) loop
    v_user_id := nullif(v_score->>'user_id', '')::uuid;
    v_points := coalesce((v_score->>'points')::integer, 0);

    if v_user_id is null then
      raise exception 'Invalid score payload';
    end if;

    insert into public.game_user_scores (game_id, user_id, points)
    values (p_game_id, v_user_id, v_points)
    on conflict (game_id, user_id)
    do update set points = excluded.points;
  end loop;

  perform public.refresh_season_user_totals(v_game.season_id::bigint);
end;
$$;

grant execute on function public.save_history_game_edit(bigint, date, text, text, uuid, text, uuid, text, jsonb, jsonb) to authenticated;
