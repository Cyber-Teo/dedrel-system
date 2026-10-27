/**
 * Declarative config of the Dedrel magic system (the Spell Constructor).
 * The single source of truth for the rule tables: Techniques, Modifiers,
 * Doctrine Rank limits and Doctrine properties (affinities/restrictions/paths).
 *
 * Rules canon: "_rules/16. Magic.md". Registered as CONFIG.DEDREL.magic
 * in dedrel.mjs. Balance edits are made here and in the Conditions compendium
 * (the conditions of doctrinal Modifiers are pulled by key at cast time).
 *
 * All label/text fields are localization keys (ru.json / en.json).
 * All distances are DIRECTLY in scene meters (the rules were converted to meters, 2026-07).
 */
export const DEDREL_MAGIC = {

  /**
   * Damage Ladder (extended, steps II–VII; canon — "_rules/13. Weapons.md").
   * Weapons are limited to step V; steps VI–VII are magic only.
   * The rank of the "damage" Modifier sets the step (ranks[N].step), a doctrine can
   * shift it (Pyromancy's ladderShift), an Abundant Source adds +1.
   * The shift doesn't go above VII (clamped in the compiler).
   */
  damageLadder: {
    2: "2d4",
    3: "2d6",
    4: "2d8",
    5: "3d6",
    6: "3d8",
    7: "4d8"
  },

  /**
   * Limits by Doctrine Rank.
   * maxModCost — the maximum cost of a single Modifier in AP.
   * Rank 6 is a placeholder for future ultimate magic (there's no 6 AP content yet).
   */
  rankLimits: {
    1: { techniques: 1, modifiers: 2, maxModCost: 1 },
    2: { techniques: 2, modifiers: 2, maxModCost: 2 },
    3: { techniques: 3, modifiers: 3, maxModCost: 3 },
    4: { techniques: 4, modifiers: 4, maxModCost: 4 },
    5: { techniques: 5, modifiers: 5, maxModCost: 5 },
    6: { techniques: 5, modifiers: 5, maxModCost: 6 }
  },

  /**
   * Cost of buying a Doctrine Rank with XP (the experience page, the upgradeDoctrine action).
   * Index = the current DERIVED rank (0→1 costs rankXpCosts[0], etc.).
   * The 0→1 step is usually unused: access talents give rank 1 right away.
   */
  rankXpCosts: [2, 2, 4, 8, 16, 32],

  /**
   * Magic Techniques. Bought once with XP like talents
   * (the talent carries an AE: system.magic.techniques.<key> | Override | 1).
   * requiresSource — the technique is available only at Source Scale "any"/"abundant"
   * (for doctrines with ignoresSource the check is lifted).
   */
  techniques: {
    create:    { ap: 2, label: "DEDREL.Magic.Techniques.create" },
    move:      { ap: 1, label: "DEDREL.Magic.Techniques.move", requiresSource: true },
    transform: { ap: 1, label: "DEDREL.Magic.Techniques.transform" },
    sense:     { ap: 1, label: "DEDREL.Magic.Techniques.sense" },
    imbue:     { ap: 1, label: "DEDREL.Magic.Techniques.imbue" }
  },

  /**
   * Source Scales.
   * - none: the create technique is mandatory.
   * - any: the move technique is available (instead of create).
   * - abundant: like any + LIFTS the maxModCost limit (opens modifiers
   *   up to rank 5 to any caster; the AP pool is the limiter) + raises the spell's
   *   damage one Ladder step (damageStepBonus, cap VII).
   * The source level per doctrine is set by the GM with a scene flag
   * scene.flags.dedrel.sourceScale (the Scene Sources widget in the left column).
   * Doctrines with ignoresSource (Biomancy, later Electromancy) ignore the Source
   * concept entirely.
   */
  sourceScales: {
    none:     { label: "DEDREL.Magic.SourceScales.none" },
    any:      { label: "DEDREL.Magic.SourceScales.any" },
    abundant: { label: "DEDREL.Magic.SourceScales.abundant", unlocksRank5: true, ignoresMaxModCost: true, damageStepBonus: 1 }
  },

  /**
   * Source level on a scene the GM hasn't configured.
   * Air and earth are almost everywhere — their absence is a rare exception
   * (an airless dungeon, a platform over an abyss), hence the default "any".
   * Doctrines without an entry count as "none": fire, water and darkness in the scene must
   * appear deliberately. The key is read ONLY through utils/magic-source.mjs.
   */
  defaultSourceScales: {
    ventomancy: "any",
    geomancy:   "any"
  },

  /**
   * Magic Modifiers.
   * category: scale | intensity | complexity.
   * ranks: 1..5; a missing rank = unavailable (e.g. areas have no rank 1).
   * exclusiveWith: mutually exclusive modifiers (Areas ↔ Targets, Areas among themselves).
   *
   * doctrinal: true — a DOCTRINAL modifier: not part of the shared catalog, available
   *   only to the doctrine/path that declared it in its modifiers: [...] list.
   *   Save DC of doctrinal modifiers = 8 + 2 × rank.
   * requiresTechnique: "<key>" — the modifier is legal only together with the technique.
   * requiresArea: true — requires an Area Modifier in the build.
   * requiresForms: true — available only to a doctrine/path with a non-empty forms list.
   *
   * Fields inside ranks are the compilation "output" (spell-calculator):
   *   meters/lengthMeters/radiusMeters/targets → target_range / target_value / template_size
   *   step                → Damage Ladder step → formula_damage
   *   heal                → formula_heal
   *   hp                  → durability of the created object
   *   rounds/special      → effect duration
   *   attackBonus         → system.attack_bonus
   *   forbidDefense       → system.forbidden_defense ("block"/"dodge")
   *   saveDc/penalty/bonus/conditions → the doctrinal modifier's effect
   *   pushMeters          → forced movement (a text fact on the card)
   *   imbueValue          → the Imbuement amount (an effect under the "Apply" button)
   *   hintFact: true      → the RankHints line goes into the spell description
   */
  modifiers: {
    // --- Scale ---
    range: {
      category: "scale",
      label: "DEDREL.Magic.Modifiers.range",
      ranks: {
        1: { touch: true, meters: 2 },
        2: { meters: 10 },
        3: { meters: 20 },
        4: { meters: 40 },
        5: { meters: 60 }
      }
    },
    // Without the Modifier — a single target (the default, rank 1 was removed from the rules).
    targets: {
      category: "scale",
      label: "DEDREL.Magic.Modifiers.targets",
      exclusiveWith: ["area_cone", "area_circle", "area_line"],
      ranks: {
        2: { targets: 2 },
        3: { targets: 3 },
        4: { targets: 4 },
        5: { targets: 5 }
      }
    },
    // A cone is always cast from the caster's square; Range doesn't apply.
    // priceDelta: Areas cost Rank+1 AP (balance 2026-07-16: so that Targets have
    // a niche); the maxModCost limit and the rank 5 gate are computed by RANK, not by price.
    area_cone: {
      category: "scale",
      label: "DEDREL.Magic.Modifiers.area_cone",
      template: "cone",
      noRange: true,
      priceDelta: 1,
      exclusiveWith: ["targets", "area_circle", "area_line"],
      ranks: {
        2: { lengthMeters: 4 },
        3: { lengthMeters: 8 },
        4: { lengthMeters: 12 },
        5: { lengthMeters: 16 }
      }
    },
    area_circle: {
      category: "scale",
      label: "DEDREL.Magic.Modifiers.area_circle",
      template: "circle",
      priceDelta: 1,
      exclusiveWith: ["targets", "area_cone", "area_line"],
      ranks: {
        2: { radiusMeters: 2 },
        3: { radiusMeters: 4 },
        4: { radiusMeters: 6 },
        5: { radiusMeters: 8 }
      }
    },
    area_line: {
      category: "scale",
      label: "DEDREL.Magic.Modifiers.area_line",
      template: "ray",
      priceDelta: 1,
      exclusiveWith: ["targets", "area_cone", "area_circle"],
      ranks: {
        1: { lengthMeters: 8 },
        2: { lengthMeters: 12 },
        3: { lengthMeters: 16 },
        4: { lengthMeters: 20 },
        5: { lengthMeters: 24 }
      }
    },

    // --- Intensity ---
    // Damage on the Ladder: rank = step II–VI; Pyromancy shifts it by +1 (III–VII),
    // an Abundant Source gives another +1 (cap VII). Formula — damageLadder[step].
    damage: {
      category: "intensity",
      label: "DEDREL.Magic.Modifiers.damage",
      ranks: {
        1: { step: 2 },
        2: { step: 3 },
        3: { step: 4 },
        4: { step: 5 },
        5: { step: 6 }
      }
    },
    durability: {
      category: "intensity",
      label: "DEDREL.Magic.Modifiers.durability",
      ranks: {
        1: { hp: 5 },
        2: { hp: 10 },
        3: { hp: 15 },
        4: { hp: 20 },
        5: { hp: 25 }
      }
    },
    // Imbuement: the numeric power of the property infused by the imbue technique
    // (the property itself must derive from the element — "Free-effect frame",
    // 16. Magic.md §5). Ranks 1–3: choice by option (skill/defense, weapon damage, DR);
    // rank 4: +1 Ladder step to the weapon (v1 — as text). Without Duration — 1 round.
    // The "no stacking" rule is social in v1.
    imbuement: {
      category: "intensity",
      label: "DEDREL.Magic.Modifiers.imbuement",
      requiresTechnique: "imbue",
      ranks: {
        1: { imbueValue: 1, imbueChoice: ["skill", "weapon", "dr"] },
        2: { imbueValue: 2, imbueChoice: ["skill", "weapon", "dr"] },
        3: { imbueValue: 3, imbueChoice: ["skill", "weapon", "dr"] },
        4: { imbueLadderStep: true, hintFact: true }
      }
    },

    // --- Doctrinal modifiers (intensity; owners — see doctrines.*.modifiers) ---
    // Power: a suppression catalog. Shadowmancy — in full; the Path of the Echo — ranks 1–3
    // (Psychoacoustics). There are no bonus branches anymore: only a penalty OR a condition.
    // durationMode: "instant" (the next roll) | "rounds:1" | "doctrineRank".
    // The list contents at each rank are set ONLY by the conditions arrays below —
    // this is the rules canon (16. Magic.md §4). The magic_conditions compendium
    // (conditionsFromPack; a curated pool, see dedrel.mjs CONDITION_PACKS)
    // only substitutes the names/versions of conditions already listed: the selector
    // intersects the pack with the rank's array, so the pack's contents can
    // neither extend the list nor remove the rank gate.
    power: {
      category: "intensity",
      doctrinal: true,
      label: "DEDREL.Magic.Modifiers.power",
      conditionsFromPack: "dedrel.magic_conditions",
      ranks: {
        1: { saveDc: 10, penalty: 1, durationMode: "instant" },
        2: { saveDc: 12, penalty: 2, durationMode: "rounds:1" },
        3: { saveDc: 14, penalty: 2, durationMode: "doctrineRank",
             conditions: ["disoriented", "blind", "fear"] },
        // Edit 2026-09-10: removed keys without condition items — `rage`
        // (a talent/mutation condition, see 17. Conditions) and `poisoned`
        // (there will be no general "Poisoned": each poison is its own condition,
        // craft/Armor Rework Plan.md §8). Slot 4 in the list was taken by `withering`.
        4: { saveDc: 16, penalty: 3, durationMode: "doctrineRank",
             conditions: ["suffocating", "pain", "partial_paralysis", "burning", "bleeding", "withering"] },
        5: { saveDc: 18, durationMode: "rounds:1",
             conditions: ["fatigued", "stunned", "knockout", "terror", "full_paralysis"] }
      }
    },
    // "Inspiration" was removed 2026-09-15: it duplicated Imbuement, whose curve
    // is both longer (scales with Duration) and fuller (ranks 1-4). The Echo's party
    // buffs are now = Imbue + Imbuement + Duration with the Path discount.

    // Constraint (Path of Ice): the ice holds in place.
    constrain: {
      category: "intensity",
      doctrinal: true,
      label: "DEDREL.Magic.Modifiers.constrain",
      ranks: {
        2: { saveDc: 12, durationMode: "doctrineRank", hintFact: true }, // slow −50%
        3: { saveDc: 14, durationMode: "rounds:1", conditions: ["entangled"] },
        5: { saveDc: 18, durationMode: "rounds:1", conditions: ["full_paralysis"] }
      }
    },
    // Knockdown (Ventomancy and the Path of the Flow): a gust of wind/a wave knocks off the feet.
    knockdown: {
      category: "intensity",
      doctrinal: true,
      label: "DEDREL.Magic.Modifiers.knockdown",
      ranks: {
        2: { saveDc: 12, durationMode: "instant", conditions: ["prone"] },
        3: { saveDc: 14, durationMode: "instant", conditions: ["prone"], pushMeters: 4, hintFact: true }
      }
    },
    // Dust Veil (Ventomancy): a zone of vision interference. Requires an Area;
    // v1 — text on the card, mechanizing the zone through a region is postponed (NOTES).
    dust_veil: {
      category: "intensity",
      doctrinal: true,
      label: "DEDREL.Magic.Modifiers.dust_veil",
      requiresArea: true,
      ranks: {
        2: { hintFact: true }
      }
    },
    // Choke (Ventomancy): a vacuum — the air leaves the target's lungs.
    choke: {
      category: "intensity",
      doctrinal: true,
      label: "DEDREL.Magic.Modifiers.choke",
      ranks: {
        4: { saveDc: 16, durationMode: "doctrineRank", conditions: ["suffocating"] }
      }
    },
    // Healing (Biomancy): a mirror of the Damage Ladder, the formula_heal pipeline is ready
    // (the "Heal" button on the chat card).
    heal: {
      category: "intensity",
      doctrinal: true,
      label: "DEDREL.Magic.Modifiers.heal",
      exclusiveWith: ["damage"],
      ranks: {
        1: { heal: "2d4" },
        2: { heal: "2d6" },
        3: { heal: "2d8" },
        4: { heal: "3d6" },
        5: { heal: "3d8" }
      }
    },
    // Adaptation (Biomancy): a temporary bodily trait. Two lists (decision
    // 2026-09-10): for a willing target — an adaptation from `biomancy_adaptations`,
    // for an unwilling one — a mutilation from `mutilations` with a saving throw. Both packs contain
    // items of type condition, so the trait supports duration, enters
    // the status registry (dedrel.mjs CONDITION_PACKS) and is applied by the card's
    // button — the same mechanism as the Power conditions.
    // The item's rank is `flags.dedrel.rank`; the selector shows only items
    // of a rank equal to the Modifier's rank. There are no mutation copies here: bloodlines
    // don't matter to the biomancer, they sculpt flesh rather than inherit it.
    adapt: {
      category: "intensity",
      doctrinal: true,
      label: "DEDREL.Magic.Modifiers.adapt",
      optionsFromPack: ["dedrel.biomancy_adaptations", "dedrel.mutilations"],
      ranks: {
        1: { saveDc: 10, durationMode: "doctrineRank", hintFact: true },
        2: { saveDc: 12, durationMode: "doctrineRank", hintFact: true },
        3: { saveDc: 14, durationMode: "doctrineRank", hintFact: true },
        4: { saveDc: 16, durationMode: "doctrineRank", hintFact: true },
        5: { saveDc: 18, durationMode: "doctrineRank", hintFact: true }
      }
    },

    // --- Complexity ---
    // Without the Modifier the effect is instant (the default, rank 1 was removed from the rules).
    duration: {
      category: "complexity",
      label: "DEDREL.Magic.Modifiers.duration",
      ranks: {
        2: { rounds: 6 },
        3: { rounds: 10 },
        4: { special: "concentration" }, // until the player cancels it; losing consciousness breaks it
        5: { special: "day" }            // until there's a calendar — a reminder, removed by hand
      }
    },
    accuracy: {
      category: "complexity",
      label: "DEDREL.Magic.Modifiers.accuracy",
      ranks: {
        1: { attackBonus: 1 },
        2: { attackBonus: 2 },
        3: { attackBonus: 3 },
        4: { attackBonus: 4 },
        5: { attackBonus: 5 }
      }
    },
    // Form: doctrinal binding (rework 2026-07-13). A flat cost of 2 AP,
    // the list of available physical types is the doctrine's/path's forms (the path overrides).
    // The specific form is chosen by option (a selector in the UI). "Complex form" was removed.
    form: {
      category: "complexity",
      label: "DEDREL.Magic.Modifiers.form",
      requiresForms: true,
      textRanks: true,
      ranks: {
        2: { formChoice: true }
      }
    },
    // If not selected — a regular action (action).
    actionType: {
      category: "complexity",
      label: "DEDREL.Magic.Modifiers.actionType",
      textRanks: true,
      ranks: {
        1: { chain: true },    // Chain: you can act right after this spell
        2: { reaction: true }  // Reaction: cast outside your turn with AP saved from the previous turn
      }
    },
    // Forbid Defense: the target loses the chosen means of defense against this
    // spell (compiled into system.forbidden_defense, like the Feint maneuver).
    // A single rank 4 (canon: _rules/16. Magic.md) — gated by doctrine rank
    // via maxModCost; block/dodge is chosen by option.
    forbidDefense: {
      category: "complexity",
      label: "DEDREL.Magic.Modifiers.forbidDefense",
      textRanks: true,
      ranks: {
        4: { forbidDefenseChoice: ["block", "dodge"] }
      }
    }
  },

  /**
   * Doctrine groups (for the experience page and UI headings).
   * The full list of 18 keys — canon in "_rules/16. Magic.md".
   */
  doctrineGroups: {
    matter:    ["geomancy", "hydromancy", "pyromancy", "ventomancy"],
    essence:   ["biomancy", "shadowmancy", "aetheromancy"],
    boundless: ["electromancy", "temporalmancy", "astralomancy", "aether_song"],
    innate:    ["blood_magic", "chaos_magic", "shapeshifting", "feral_magic"],
    psionics:  ["telekinesis", "telepathy", "zero"]
  },

  /**
   * Doctrine config for the Constructor. A doctrine without an entry here is visible on the
   * experience page but does NOT appear in the Constructor (linear doctrines — Aetheromancy,
   * Telepathy, Blood Magic — live on fixed spells, guide §5).
   *
   * Affinity/restriction format: { target, delta } — a delta to the cost in AP.
   *   target: "mod:<modifier key>" | "tech:<technique key>"
   * The component's final cost is clamped from below at zero (Math.max(0, ...)).
   * forbidden: true — the component is unavailable; maxRank/allowedRanks — the rank cap.
   *
   * Other doctrine fields:
   *   ladderShift: N        — Damage Ladder step shift (Pyromancy: +1).
   *   ignoresSource: true   — the Source concept doesn't apply (Biomancy):
   *                           the selector is hidden, move is always available, rank 5 of the modifiers
   *                           is unlocked by Doctrine Rank 5 (via the regular maxModCost).
   *   forms: [...]          — available physical damage forms (the form Modifier);
   *                           a path overrides the list entirely.
   *   modifiers: [...]      — doctrinal Modifiers the doctrine owns;
   *                           a path's list is ADDED to the doctrine's list.
   *   paths: {...}          — specializations; access is bought with a talent
   *                           (AE: system.doctrines.<key>.paths.<path> | Override | 1),
   *                           a build without a path is always legal.
   */
  doctrines: {
    pyromancy: {
      label: "DEDREL.Magic.Doctrines.pyromancy",
      baseDamageType: "heat",
      // Incineration: Ladder steps III–VII — one step above all other doctrines
      ladderShift: 1,
      affinity:    [{ target: "mod:damage", delta: -1 }],
      restriction: [{ target: "mod:accuracy", delta: 1 }],
      // No forms: Pyromancy burns with pure heat (the form modifier is unavailable)
      forms: [],
      // Ignite is the default: a damaging spell sets the target on fire (the burning condition);
      // v1 — an "Apply: Burning" button on the card (auto-application is an open balance question)
      unique: { ignite: "burning" }
    },

    geomancy: {
      label: "DEDREL.Magic.Doctrines.geomancy",
      baseDamageType: "",
      affinity: [
        { target: "mod:duration", delta: -1 },
        { target: "mod:durability", delta: -1 },
        { target: "tech:imbue", delta: -1 }
      ],
      restriction: [
        { target: "mod:range", delta: 1 },
        { target: "mod:area_cone", delta: 1 },
        { target: "mod:area_circle", delta: 1 }
      ],
      forms: ["bludgeoning"],
      // Territory Control: created effects (walls, pits) raise the Source
      // Scale for geomancy. v1 — the GM raises the source level by hand.
      unique: { territoryControl: true }
    },

    hydromancy: {
      label: "DEDREL.Magic.Doctrines.hydromancy",
      baseDamageType: "",
      forms: ["bludgeoning", "slashing"],
      // No affinities/restrictions by default — everything is in the paths
      paths: {
        flow: {
          label: "DEDREL.Magic.Paths.flow",
          affinity: [
            { target: "mod:area_circle", delta: -1 },
            { target: "tech:move", delta: -1 }
          ],
          caps: [{ target: "mod:durability", maxRank: 2 }], // water doesn't hold a shape
          modifiers: ["knockdown"]
        },
        ice: {
          label: "DEDREL.Magic.Paths.ice",
          affinity: [
            { target: "mod:durability", delta: -1 },
            { target: "mod:form", delta: -1 }
          ],
          forms: ["piercing"], // icicles, ice blades (overrides the water forms)
          modifiers: ["constrain"]
        }
      }
    },

    ventomancy: {
      label: "DEDREL.Magic.Doctrines.ventomancy",
      baseDamageType: "",
      // Wind and sound strike an area and the senses, not with a point: direct damage
      // isn't their job. There's no tax on Durability because the doctrine doesn't
      // touch it at all — air doesn't hold a shape and doesn't create constructs.
      restriction: [
        { target: "mod:damage", delta: 1 },
        { target: "mod:accuracy", delta: 1 }
      ],
      forms: ["slashing"],
      // Doctrinal modifiers are available to any ventomancer (the paths inherit them)
      modifiers: ["knockdown", "dust_veil", "choke"],
      paths: {
        squall: {
          label: "DEDREL.Magic.Paths.squall",
          affinity: [
            { target: "mod:area_cone", delta: -1 },
            { target: "mod:area_circle", delta: -1 }
          ]
        },
        echo: {
          label: "DEDREL.Magic.Paths.echo",
          // The Echo's focus is conceptually a musical instrument. There's no separate
          // check: a focus (a weapon of type "magic") is mandatory for ANY magic.
          // Duration is the niche of the Echo's party buffs (the Long Song): the bard
          // imbues an ally with sound for 6-10 rounds cheaper than other doctrines.
          // The discount doesn't affect Power: its duration is set by the rank (durationMode).
          affinity: [
            { target: "mod:power", delta: -1 },
            { target: "mod:targets", delta: -1 },
            { target: "mod:duration", delta: -1 }
          ],
          // Psychoacoustics: Power at ranks 1–3 (the full catalog belongs to Shadowmancy),
          // imbue applies to creatures.
          modifiers: ["power"],
          caps: [{ target: "mod:power", allowedRanks: [1, 2, 3] }],
          // Sonic damage: the regular Ladder II–VI, type sonic (DR against it is extremely rare)
          special: { psychoacoustics: true, damageType: "sonic" }
        }
      }
    },

    // Telekinesis was REMOVED from the Constructor (decision 2026-07-16): the doctrine will be
    // broken down into fixed spells/maneuvers (roadmap §3.1).

    // --- Essence ---
    shadowmancy: {
      label: "DEDREL.Magic.Doctrines.shadowmancy",
      baseDamageType: "necrotic",
      // Curses linger: a discount on Duration; damage comes with a penalty (the debuffer niche).
      // Areas are closed entirely (hotfix 2026-07-16): Shadow strikes targeted.
      affinity:    [{ target: "mod:duration", delta: -1 }],
      restriction: [
        { target: "mod:damage", delta: 1 },
        { target: "mod:area_cone", forbidden: true },
        { target: "mod:area_circle", forbidden: true },
        { target: "mod:area_line", forbidden: true }
      ],
      forms: [],
      // The full Power catalog belongs to Shadowmancy (the Echo — ranks 1–3 only)
      modifiers: ["power"],
      // TODO (roadmap §3.2): modifierOverrides — Durability → undead HP,
      // Form → undead type/guise ("Raising"); waits for the spawn mechanics.
      // The Source (corpses and darkness) is raised by the GM with the Scene Sources macro.
      unique: {}
    },

    biomancy: {
      label: "DEDREL.Magic.Doctrines.biomancy",
      baseDamageType: "",
      // The living body is the source
      ignoresSource: true,
      // The doctrine's constitution: direct damage is forbidden entirely (approved 2026-07-13).
      // Areas are closed entirely (hotfix 2026-07-16): Bio works targeted.
      restriction: [
        { target: "mod:damage", forbidden: true },
        { target: "mod:area_cone", forbidden: true },
        { target: "mod:area_circle", forbidden: true },
        { target: "mod:area_line", forbidden: true },
        // Biomancy doesn't create flesh out of nothing — it reshapes what is already alive
        // (the same reasoning as ignoresSource: the body is the source).
        // What remains: Move, Transform, Sense (looking for traces of sculpting),
        // Infuse. Form is unavailable anyway — the doctrine has an empty forms list.
        { target: "tech:create", forbidden: true }
      ],
      forms: [],
      // Healing is the only direct one in the system; Adaptation — temporary mutations
      modifiers: ["heal", "adapt"],
      // Biomancy is contact-based: it works by hand, up close (rules §7.1 "Touch").
      // Without a Path the palette is trimmed: Healing and Adaptation only at ranks 1-3 —
      // a Path lifts its cap (the path's caps are merged ON TOP of the doctrine's caps).
      caps: [
        { target: "mod:range", maxRank: 2 },
        { target: "mod:heal", maxRank: 3 },
        { target: "mod:adapt", maxRank: 3 }
      ],
      // Paths (rules 2026-09-11): Mending works WITH the body template, Sculpting AGAINST
      // it. Hence the whole difference: Mending is instant and reaches through the ranks,
      // Sculpting requires touch, hours and donor tissue (divergence step 2,
      // `flags.dedrel.divergence` on the adaptation items).
      paths: {
        mending: {
          label: "DEDREL.Magic.Paths.mending",
          affinity: [
            { target: "mod:heal", delta: -1 },
            { target: "mod:targets", delta: -1 }
          ],
          // Lifts the Healing cap; Adaptation and range remain doctrinal
          caps: [{ target: "mod:heal", maxRank: 5 }]
          // TODO (roadmap §3.3 item 5): the doctrinal modifier `mend` — removing
          // physical conditions. Requires a new output in compile().
        },
        sculpting: {
          label: "DEDREL.Magic.Paths.sculpting",
          affinity: [
            { target: "mod:adapt", delta: -1 },
            { target: "mod:duration", delta: -1 }
          ],
          // Lifts the Adaptation cap, but shrinks the range to touch
          caps: [
            { target: "mod:adapt", maxRank: 5 },
            { target: "mod:range", maxRank: 1 }
          ],
          // A monopoly on Sculpting long casts (`_rules/16.1 Rituals.md`);
          // the long casts themselves are fixed spells with is_fixed, not a build
          special: { longCast: true }
        }
      }
    }
  }
};
