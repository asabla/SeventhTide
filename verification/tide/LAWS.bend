import Base
import ./Tide.bend as Tide
import ./Encounter.bend as Encounter
import ./Progress.bend as Progress
import ./Opening.bend as Opening

law broken_raft:
  for exposed: Bool
  for last: Bool
  { Tide.finish(0n, exposed, last) == Tide.VoyageLost{} : Tide.Outcome }

law exposure_ends_voyage:
  for timber: Nat
  for last: Bool
  { Tide.finish(1n+timber, True{}, last) == Tide.VoyageLost{} : Tide.Outcome }

law safe_crew_continues:
  for timber: Nat
  { Tide.finish(1n+timber, False{}, False{}) == Tide.VoyageAdrift{} : Tide.Outcome }

law safe_crew_lands:
  for timber: Nat
  { Tide.finish(1n+timber, False{}, True{}) == Tide.VoyageRescued{} : Tide.Outcome }

law wake_exposes_decoy:
  for since: Nat
  for marked: Bool
  { Encounter.routes(Encounter.SecondWake{}, 6n+since, Encounter.RaftBell{}, marked, False{}, False{}) == Encounter.Routes{True{}, False{}, True{}, False{}, False{}, False{}, False{}} : Encounter.Routes }

law wake_without_bell:
  for version: Nat
  for marked: Bool
  { Encounter.routes(Encounter.SecondWake{}, version, Encounter.Silent{}, marked, False{}, False{}) == Encounter.Routes{False{}, False{}, True{}, False{}, False{}, False{}, False{}} : Encounter.Routes }

law wake_bell_underwater:
  for version: Nat
  for marked: Bool
  { Encounter.routes(Encounter.SecondWake{}, version, Encounter.SwimmerBell{}, marked, False{}, False{}) == Encounter.Routes{False{}, False{}, True{}, False{}, False{}, False{}, False{}} : Encounter.Routes }

law legacy_wake_keeps_routes:
  for ring: Encounter.Ring
  for marked: Bool
  { Encounter.routes(Encounter.SecondWake{}, 5n, ring, marked, False{}, False{}) == Encounter.Routes{False{}, False{}, True{}, False{}, False{}, False{}, False{}} : Encounter.Routes }

law echo_shelters_swimmer:
  for version: Nat
  for brace: Nat
  for incoming: Nat
  for dive_cold: Nat
  { Encounter.effects(Encounter.Decoy{}, brace, version, incoming, dive_cold) == Encounter.Effects{0n, 0n, 1n, 1n} : Encounter.Effects }

law buoy_routes:
  for since: Nat
  for ring: Encounter.Ring
  for marked: Bool
  { Encounter.routes(Encounter.BellBuoy{}, 7n+since, ring, marked, False{}, False{}) == Encounter.Routes{False{}, True{}, False{}, False{}, False{}, False{}, False{}} : Encounter.Routes }

law legacy_buoy_keeps_routes:
  for ring: Encounter.Ring
  for marked: Bool
  { Encounter.routes(Encounter.BellBuoy{}, 6n, ring, marked, False{}, False{}) == Encounter.Routes{False{}, False{}, True{}, False{}, False{}, False{}, False{}} : Encounter.Routes }

law buoy_braced_chain:
  for since: Nat
  for brace: Nat
  for incoming: Nat
  for dive_cold: Nat
  { Encounter.effects(Encounter.Chain{}, 1n+brace, 12n+since, incoming, dive_cold) == Encounter.Effects{0n, 1n, 2n, 3n} : Encounter.Effects }

law archived_buoy_braced_chain:
  for brace: Nat
  for incoming: Nat
  for dive_cold: Nat
  { Encounter.effects(Encounter.Chain{}, 1n+brace, 11n, incoming, dive_cold) == Encounter.Effects{0n, 1n, 2n, 2n} : Encounter.Effects }

law buoy_false_bell:
  for version: Nat
  for incoming: Nat
  for dive_cold: Nat
  { Encounter.effects(Encounter.Chain{}, 0n, version, incoming, dive_cold) == Encounter.Effects{0n, 2n, 2n, 1n} : Encounter.Effects }

law hull_route_always_available:
  for plan: Encounter.Routes
  { Encounter.allowed(Encounter.Hull{}, plan) == True{} : Bool }

law sixth_tide_swimmer_marks_channel:
  { Encounter.marks_channel(6n, True{}, True{}, False{}) == True{} : Bool }

law dry_line_cannot_mark_channel:
  { Encounter.marks_channel(6n, True{}, False{}, False{}) == False{} : Bool }

law marking_requires_sounding_line:
  { Encounter.marks_channel(6n, False{}, True{}, False{}) == False{} : Bool }

law channel_cannot_be_marked_twice:
  { Encounter.marks_channel(6n, True{}, True{}, True{}) == False{} : Bool }

law landing_is_too_late_to_mark:
  { Encounter.marks_channel(7n, True{}, True{}, False{}) == False{} : Bool }

law landing_routes_follow_mark:
  for version: Nat
  for ring: Encounter.Ring
  for marked: Bool
  { Encounter.routes(Encounter.Landing{}, version, ring, marked, False{}, False{}) == Encounter.Routes{False{}, False{}, True{}, marked, False{}, False{}, False{}} : Encounter.Routes }

law marked_channel_spares_the_hull:
  for version: Nat
  for brace: Nat
  for incoming: Nat
  for dive_cold: Nat
  { Encounter.effects(Encounter.Channel{}, brace, version, incoming, dive_cold) == Encounter.Effects{0n, 0n, 2n, 1n} : Encounter.Effects }

law forced_landing_uses_brace:
  for version: Nat
  for brace: Nat
  { Encounter.effects(Encounter.Hull{}, brace, version, 4n, 2n) == Encounter.Effects{Nat.sub(4n, brace), 0n, 2n, 1n} : Encounter.Effects }

law scouting_spares_the_hull_at_a_cold_cost:
  for version: Nat
  for brace: Nat
  { Encounter.effects(Encounter.Dive{}, brace, version, 4n, 2n) == Encounter.Effects{0n, 2n, 2n, 1n} : Encounter.Effects }

law fatal_cold:
  for excess: Nat
  { Encounter.fatal(5n+excess) == True{} : Bool }

law four_cold_is_safe:
  { Encounter.fatal(4n) == False{} : Bool }

law slipping_the_towline_spares_the_hull_for_one_extra_cold:
  for since: Nat
  for brace: Nat
  { Encounter.effects(Encounter.Dive{}, brace, 14n+since, 2n, Encounter.towline_cold(14n+since)) == Encounter.Effects{0n, 1n, 2n, 1n} : Encounter.Effects }

law archived_towline_costs_two_extra_cold:
  for brace: Nat
  { Encounter.effects(Encounter.Dive{}, brace, 13n, 2n, Encounter.towline_cold(13n)) == Encounter.Effects{0n, 2n, 2n, 1n} : Encounter.Effects }

law each_stage_has_a_move:
  for stage: Progress.Stage
  { Progress.accepts(stage, Progress.fallback(stage)) == True{} : Bool }

law helm_can_play:
  for ready: Bool
  { Progress.crew_access(True{}, Progress.HelmSeat{}, ready) == Progress.Access{True{}, False{}, False{}} : Progress.Access }

law helm_controls_public_choices:
  { Progress.can_steer(Progress.HelmSeat{}) == True{} : Bool }

law crewmates_cannot_commit_public_choices:
  { Progress.can_steer(Progress.CrewSeat{}) == False{} : Bool }

law crewmate_can_play_or_be_covered:
  for ready: Bool
  { Progress.crew_access(True{}, Progress.CrewSeat{}, ready) == Progress.Access{True{}, True{}, False{}} : Progress.Access }

law bot_plays_after_humans:
  { Progress.crew_access(True{}, Progress.BotSeat{}, True{}) == Progress.Access{False{}, True{}, True{}} : Progress.Access }

law completed_seat_cannot_act:
  for role: Progress.Role
  for ready: Bool
  { Progress.crew_access(False{}, role, ready) == Progress.Access{False{}, False{}, False{}} : Progress.Access }

law accepted_move_spends_one:
  for stage: Progress.Stage
  for later: Nat
  for verdict: Tide.Outcome
  { Progress.remaining(stage, later) == 1n+Progress.budget_after(Progress.advance(stage, later, verdict)) : Nat }

law surviving_tide_returns_to_boarding:
  for later: Nat
  { Progress.advance(Progress.Resolution{}, 1n+later, Tide.VoyageAdrift{}) == Progress.Continue{Progress.Boarding{}, later} : Progress.Step }

law loss_stops_play:
  for later: Nat
  { Progress.advance(Progress.Resolution{}, later, Tide.VoyageLost{}) == Progress.Stop{Progress.later_budget(later)} : Progress.Step }

law rescue_stops_play:
  { Progress.advance(Progress.Resolution{}, 0n, Tide.VoyageRescued{}) == Progress.Stop{0n} : Progress.Step }

law start_budget:
  { Progress.remaining(Progress.Salvage{}, 6n) == 36n : Nat }

law line_is_set_from_the_water:
  { Encounter.sets_tool(Encounter.SoundingLine{}, True{}) == True{} : Bool }

law line_on_raft_does_not_set:
  { Encounter.sets_tool(Encounter.SoundingLine{}, False{}) == False{} : Bool }

law hook_is_set_from_raft:
  { Encounter.sets_tool(Encounter.Boathook{}, False{}) == True{} : Bool }

law hook_in_water_does_not_set:
  { Encounter.sets_tool(Encounter.Boathook{}, True{}) == False{} : Bool }

law both_tools_open_pry_and_keep_fallbacks:
  for since: Nat
  { Encounter.routes(Encounter.RaftGrip{}, 8n+since, Encounter.Silent{}, False{}, True{}, True{}) == Encounter.Routes{False{}, False{}, True{}, False{}, True{}, False{}, False{}} : Encounter.Routes }

law missing_line_closes_pry:
  for version: Nat
  for hook: Bool
  { Encounter.grip_open(False{}, hook, version) == False{} : Bool }

law missing_hook_closes_pry:
  for version: Nat
  for line: Bool
  { Encounter.grip_open(line, False{}, version) == False{} : Bool }

law legacy_crew_cannot_pry:
  { Encounter.grip_open(True{}, True{}, 7n) == False{} : Bool }

law prying_only_costs_normal_exposure:
  for version: Nat
  for brace: Nat
  for incoming: Nat
  for extra: Nat
  { Encounter.effects(Encounter.Pry{}, brace, version, incoming, extra) == Encounter.Effects{0n, 0n, 2n, 1n} : Encounter.Effects }

law a_cut_timber_costs_two_hull_despite_brace:
  for since: Nat
  for brace: Nat
  for incoming: Nat
  for extra: Nat
  { Encounter.effects(Encounter.Cut{}, brace, 16n+since, incoming, extra) == Encounter.Effects{2n, 0n, 2n, 1n} : Encounter.Effects }

law archived_cut_costs_one_hull_despite_brace:
  for brace: Nat
  for incoming: Nat
  for extra: Nat
  { Encounter.effects(Encounter.Cut{}, brace, 15n, incoming, extra) == Encounter.Effects{1n, 0n, 2n, 1n} : Encounter.Effects }

law cutting_a_timber_sinks_a_two_hull_raft:
  for since: Nat
  for brace: Nat
  { Encounter.resolve(Encounter.effects(Encounter.Cut{}, brace, 16n+since, 2n, 0n), 2n, 0n, 0n, 0n, False{}) == Encounter.Resolution{0n, 2n, 0n, 0n, 1n, Tide.VoyageLost{}} : Encounter.Resolution }

law bracing_shelters_the_haul:
  for since: Nat
  for brace: Nat
  for timber: Nat
  { Encounter.effects(Encounter.Dive{}, 2n+brace, 13n+since, timber, Encounter.grip_haul_cost(2n+brace, 13n+since)) == Encounter.Effects{0n, 1n, 2n, 1n} : Encounter.Effects }

law bare_raft_cannot_shelter_the_haul:
  for version: Nat
  for timber: Nat
  { Encounter.effects(Encounter.Dive{}, 0n, version, timber, Encounter.grip_haul_cost(0n, version)) == Encounter.Effects{0n, 2n, 2n, 1n} : Encounter.Effects }

law one_brace_shelters_the_haul:
  for since: Nat
  for timber: Nat
  { Encounter.effects(Encounter.Dive{}, 1n, 15n+since, timber, Encounter.grip_haul_cost(1n, 15n+since)) == Encounter.Effects{0n, 1n, 2n, 1n} : Encounter.Effects }

law archived_one_brace_does_not_shelter_the_haul:
  for timber: Nat
  { Encounter.effects(Encounter.Dive{}, 1n, 14n, timber, Encounter.grip_haul_cost(1n, 14n)) == Encounter.Effects{0n, 2n, 2n, 1n} : Encounter.Effects }

law archived_grip_haul_costs_two_extra_cold:
  for brace: Nat
  for timber: Nat
  { Encounter.effects(Encounter.Dive{}, brace, 12n, timber, Encounter.grip_haul_cost(brace, 12n)) == Encounter.Effects{0n, 2n, 2n, 1n} : Encounter.Effects }

law locker_has_two_routes:
  for since: Nat
  for ring: Encounter.Ring
  for marked: Bool
  for line: Bool
  for hook: Bool
  { Encounter.routes(Encounter.DriftingLocker{}, 9n+since, ring, marked, line, hook) == Encounter.Routes{False{}, False{}, False{}, False{}, False{}, True{}, False{}} : Encounter.Routes }

law old_voyage_cannot_haul:
  { Encounter.can_haul(Encounter.DriftingLocker{}, 8n) == False{} : Bool }

law hauling_costs_one_extra_cold:
  for version: Nat
  for brace: Nat
  for incoming: Nat
  for extra: Nat
  { Encounter.effects(Encounter.HaulLocker{}, brace, version, incoming, extra) == Encounter.Effects{0n, 1n, 2n, 1n} : Encounter.Effects }

law leaving_costs_normal_exposure:
  for version: Nat
  for brace: Nat
  for incoming: Nat
  for extra: Nat
  { Encounter.effects(Encounter.LeaveLocker{}, brace, version, incoming, extra) == Encounter.Effects{0n, 0n, 2n, 1n} : Encounter.Effects }

law surviving_haul_opens_recovery:
  for later: Nat
  { Progress.locker_advance(1n+later, Tide.VoyageAdrift{}, True{}) == Progress.Continue{Progress.Recovery{}, 1n+later} : Progress.Step }

law fatal_haul_cannot_open_recovery:
  for later: Nat
  { Progress.locker_advance(1n+later, Tide.VoyageLost{}, True{}) == Progress.Stop{Progress.later_budget(1n+later)} : Progress.Step }

law leaving_skips_recovery:
  for later: Nat
  { Progress.locker_advance(1n+later, Tide.VoyageAdrift{}, False{}) == Progress.Continue{Progress.Boarding{}, later} : Progress.Step }

law reserve_covers_haul:
  for later: Nat
  { Progress.voyage_remaining(Progress.Resolution{}, 1n+later, True{}) == 1n+Progress.budget_after(Progress.locker_advance(1n+later, Tide.VoyageAdrift{}, True{})) : Nat }

law recovery_voyage_budget:
  { Progress.voyage_remaining(Progress.Salvage{}, 6n, True{}) == 37n : Nat }

law cutting_the_timber_leaves_the_creature_following:
  for since: Nat
  { Encounter.follows(10n+since, Encounter.Cut{}) == True{} : Bool }

law hauling_the_swimmer_leaves_the_creature_following:
  for since: Nat
  { Encounter.follows(10n+since, Encounter.Dive{}) == True{} : Bool }

law prying_breaks_pursuit:
  for since: Nat
  { Encounter.follows(10n+since, Encounter.Pry{}) == False{} : Bool }

law archived_grip_never_starts_pursuit:
  for route: Encounter.Route
  { Encounter.follows(9n, route) == False{} : Bool }

law reef_bell_opens_crossing_alongside_other_routes:
  for since: Nat
  for marked: Bool
  { Encounter.reef_routes(10n+since, Encounter.RaftBell{}, marked, True{}) == Encounter.Routes{False{}, False{}, True{}, marked, False{}, False{}, True{}} : Encounter.Routes }

law reef_bell_in_water_does_not_open_crossing:
  for version: Nat
  for marked: Bool
  { Encounter.reef_routes(version, Encounter.SwimmerBell{}, marked, True{}) == Encounter.Routes{False{}, False{}, True{}, marked, False{}, False{}, False{}} : Encounter.Routes }

law quiet_reef_keeps_the_original_routes:
  for version: Nat
  for ring: Encounter.Ring
  for marked: Bool
  { Encounter.reef_routes(version, ring, marked, False{}) == Encounter.routes(Encounter.Landing{}, version, ring, marked, False{}, False{}) : Encounter.Routes }

law archived_reef_never_opens_echo_crossing:
  { Encounter.reef_echo(True{}, Encounter.RaftBell{}, 9n) == False{} : Bool }

law echo_crossing_costs_one_hull_and_normal_exposure:
  for version: Nat
  for brace: Nat
  for incoming: Nat
  for extra: Nat
  { Encounter.effects(Encounter.EchoCrossing{}, brace, version, incoming, extra) == Encounter.Effects{1n, 0n, 2n, 1n} : Encounter.Effects }

law reef_lure_uses_the_bells_action:
  { Encounter.reef_bell_brace(True{}) == 0n : Nat }

law ordinary_raft_bell_adds_brace:
  { Encounter.reef_bell_brace(False{}) == 3n : Nat }

law five_cold_on_raft_can_recover:
  { Encounter.resolve(Encounter.Effects{0n, 0n, 2n, 1n}, 2n, 1n, 5n, 5n, True{}) == Encounter.Resolution{2n, 3n, 4n, 4n, 1n, Tide.VoyageRescued{}} : Encounter.Resolution }

law safe_swimmer_cannot_save_a_raft_sailor_at_six_cold:
  { Encounter.resolve(Encounter.Effects{0n, 0n, 2n, 1n}, 2n, 1n, 6n, 1n, True{}) == Encounter.Resolution{2n, 3n, 5n, 0n, 1n, Tide.VoyageLost{}} : Encounter.Resolution }

law securing_timber_starts_with_four_hull:
  for since: Nat
  { Opening.salvage(11n+since, Opening.SpareTimber{}) == Opening.Supplies{4n, 1n, 0n} : Opening.Supplies }

law archived_timber_launch_chills_the_crew:
  { Opening.salvage(10n, Opening.SpareTimber{}) == Opening.Supplies{5n, 2n, 0n} : Opening.Supplies }

law canvas_trades_hull_for_warmth:
  for since: Nat
  { Opening.salvage(11n+since, Opening.DryCanvas{}) == Opening.Supplies{3n, 0n, 0n} : Opening.Supplies }

law rations_trade_hull_for_food:
  for since: Nat
  { Opening.salvage(11n+since, Opening.RationLocker{}) == Opening.Supplies{3n, 1n, 1n} : Opening.Supplies }
