import Base

type SalvageChoice is Data:
  DryCanvas{}
  RationLocker{}
  SpareTimber{}

type Supplies is Data:
  Supplies{hull: Nat, cold_per_sailor: Nat, ration_per_sailor: Nat}

def salvage(version: Nat, choice: SalvageChoice) -> Supplies:
  match version choice:
    case _ DryCanvas{}:
      Supplies{3n, 0n, 0n}
    case _ RationLocker{}:
      Supplies{3n, 1n, 1n}
    case 11n+_ SpareTimber{}:
      Supplies{4n, 1n, 0n}
    case _ SpareTimber{}:
      Supplies{5n, 2n, 0n}
