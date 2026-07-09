/**
 * Item «Тип существа» (creature_type). Тег принадлежности существа к
 * категории (à la D&D creature types) + носитель врождённых бонусов.
 *
 * Как работать/балансить:
 *  - system.key — стабильный ключ типа (см. CONFIG.DEDREL.creatureTypes),
 *    по нему оружие/эффекты будут бить «против типа»;
 *  - бонусы всего вида (DR, защиты, скорость, иммунитеты) вешаются через
 *    штатную вкладку Active Effects этого Item'а — они переносятся на актёра,
 *    когда предмет лежит в его инвентаре (как у талантов/состояний);
 *  - описание — вкладка «Описание».
 *
 * Предмет кладётся в инвентарь NPC (или персонажа); лист NPC показывает тип
 * в шапке. Один актёр может нести несколько типов.
 */
export default class CreatureTypeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, StringField } = foundry.data.fields;
    return {
      key: new StringField({ required: false, initial: "" }),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }
}
