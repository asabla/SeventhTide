import Base
import ./Tide.bend as Tide

# The crew has three seats. Each pending seat has a basic action.
type Stage is Data:
  Salvage{}
  Boarding{}
  ThreePlays{}
  TwoPlays{}
  OnePlay{}
  Resolution{}
  Recovery{}

type Action is Data:
  TakeSalvage{}
  TakeLine{}
  CrewAction{}
  TakeHull{}
  KeepHand{}

type Role is Data:
  HelmSeat{}
  CrewSeat{}
  BotSeat{}

type Access is Data:
  Access{direct: Bool, cover: Bool, automatic: Bool}

def can_steer(role: Role) -> Bool:
  match role:
    case HelmSeat{}:
      True{}
    case _:
      False{}

def crew_access(pending: Bool, role: Role, ready: Bool) -> Access:
  match pending role ready:
    case False{} _ _:
      Access{False{}, False{}, False{}}
    case True{} HelmSeat{} _:
      Access{True{}, False{}, False{}}
    case True{} CrewSeat{} _:
      Access{True{}, True{}, False{}}
    case True{} BotSeat{} False{}:
      Access{False{}, False{}, False{}}
    case True{} BotSeat{} True{}:
      Access{False{}, True{}, True{}}

def accepts(stage: Stage, action: Action) -> Bool:
  match stage action:
    case Salvage{} TakeSalvage{}:
      True{}
    case Boarding{} TakeLine{}:
      True{}
    case ThreePlays{} CrewAction{}:
      True{}
    case TwoPlays{} CrewAction{}:
      True{}
    case OnePlay{} CrewAction{}:
      True{}
    case Resolution{} TakeHull{}:
      True{}
    case Recovery{} KeepHand{}:
      True{}
    case _ _:
      False{}

# A witness to a legal move at each active stage.
def fallback(stage: Stage) -> Action:
  match stage:
    case Salvage{}:
      TakeSalvage{}
    case Boarding{}:
      TakeLine{}
    case ThreePlays{}:
      CrewAction{}
    case TwoPlays{}:
      CrewAction{}
    case OnePlay{}:
      CrewAction{}
    case Resolution{}:
      TakeHull{}
    case Recovery{}:
      KeepHand{}

def later_budget(later: Nat) -> Nat:
  match later:
    case 0n:
      0n
    case 1n+rest:
      5n+later_budget(rest)

def remaining(stage: Stage, later: Nat) -> Nat:
  match stage:
    case Salvage{}:
      6n+later_budget(later)
    case Boarding{}:
      5n+later_budget(later)
    case ThreePlays{}:
      4n+later_budget(later)
    case TwoPlays{}:
      3n+later_budget(later)
    case OnePlay{}:
      2n+later_budget(later)
    case Resolution{}:
      1n+later_budget(later)
    case Recovery{}:
      1n+later_budget(later)

def voyage_remaining(stage: Stage, later: Nat, locker_ahead: Bool) -> Nat:
  match locker_ahead:
    case True{}:
      1n+remaining(stage, later)
    case False{}:
      remaining(stage, later)

type Step is Data:
  Continue{stage: Stage, later: Nat}
  Stop{unused: Nat}

def after_tide(later: Nat, verdict: Tide.Outcome) -> Step:
  match later verdict:
    case 1n+rest Tide.VoyageAdrift{}:
      Continue{Boarding{}, rest}
    case _ _:
      Stop{later_budget(later)}

# Resources determine the tide verdict. Turn order is independent of the
# selected supplies, swimmer and cards.
def advance(stage: Stage, later: Nat, verdict: Tide.Outcome) -> Step:
  match stage:
    case Salvage{}:
      Continue{Boarding{}, later}
    case Boarding{}:
      Continue{ThreePlays{}, later}
    case ThreePlays{}:
      Continue{TwoPlays{}, later}
    case TwoPlays{}:
      Continue{OnePlay{}, later}
    case OnePlay{}:
      Continue{Resolution{}, later}
    case Resolution{}:
      after_tide(later, verdict)
    case Recovery{}:
      after_tide(later, verdict)

def locker_advance(later: Nat, verdict: Tide.Outcome, haul: Bool) -> Step:
  match later verdict haul:
    case 1n+rest Tide.VoyageAdrift{} True{}:
      Continue{Recovery{}, 1n+rest}
    case _ _ _:
      after_tide(later, verdict)

def budget_after(step: Step) -> Nat:
  match step:
    case Continue{stage, later}:
      remaining(stage, later)
    case Stop{unused}:
      unused
