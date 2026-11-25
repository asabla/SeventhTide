import Base
import ./Tide.bend as Tide
import ./Encounter.bend as Encounter
import ./Progress.bend as Progress
import ./LAWS.bend as Laws

def Laws.broken_raft(exposed, last):
  {==}

def Laws.exposure_ends_voyage(timber, last):
  {==}

def Laws.safe_crew_continues(timber):
  {==}

def Laws.safe_crew_lands(timber):
  {==}

def Laws.wake_exposes_decoy(since, marked):
  {==}

def Laws.wake_without_bell(version, marked):
  {==}

def Laws.wake_bell_underwater(version, marked):
  {==}

def Laws.legacy_wake_keeps_routes(ring, marked):
  match ring:
    case Encounter.Silent{}:
      {==}
    case Encounter.SwimmerBell{}:
      {==}
    case Encounter.RaftBell{}:
      {==}

def Laws.echo_shelters_swimmer(version, brace, incoming, dive_cold):
  {==}

def Laws.buoy_routes(since, ring, marked):
  {==}

def Laws.legacy_buoy_keeps_routes(ring, marked):
  {==}

def Laws.buoy_braced_chain(since, brace, incoming, dive_cold):
  {==}

def Laws.archived_buoy_braced_chain(brace, incoming, dive_cold):
  {==}

def Laws.buoy_false_bell(since, incoming, dive_cold):
  {==}

def Laws.archived_buoy_false_bell(incoming, dive_cold):
  {==}

def Laws.one_cold_swimmer_can_follow_false_bell(since, timber):
  {==}

def Laws.two_cold_swimmer_cannot_follow_false_bell(since, timber):
  {==}

def Laws.hull_route_always_available(plan):
  {==}

def Laws.sixth_tide_swimmer_marks_channel():
  {==}

def Laws.dry_line_cannot_mark_channel():
  {==}

def Laws.marking_requires_sounding_line():
  {==}

def Laws.channel_cannot_be_marked_twice():
  {==}

def Laws.landing_is_too_late_to_mark():
  {==}

def Laws.landing_routes_follow_mark(version, ring, marked):
  {==}

def Laws.marked_channel_spares_the_hull(version, brace, incoming, dive_cold):
  {==}

def Laws.forced_landing_uses_brace(version, brace):
  {==}

def Laws.scouting_spares_the_hull_at_a_cold_cost(version, brace):
  {==}

def Laws.fatal_cold(excess):
  {==}

def Laws.four_cold_is_safe():
  {==}

def Laws.slipping_the_towline_spares_the_hull_for_one_extra_cold(since, brace):
  {==}

def Laws.archived_towline_costs_two_extra_cold(brace):
  {==}

def Laws.each_stage_has_a_move(stage):
  match stage:
    case Progress.Salvage{}:
      {==}
    case Progress.Boarding{}:
      {==}
    case Progress.ThreePlays{}:
      {==}
    case Progress.TwoPlays{}:
      {==}
    case Progress.OnePlay{}:
      {==}
    case Progress.Resolution{}:
      {==}
    case Progress.Recovery{}:
      {==}

def Laws.helm_can_play(ready):
  {==}

def Laws.helm_controls_public_choices():
  {==}

def Laws.crewmates_cannot_commit_public_choices():
  {==}

def Laws.crewmate_can_play_or_be_covered(ready):
  {==}

def Laws.bot_plays_after_humans():
  {==}

def Laws.completed_seat_cannot_act(role, ready):
  {==}

def Laws.accepted_move_spends_one(stage, later, verdict):
  match stage:
    case Progress.Salvage{}:
      {==}
    case Progress.Boarding{}:
      {==}
    case Progress.ThreePlays{}:
      {==}
    case Progress.TwoPlays{}:
      {==}
    case Progress.OnePlay{}:
      {==}
    case Progress.Resolution{}:
      match later verdict:
        case 0n Tide.VoyageAdrift{}:
          {==}
        case 1n+rest Tide.VoyageAdrift{}:
          {==}
        case _ Tide.VoyageLost{}:
          {==}
        case _ Tide.VoyageRescued{}:
          {==}
    case Progress.Recovery{}:
      match later verdict:
        case 0n Tide.VoyageAdrift{}:
          {==}
        case 1n+rest Tide.VoyageAdrift{}:
          {==}
        case _ Tide.VoyageLost{}:
          {==}
        case _ Tide.VoyageRescued{}:
          {==}

def Laws.surviving_tide_returns_to_boarding(later):
  {==}

def Laws.loss_stops_play(later):
  match later:
    case 0n:
      {==}
    case 1n+rest:
      {==}

def Laws.rescue_stops_play():
  {==}

def Laws.start_budget():
  {==}

def Laws.line_is_set_from_the_water():
  {==}

def Laws.line_on_raft_does_not_set():
  {==}

def Laws.hook_is_set_from_raft():
  {==}

def Laws.hook_in_water_does_not_set():
  {==}

def Laws.both_tools_open_pry_and_keep_fallbacks(since):
  {==}

def Laws.legacy_crew_cannot_pry():
  {==}

def Laws.prying_only_costs_normal_exposure(version, brace, incoming, extra):
  {==}

def Laws.a_cut_timber_costs_two_hull_despite_brace(since, brace, incoming, extra):
  {==}

def Laws.archived_cut_costs_one_hull_despite_brace(brace, incoming, extra):
  {==}

def Laws.cutting_a_timber_sinks_a_two_hull_raft(since, brace):
  {==}

def Laws.bracing_shelters_the_haul(since, brace, timber):
  {==}

def Laws.bare_raft_cannot_shelter_the_haul(version, timber):
  {==}

def Laws.one_brace_shelters_the_haul(since, timber):
  {==}

def Laws.archived_one_brace_does_not_shelter_the_haul(timber):
  {==}

def Laws.archived_grip_haul_costs_two_extra_cold(brace, timber):
  match brace:
    case 0n:
      {==}
    case 1n:
      {==}
    case 2n+_:
      {==}

def Laws.missing_line_closes_pry(version, hook):
  {==}

def Laws.missing_hook_closes_pry(version, line):
  match line:
    case True{}:
      {==}
    case False{}:
      {==}

def Laws.locker_has_two_routes(since, ring, marked, line, hook):
  {==}

def Laws.old_voyage_cannot_haul():
  {==}

def Laws.hauling_costs_one_extra_cold(version, brace, incoming, extra):
  {==}

def Laws.leaving_costs_normal_exposure(version, brace, incoming, extra):
  {==}

def Laws.surviving_haul_opens_recovery(later):
  {==}

def Laws.fatal_haul_cannot_open_recovery(later):
  {==}

def Laws.leaving_skips_recovery(later):
  {==}

def Laws.reserve_covers_haul(later):
  {==}

def Laws.recovery_voyage_budget():
  {==}

def Laws.cutting_the_timber_leaves_the_creature_following(since):
  {==}

def Laws.hauling_the_swimmer_leaves_the_creature_following(since):
  {==}

def Laws.prying_breaks_pursuit(since):
  {==}

def Laws.archived_grip_never_starts_pursuit(route):
  {==}

def Laws.reef_bell_opens_crossing_alongside_other_routes(since, marked):
  {==}

def Laws.reef_bell_in_water_does_not_open_crossing(version, marked):
  {==}

def Laws.quiet_reef_keeps_the_original_routes(version, ring, marked):
  {==}

def Laws.archived_reef_never_opens_echo_crossing():
  {==}

def Laws.echo_crossing_costs_one_hull_and_normal_exposure(version, brace, incoming, extra):
  {==}

def Laws.reef_lure_uses_the_bells_action():
  {==}

def Laws.ordinary_raft_bell_adds_brace():
  {==}

def Laws.five_cold_on_raft_can_recover():
  {==}

def Laws.safe_swimmer_cannot_save_a_raft_sailor_at_six_cold():
  {==}

def Laws.securing_timber_starts_with_four_hull(since):
  {==}

def Laws.archived_timber_launch_chills_the_crew():
  {==}

def Laws.canvas_trades_hull_for_warmth(since):
  {==}

def Laws.rations_trade_hull_for_food(since):
  {==}
