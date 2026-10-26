# Dedrel — game system for Foundry VTT

[Русская версия](README.ru.md) · [Website (EN)](https://dedrel.teo.uy/en/) · [Сайт (RU)](https://dedrel.teo.uy)

**Dedrel** is a tabletop role-playing game with its own rules and its own world, and this
repository is its system for [Foundry Virtual Tabletop](https://foundryvtt.com) **V14**.

> **Status: alpha.** The system is played at live playtests and changes quickly.
> Data formats may still change between versions.

## About the game

Dedrel is a magepunk fantasy world: magic and clockwork live side by side, and a magic
sword or wand is the norm rather than a rarity. In spirit it is closer to cyberpunk —
guilds take the place of corporations, and artifacts and mutations take the place of
cyber-implants. Some guilds surpass entire countries in military and economic might.

The rules are built around a few ideas:

- **Three pools of action points** — maneuver, magic and universal. On your turn you take
  one Action and continue with Chain maneuvers while you have points; points you keep
  pay for Reactions on other creatures' turns.
- **Maneuvers instead of a flat "attack"**: feints, ripostes, aimed shots, combinations.
  The maneuvers you can use depend on your weapon and your skills.
- **A Damage Ladder** (`1d4 → 1d6 → 2d4 → 2d6 → 2d8 → 3d6`): bonuses move damage dice up
  the ladder instead of adding flat numbers.
- **Damage reduction (DR) by damage type**: each point is −10% damage of that type, and
  a weapon's **armor piercing** cancels DR one for one.
- **Spells are built, not memorized**: a doctrine, a technique and modifiers make up a
  spell, and the Spell Constructor calculates its cost and effect.
- **No classes or levels**: characters grow by spending experience on attributes, skills
  and talents; mutations change the body itself.

The rules and the world are on the website: [Quick Rules](https://dedrel.teo.uy/en/rules/Quick-Rules)
are enough to sit down at the table with a ready-made character.

## What works

- **Sheets** for characters, NPCs and loot containers. NPCs use the same combat model as
  characters, with threat tiers.
- **21 item types**: weapons, armor, ammunition, maneuvers, talents, mutations, spells,
  conditions, potions, crafting materials and more.
- **The use → chat → roll flow**: using a maneuver or spell spends action points, posts a
  card to chat, rolls attack and damage, and applies damage to the target with DR and
  armor piercing.
- **Conditions** as token status effects, including stacking ones, with damage and healing
  over time at the start or end of a turn.
- **Spell Constructor** — an app for building spells from doctrines, techniques and
  modifiers.
- **Inventory**: equipment slots, weight, a multi-currency wallet, trading with merchants.
- **Crafting** with built-in blueprints and materials.
- **Combat HUDs**: action points, maneuvers available as a chain, active effects with
  remaining duration; movement budget per round; auras.
- **World time and calendar**: effects lasting hours and days, group rests.
- **Compendiums**: 106 maneuvers, 121 talents, 80 mutations, 28 spells, 28 conditions,
  45 weapons, 178 crafting materials, a starter bestiary and more.
- **English and Russian**: the interface is fully translated; compendium content is
  stored in Russian and the English translation is applied on the fly
  (setting *System Language (Forced)*).

## Not yet

- **No release package yet**, so installing by manifest URL is not possible — see
  [Installation](#installation).
- **The rules are not inside Foundry yet** — read them on the website.
- **No adventures are bundled.** The bestiary is small: beasts, bandits, townsfolk, a legion.
- **Some texts are Russian only**: NPC biographies in the bestiary and the developer
  documentation in [`docs/`](docs/README.md).

## Installation

Installing by manifest URL will come with the first release. Until then, the system can be
installed from source:

1. Install Foundry VTT **V14**.
2. Clone this repository into `Data/systems/dedrel` of your Foundry user data folder.
   The folder must be named `dedrel`.
3. Install [Node.js](https://nodejs.org) 22 or newer, then run `npm install` and
   `npm run build-packs` in that folder. This builds the compendium databases from the
   JSON sources in `packs/_source/`.
4. Start Foundry and create a world with the Dedrel system.

To switch the content language, use the *System Language (Forced)* setting in the system settings.

## Contributing

Bug reports, ideas and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
Developer documentation (in Russian for now) starts at [docs/README.md](docs/README.md);
the map of the code is [docs/architecture.md](docs/architecture.md).

## License

- **Code** — [MIT](LICENSE).
- **Content** (rules texts, compendiums, translations, artwork) —
  [CC BY-NC 4.0](LICENSE-CONTENT), with an additional permission for streams, paid games
  and modules for the system.
- Third-party icons and fonts keep their own licenses.

Which folder falls under which license, and what the additional permission covers, is in
[NOTICE](NOTICE).

**AI disclosure.** The rules, texts and setting are written by the author over more than
ten years. The system code was developed with AI coding assistants (Claude Code, Google
Antigravity); the raster artwork (tokens, icons) is AI-generated. Details are in
[NOTICE](NOTICE).

Dedrel is an independent system and is not affiliated with or endorsed by Foundry Gaming LLC.

© 2015–2026 Teo (Lucky Star Games) · [dedrel.teo.uy](https://dedrel.teo.uy) · admin@teo.uy
