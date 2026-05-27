// 22m drop-out tuning. The defending team drop-kicks from their own 22 after
// a missed penalty kick at goal (new World Rugby restart rule). Same outcome
// family as a kick-off (KickOffResult), but shorter average distance and
// no strategy choice — single fixed kick model.

export const DROP_OUT_VALUES = {
  goodKickThreshold:     35,
  catchKnockOnThreshold: 30,
  // Drop-kicks travel a touch shorter than kick-offs: 25-40m on a good strike,
  // 12-22m if shanked. A kick that fails to clear the 22m line (i.e. < 22m)
  // returns 'poor_kick' — modelled here as the `autoPoorIfUnder` floor on the
  // raw distance roll.
  distance:              { good: [25, 40], poor: [12, 22], autoPoorIfUnder: 22 },
} as const;
