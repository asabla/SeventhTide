import Base
import ./Tide.bend as Tide

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
