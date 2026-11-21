import Base

type Outcome is Data:
  VoyageLost{}
  VoyageAdrift{}
  VoyageRescued{}

def finish(hull: Nat, exposed: Bool, last: Bool) -> Outcome:
  match hull:
    case 0n: VoyageLost{}
    case 1n+p:
      match exposed:
        case True{}: VoyageLost{}
        case False{}:
          match last:
            case True{}: VoyageRescued{}
            case False{}: VoyageAdrift{}
