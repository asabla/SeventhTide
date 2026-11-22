export const unmarked = {
  seed: 2415085369,
  history: [
    "spar",
    "swim-0 float-0 line-1 patch-2 dive",
    "swim-1 feed-0-1 float-1 patch-2 hull",
    "swim-1 hook-0 feed-1-1 lash-2 hull",
    "swim-1 wrap-0-1 hook-1 lash-2 hull",
    "swim-0 float-0 feed-1-2 lash-2 dive",
    "swim-0 feed-0-0 feed-1-0 lash-2 hull",
  ]
    .join(" ")
    .split(" "),
  plays: ["swim-0", "feed-0-2", "bell-1", "lash-2"],
};

export const marked = {
  seed: 3428989595,
  history: [
    "spar",
    "swim-0 float-0 hook-1 belt-2 dive",
    "swim-2 feed-0-2 patch-1 iron-2 hull",
    "swim-0 float-0 patch-1 line-2 dive",
    "swim-1 feed-0-1 patch-1 lantern-2 hull",
    "swim-2 hook-0 feed-1-0 feed-2-2 hull",
    "swim-1 anchor-0 line-1 feed-2-1 hull",
  ]
    .join(" ")
    .split(" "),
  plays: ["swim-0", "float-0", "bell-1", "lash-2"],
};

export const hauled = {
  seed: 1514186459,
  history: [
    "canvas",
    "swim-0 lantern-0 cask-1 anchor-2 hull",
    "swim-1 feed-0-1 feed-1-2 lash-2 dive",
    "swim-2 feed-0-2 wrap-1-2 line-2 hull",
    "swim-0 iron-0 feed-1-2 lash-2 hull",
    "swim-1 net-0 glass-1 feed-2-2 hull",
    "swim-0 float-0 belt-1 lash-2 dive",
  ]
    .join(" ")
    .split(" "),
};

export const pried = {
  seed: 2049389901,
  history: [
    "spar",
    "swim-0 wrap-0 lash-1 mitts-2 hull",
    "swim-2 cask-0 block-1 feed-2-1 dive",
    "swim-0 anchor-0 patch-1 feed-2-2 hull",
    "swim-2 bell-0 comb-1 line-2 decoy",
    "swim-1 feed-0-1 line-1 hook-2 pry",
    "swim-0 feed-0-0 glass-1 kettle-2 hull",
  ]
    .join(" ")
    .split(" "),
};
