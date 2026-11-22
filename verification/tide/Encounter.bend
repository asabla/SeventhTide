import Base
import ./Tide.bend as Tide

type Water is Data:
  OpenWater{}
  SecondWake{}
  BellBuoy{}
  Landing{}

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

type Routes is Data:
  Routes{decoy: Bool, chain: Bool, dive: Bool, channel: Bool}

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

def routes(water: Water, version: Nat, ring: Ring, marked: Bool) -> Routes:
  match water:
    case OpenWater{}:
      Routes{False{}, False{}, True{}, False{}}
    case SecondWake{}:
      Routes{decoy_open(ring, version), False{}, True{}, False{}}
    case BellBuoy{}:
      match version:
        case 7n+_:
          Routes{False{}, True{}, False{}, False{}}
        case _:
          Routes{False{}, False{}, True{}, False{}}
    case Landing{}:
      Routes{False{}, False{}, True{}, marked}

def allowed(route: Route, plan: Routes) -> Bool:
  match route plan:
    case Hull{} _:
      True{}
    case Dive{} Routes{_, _, dive, _}:
      dive
    case Decoy{} Routes{decoy, _, _, _}:
      decoy
    case Chain{} Routes{_, chain, _, _}:
      chain
    case Channel{} Routes{_, _, _, channel}:
      channel

type Effects is Data:
  Effects{damage: Nat, extra_cold: Nat, exposure: Nat, rations: Nat}

def effects(route: Route, brace: Nat, incoming: Nat, dive_cold: Nat) -> Effects:
  match route:
    case Hull{}:
      Effects{Nat.sub(incoming, brace), 0n, 2n, 1n}
    case Dive{}:
      Effects{0n, dive_cold, 2n, 1n}
    case Decoy{}:
      Effects{0n, 0n, 1n, 1n}
    case Chain{}:
      match brace:
        case 0n:
          Effects{0n, 2n, 2n, 1n}
        case 1n+_:
          Effects{0n, 1n, 2n, 2n}
    case Channel{}:
      Effects{0n, 0n, 2n, 1n}

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
