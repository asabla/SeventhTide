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

type Action is Data:
  TakeSalvage{}
  TakeLine{}
  CrewAction{}
  TakeHull{}

type Role is Data:
  HostSeat{}
  GuestSeat{}
  BotSeat{}

type Access is Data:
  Access{direct: Bool, cover: Bool, automatic: Bool}

def crew_access(pending: Bool, role: Role, ready: Bool) -> Access:
  match pending role ready:
    case False{} _ _:
      Access{False{}, False{}, False{}}
    case True{} HostSeat{} _:
      Access{True{}, False{}, False{}}
    case True{} GuestSeat{} _:
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

type Step is Data:
  Continue{stage: Stage, later: Nat}
  Stop{unused: Nat}

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
      match later verdict:
        case 1n+rest Tide.VoyageAdrift{}:
          Continue{Boarding{}, rest}
        case _ _:
          Stop{later_budget(later)}

def budget_after(step: Step) -> Nat:
  match step:
    case Continue{stage, later}:
      remaining(stage, later)
    case Stop{unused}:
      unused
