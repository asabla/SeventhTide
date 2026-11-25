import Base
import ./Tide.bend as Tide

type Water is Data:
  OpenWater{}
  SecondWake{}
  BellBuoy{}
  Landing{}
  RaftGrip{}
  DriftingLocker{}

type Ring is Data:
  Silent{}
  SwimmerBell{}
  RaftBell{}

type Route is Data:
  Hull{}
  Dive{}
  Decoy{}
  Chain{}
  Channel{}
  Pry{}
  Cut{}
  HaulLocker{}
  LeaveLocker{}
  EchoCrossing{}

def marks_channel(tide: Nat, line: Bool, swimmer: Bool, marked: Bool) -> Bool:
  match tide line swimmer marked:
    case 6n True{} True{} False{}:
      True{}
    case _ _ _ _:
      False{}

type Routes is Data:
  Routes{decoy: Bool, chain: Bool, dive: Bool, channel: Bool, pry: Bool, haul: Bool, echo: Bool}

def decoy_open(ring: Ring, version: Nat) -> Bool:
  match ring:
    case RaftBell{}:
      match version:
        case 6n+_:
          True{}
        case _:
          False{}
    case Silent{}:
      False{}
    case SwimmerBell{}:
      False{}

type RaftTool is Data:
  SoundingLine{}
  Boathook{}

def sets_tool(tool: RaftTool, swimmer: Bool) -> Bool:
  match tool swimmer:
    case SoundingLine{} True{}:
      True{}
    case Boathook{} False{}:
      True{}
    case _ _:
      False{}

def grip_open(line: Bool, hook: Bool, version: Nat) -> Bool:
  match line hook version:
    case True{} True{} 8n+_:
      True{}
    case _ _ _:
      False{}

def grip_haul_cost(brace: Nat, version: Nat) -> Nat:
  match brace version:
    case 2n+_ 13n+_:
      1n
    case 1n 15n+_:
      1n
    case _ _:
      2n

def towline_cold(version: Nat) -> Nat:
  match version:
    case 14n+_:
      1n
    case _:
      2n

def can_haul(water: Water, version: Nat) -> Bool:
  match water version:
    case DriftingLocker{} 9n+_:
      True{}
    case _ _:
      False{}

def routes(water: Water, version: Nat, ring: Ring, marked: Bool, line: Bool, hook: Bool) -> Routes:
  match water:
    case OpenWater{}:
      Routes{False{}, False{}, True{}, False{}, False{}, False{}, False{}}
    case SecondWake{}:
      Routes{decoy_open(ring, version), False{}, True{}, False{}, False{}, False{}, False{}}
    case BellBuoy{}:
      match version:
        case 7n+_:
          Routes{False{}, True{}, False{}, False{}, False{}, False{}, False{}}
        case _:
          Routes{False{}, False{}, True{}, False{}, False{}, False{}, False{}}
    case Landing{}:
      Routes{False{}, False{}, True{}, marked, False{}, False{}, False{}}
    case RaftGrip{}:
      Routes{False{}, False{}, True{}, False{}, grip_open(line, hook, version), False{}, False{}}
    case DriftingLocker{}:
      Routes{False{}, False{}, False{}, False{}, False{}, can_haul(DriftingLocker{}, version), False{}}

# Only the two fallback outcomes of the earlier grip leave the creature nearby.
def follows(version: Nat, grip: Route) -> Bool:
  match version grip:
    case 10n+_ Cut{}:
      True{}
    case 10n+_ Dive{}:
      True{}
    case _ _:
      False{}

def reef_echo(pursuing: Bool, ring: Ring, version: Nat) -> Bool:
  match pursuing ring version:
    case True{} RaftBell{} 10n+_:
      True{}
    case _ _ _:
      False{}

def reef_bell_brace(luring: Bool) -> Nat:
  match luring:
    case True{}:
      0n
    case False{}:
      3n

def reef_routes(version: Nat, ring: Ring, marked: Bool, pursuing: Bool) -> Routes:
  Routes{False{}, False{}, True{}, marked, False{}, False{}, reef_echo(pursuing, ring, version)}

def allowed(route: Route, plan: Routes) -> Bool:
  match route plan:
    case Hull{} _:
      True{}
    case Dive{} Routes{_, _, dive, _, _, _, _}:
      dive
    case Decoy{} Routes{decoy, _, _, _, _, _, _}:
      decoy
    case Chain{} Routes{_, chain, _, _, _, _, _}:
      chain
    case Channel{} Routes{_, _, _, channel, _, _, _}:
      channel
    case Pry{} Routes{_, _, _, _, pry, _, _}:
      pry
    case Cut{} _:
      True{}
    case LeaveLocker{} _:
      True{}
    case HaulLocker{} Routes{_, _, _, _, _, haul, _}:
      haul
    case EchoCrossing{} Routes{_, _, _, _, _, _, echo}:
      echo

type Effects is Data:
  Effects{damage: Nat, extra_cold: Nat, exposure: Nat, rations: Nat}

def effects(route: Route, brace: Nat, version: Nat, incoming: Nat, dive_cold: Nat) -> Effects:
  match route:
    case Hull{}:
      Effects{Nat.sub(incoming, brace), 0n, 2n, 1n}
    case Dive{}:
      Effects{0n, dive_cold, 2n, 1n}
    case Decoy{}:
      Effects{0n, 0n, 1n, 1n}
    case Chain{}:
      match brace version:
        case 0n 17n+_:
          Effects{0n, 1n, 2n, 1n}
        case 0n _:
          Effects{0n, 2n, 2n, 1n}
        case 1n+_ 12n+_:
          Effects{0n, 1n, 2n, 3n}
        case 1n+_ _:
          Effects{0n, 1n, 2n, 2n}
    case Channel{}:
      Effects{0n, 0n, 2n, 1n}
    case Pry{}:
      Effects{0n, 0n, 2n, 1n}
    case Cut{}:
      match version:
        case 16n+_:
          Effects{2n, 0n, 2n, 1n}
        case _:
          Effects{1n, 0n, 2n, 1n}
    case HaulLocker{}:
      Effects{0n, 1n, 2n, 1n}
    case LeaveLocker{}:
      Effects{0n, 0n, 2n, 1n}
    case EchoCrossing{}:
      Effects{1n, 0n, 2n, 1n}

type Resolution is Data:
  Resolution{hull: Nat, swim_cold: Nat, first_cold: Nat, second_cold: Nat, rations: Nat, outcome: Tide.Outcome}

def fatal(cold: Nat) -> Bool:
  match cold:
    case 5n+_:
      True{}
    case _:
      False{}

def resolve(effect: Effects, hull: Nat, swim: Nat, first: Nat, second: Nat, last: Bool) -> Resolution:
  match effect:
    case Effects{damage, extra_cold, exposure, rations}:
      +h = Nat.sub(hull, damage)
      +swimmer = Nat.add(Nat.add(extra_cold, exposure), swim)
      +left = Nat.sub(first, 1n)
      +right = Nat.sub(second, 1n)
      exposed = Bool.or(fatal(swimmer), Bool.or(fatal(left), fatal(right)))
      Resolution{h, swimmer, left, right, rations, Tide.finish(h, exposed, last)}
