import CurrencyData from './currency.mjs';
import LootData from './loot.mjs';
import TradeGoodData from './trade_good.mjs';
import MutilationData from './mutilation.mjs';
import CountryOfOriginData from './countryoforigin.mjs';
import MutationData from './mutation.mjs';
import TalentData from './talent.mjs';
import ManeuverData from './maneuver.mjs';
import WeaponData from './weapon.mjs';
import ArmorData from './armor.mjs';
import MagicItemData from './magic_item.mjs';
import ExpData from './exp.mjs';
import ConditionDataModel from './condition.mjs';
import AmmunitionDataModel from './ammunition.mjs';
import SpellDataModel from './spell.mjs';

export const ItemDataModels = {
  currency: CurrencyData,
  loot: LootData,
  trade_good: TradeGoodData,
  mutilation: MutilationData,
  countryoforigin: CountryOfOriginData,
  mutation: MutationData,
  talent: TalentData,
  maneuver: ManeuverData,
  weapon: WeaponData,
  armor: ArmorData,
  magic_item: MagicItemData,
  exp: ExpData,
  condition: ConditionDataModel,
  ammunition: AmmunitionDataModel,
  spell: SpellDataModel
};
