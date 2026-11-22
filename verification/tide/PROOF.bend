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

def Laws.echo_shelters_swimmer(brace, incoming, dive_cold):
  {==}

def Laws.buoy_routes(since, ring, marked):
  {==}

def Laws.legacy_buoy_keeps_routes(ring, marked):
  {==}

def Laws.buoy_braced_chain(brace, incoming, dive_cold):
  {==}

def Laws.buoy_false_bell(incoming, dive_cold):
  {==}

def Laws.hull_route_always_available(plan):
  {==}

def Laws.fatal_cold(excess):
  {==}

def Laws.four_cold_is_safe():
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

def Laws.host_can_play(ready):
  {==}

def Laws.guest_can_play_or_be_covered(ready):
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
