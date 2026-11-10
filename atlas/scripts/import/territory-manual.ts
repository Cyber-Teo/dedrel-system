// Ручной разбор смены владения по тексту (поле territorial_change.note) там, где автоматический разбор формулировки не справился.
// Правило: в записи только то, что сказано в note/названии события; нет названного места — places пустой (владелец известен, участок нет).
// Не включены события без смены владения: «без перемен/без изменений/нет/не указано», остаётся независимым, граница зафиксирована,
// отступление, граница леса, гибель родного мира эльфов (вне карты). Их note остаётся как есть.
export type Manual = { g?: [string, string[]][]; l?: [string, string[]][] }
const D = 'geo:drinrog',
  Z = 'geo:zanra',
  R = 'geo:royo',
  G = 'geo:gross'
const ENF = 'Княжество Энфорис',
  IMP = 'Иллиорская империя',
  UNION = 'Иллиорский союз',
  ELF = 'Эльфы',
  HUM = 'Люди',
  DEM = 'Демоны'

export const MANUAL: Record<string, Manual> = {
  // перекрывают автоматический разбор (он терял места)
  'ev:573:enfina_priznaet_nezavisimost_grossa_': {
    g: [
      ['Королевство Гросс', [G]],
      ['Королевство Ройо', [R]],
    ],
    l: [[IMP, [G, R]]],
  },
  'ev:x:nezavisimost_royo_i_grossa': {
    g: [
      ['Королевство Гросс', [G]],
      ['Королевство Ройо', [R]],
    ],
    l: [[IMP, [G, R]]],
  },
  'ev:-1700:pervye_lyudi_prihodyat_so_zvezd_i_os': { g: [['Первые люди', ['geo:vostochnye_zemli']]] },
  'ev:-500:noch_yadovitogo_uzhasa': { g: [[DEM, []]] }, // «демоны контролируют земли севернее Монструозного моря»
  'ev:-500:vtorzhenie_demonov_pervye_portaly_na': { g: [[DEM, ['countries/archdemon_s_plateau/index']]] },
  'ev:-495:voyna_straha_proklyatie_denrary_sozd': { l: [['Первые люди', []]] }, // «люди теряют почти все города»
  'ev:-490:bitva_ognennoy_yarosti': { g: [['Драконы', ['countries/dragons_country/index']]] },
  'ev:-490:bitva_pri_arkadii_drakony_snimayut_o': { l: [['Первые люди', ['geo:arkadiya']]] },
  'ev:-290:padenie_arkadii_nochnoy_shturm_podze': { l: [['Первые люди', ['geo:arkadiya']]] },
  'ev:-210:osnovanie_maharathi': { g: [['Махаратха', ['geo:maharatha_gorod', 'countries/makharatkha/index']]] },
  'ev:-185:pervyy_reyd_adamar_i_ezil_osazhdayut': {
    g: [[HUM, ['geo:serebryanye_gory']]],
    l: [[DEM, ['geo:akrit', 'geo:serebryanye_gory']]],
  },
  'ev:-170:osnovanie_vyshnevodska': { g: [['Вышневодск', ['geo:vyshnevodsk']]] },
  'ev:-149:bolshoy_reyd': { l: [[DEM, []]] }, // «вытеснены с большей части мира, остаются в Южных землях»
  'ev:-81:sozdanie_knyazhestva_enforis': { g: [[ENF, ['geo:olifanor', 'geo:imrelon', 'geo:ormhorn']]] },
  'ev:-50:bolshinstvo_elfov_i_drakonov_pokidae': {
    g: [[HUM, ['geo:dagor', 'geo:erelon', 'geo:siladel', 'geo:kallatis']]],
    l: [[ELF, ['geo:dagor', 'geo:erelon', 'geo:siladel', 'geo:kallatis']]],
  },
  'ev:-50:shturm_asmodiusa': { g: [['Бывшие рабы', ['geo:asmodius']]] },
  'ev:70:sbor_illiorskogo_soyuza': { g: [[UNION, []]] },
  'ev:76:soyuz_illiora_s_dagorom': { g: [[UNION, ['geo:dagor']]] },
  'ev:81:severnyy_pohod_maldreda': { g: [[UNION, ['geo:nordheld', 'geo:greyheld']]] },
  'ev:88:vostochnyy_pohod_maldreda': { g: [[UNION, [Z]]] },
  'ev:90:gustav_landovski_koloniziruet_podmen': {
    g: [['Берсан', ['geography/changeling_forest', 'countries/gross/cities/city_old_ivy']]],
  },
  'ev:90:kolonizatsiya_podmennogo_lesa': {
    g: [['Берсан', ['geography/changeling_forest', 'countries/gross/cities/city_old_ivy']]],
  },
  'ev:97:drinrog_zaklyuchaet_soyuz': { g: [[UNION, [D]]] },
  'ev:101:danirtsy_osnovyvayut_nadzhir': { g: [['Данир', ['geo:nadzhir', 'geo:solnechnyy_proliv']]] },
  'ev:101:danirtsy_zakladyvayut_nadzhir_na_zap': { g: [['Данир', ['geo:nadzhir', 'geo:solnechnyy_proliv']]] },
  'ev:135:radzha_tarpeta_hashem_podchinyaet_do': { g: [['Княжество Игни', ['geo:dolina_sarati']]] },
  'ev:135:zavoevaniya_hashema_i_osnovanie_igni': { g: [['Тарпет', ['geo:tarpet', 'geo:dolina_sarati']]] },
  'ev:147:bersan_irina_landovska_vstupaet_v_so': {
    g: [['Берсан', ['countries/gross/regions/gross_lior_delta', 'geo:aendo']]],
  },
  'ev:151:irina_landovska_prinimaet_koronu_iz_': { g: [['Королевство Гросс', ['geo:bersan']]] },
  'ev:151:koronatsiya_iriny_landovskoy': { g: [['Королевство Гросс', ['geo:bersan']]] },
  'ev:152:delamota_usilivaetsya': { g: [['Деламота', ['geo:samrun', 'geo:zakatnaya_buhta', 'geo:delamota']]] },
  'ev:152:pervye_upominaniya_samruna_delamota_': {
    g: [['Деламота', ['geo:samrun', 'geo:zakatnaya_buhta', 'geo:delamota']]],
  },
  'ev:163:maldred_idet_po_moroznomu_bolotu_i_v': { g: [[UNION, ['geography/river_of_doom']]] },
  'ev:163:pohod_maldreda_na_zalese_ot_nordheld': { g: [[UNION, ['geo:zalese']]] },
  'ev:167:soyuz_svobodnyh_danir_delamota_zakat': {
    g: [['Союз Свободных', ['geo:danir', 'geo:delamota', 'geo:zakatnaya_buhta']]],
    l: [['Королевство Гросс', ['geo:danir', 'geo:delamota', 'geo:zakatnaya_buhta']]],
  },
  'ev:167:soyuz_svobodnyh_zayavlyaet_o_sebe': {
    g: [['Союз Свободных', ['geo:danir']]],
    l: [['Королевство Гросс', ['geo:danir']]],
  },
  'ev:174:lihaya_desyatiletka_razmezhevanie_ch': { g: [['Королевство Гросс', []]], l: [['Союз Свободных', []]] },
  'ev:174:zavoevanie_zemel_soyuza_svobodnyh_ro': { g: [[IMP, []]], l: [['Союз Свободных', []]] },
  'ev:206:181_letniy_maldred_provozglashaet_il': { g: [[IMP, ['geo:vostochnye_zemli']]] },
  'ev:206:osnovanie_illiorskoy_imperii_sozdan_': { g: [[IMP, ['countries/arnost/index', 'geo:vyshnevodsk']]] },
  'ev:320:nabegi_rutiliev_na_enforis_naemnikam': { l: [[ENF, []]] },
  'ev:409:riklaeron_stroitel_novye_dorogi_i_go': { g: [[IMP, ['geo:terranova', 'geo:port_novoy_nadezhdy']]] },
  'ev:500:pik_imperii_bolshaya_chast_vostochny': { g: [[IMP, ['geo:vostochnye_zemli']]] },
  'ev:560:vosstanie_damiana_tarkviniya_kalatra': { g: [['Королевство Ройо', [R]]], l: [[IMP, [R]]] },
  'ev:562:boi_na_granitsah_royo_imperiya_brosa': {
    l: [
      ['Королевство Гросс', []],
      [IMP, ['geo:hrell']],
    ],
  }, // Гросс — «часть западных земель»; Хрэлл «без власти»
  'ev:573:perevorot_v_bersane_pri_bezdeystvii_': {
    g: [['Королевство Гросс', ['geo:bersan']]],
    l: [[IMP, ['geo:bersan']]],
  },
  'ev:573:perevorot_v_prefekture_gross': { g: [['Королевство Гросс', ['geo:bersan', G]]], l: [[IMP, [G]]] },
  'ev:719:rutilii_s_nezhityu_zahvatyvayut_liyn': {
    g: [['Рутилии', ['geo:liyne', 'geo:elida_edif']]],
    l: [[ENF, ['geo:liyne', 'geo:elida_edif']]],
  },
  'ev:719:vyshnevodtsy_s_nezhityu_zahvatyvayut': {
    g: [['Вышневодск', ['geography/old_forest']]],
    l: [[ENF, ['geography/old_forest']]],
  },
  'ev:719:zahvat_liyne_i_elida_edifa_arnostom': {
    g: [['Арност', ['geo:liyne', 'geo:elida_edif']]],
    l: [[ENF, ['geo:liyne', 'geo:elida_edif']]],
  },
  'ev:720:enforis_nanimaet_seryy_avangard': { g: [[ENF, []]], l: [['Вышневодск', []]] },
  'ev:653:igni_asmodianskaya_voyna': {
    g: [['Асмодианцы', ['geo:bandurdeh', 'geo:gandzhapar']]],
    l: [['Княжество Игни', ['geo:bandurdeh', 'geo:gandzhapar']]],
  },
  'ev:672:ukaz_senata_ot_imeni_gneya_ii_stolit': { l: [[IMP, ['geo:zalese']]] }, // «Залесье фактически независимо»
  'ev:698:galan_iz_enforisa_otkryvaet_tilenaka': { g: [[ENF, ['countries/sunny_islands/index']]] },
  'ev:699:osnovanie_faktorii_elka': { g: [[ENF, ['geo:elka', 'geo:osegrot']]] },
  'ev:700:faktoriya_na_arvebele_arhimag_shehar': { g: [['Махаратха', ['geo:arvebel', 'geo:kifor']]] },
  'ev:754:obosoblenie_zanry_arnosta_runa_i_dri': { g: [[IMP, ['geo:arvebel']]] },
  'ev:778:illiorsko_drinrogskaya_voyna': { g: [['Республика Дринрог', [D]]], l: [[IMP, [D]]] },
  'ev:781:ostrovnoy_krizis': { g: [['Колонии Энфориса', ['geo:elka', 'countries/sunny_islands/index']]] },
  'ev:800:katbert_samyy_molodoy_episkop_v_kana': { l: [['Махаратха', []]] },
  'ev:817:nezavisimost_zanry': { g: [['Королевство Занра', [Z]]], l: [[IMP, [Z]]] },
  'ev:817:perevorot_v_zanre_koroleva_ana_kezon': { g: [['Королевство Занра', [Z]]], l: [[IMP, [Z]]] },
  'ev:818:reformy_any_12_departamentov_zemlya_': { g: [['Королевская семья', [Z]]] },
  'ev:819:vyshnevodsko_enforisskaya_voyna_nekr': {
    g: [['Вышневодск', ['geo:serebryanye_gory']]],
    l: [[ENF, ['geo:serebryanye_gory']]],
  },
  'ev:820:ishod_katbertistov_na_solnechnye_ost': { g: [['Святая Земля', ['geo:svyataya_zemlya']]] },
  'ev:820:pereselenie_posledovateley_tserkvi_k': { g: [['Святая Земля', ['geo:svyataya_zemlya']]] },
  'ev:995:grann_krivoy_podchinyaet_goroda_zale': { g: [['Залесское княжество', ['geo:zalessk']]] },
  'ev:1005:dzhok_silvertuf_graf_hrella_s_drakon': { g: [['Джок', ['geo:delamota']]] },
  'ev:1005:fei_zaklyuchayut_soyuz_s_lyudmi_prot': { g: [['Друидова пуща', ['countries/druid_s_grove/index']]] },
  'ev:1005:gross_cherez_naemnikov_vilarinskogo_': {
    g: [['Друидова пуща', ['countries/druid_s_grove/index']]],
    l: [['Королевство Гросс', ['geography/changeling_forest']]],
  },
  'ev:1005:kolonialnoe_royo_ne_priznaet_dzhoka_': {
    g: [['Колониальное Ройо', ['geo:novyy_danir']]],
    l: [['Королевство Ройо', ['geo:novyy_danir']]],
  },
  'ev:1005:nezavisimost_kolonialnogo_royo': {
    g: [['Колониальное Ройо', ['countries/sunny_islands/colonial_rojo']]],
    l: [['Королевство Ройо', ['countries/sunny_islands/colonial_rojo']]],
  },
  'ev:1005:oktyabr_1005_dzhok_velaskez_delamota': { g: [[IMP, [R]]] }, // протекторат
  'ev:1005:pohod_xxiv_legiona_i_votsarenie_dzho': { g: [[IMP, [R]]] },
  'ev:1005:protektorat_nad_royo': { g: [[IMP, [R]]] },
  'ev:1005:royo_stanovitsya_protektoratom_illio': { g: [[IMP, [R]]] },
  'ev:1005:provozglashenie_bastionnogo_soyuza': {
    g: [['Бастионный союз', ['countries/bastion_union/index']]],
    l: [['Данир', ['countries/bastion_union/index']]],
  },
  'ev:1005:raskol_tserkvi_zvezd_espinar_protiv_': {
    g: [
      [IMP, [R]],
      ['Бастионный союз', ['countries/bastion_union/index']],
    ],
    l: [['Данир', ['countries/bastion_union/index']]],
  },
  'ev:1005:soyuz_grossa_s_druidami': {
    g: [['Друидова пуща', ['countries/druid_s_grove/index']]],
    l: [['Королевство Гросс', []]],
  },
  'ev:x:elfiyskaya_tverdynya_dagor': {
    g: [[IMP, ['countries/illior_empire/regions/illior_empire_sark_region']]],
    l: [[ELF, ['geo:dagor']]],
  },
  'ev:x:elfy_osnovyvayut_forpost_afrimas': {
    g: [
      [ELF, ['geo:afrimas']],
      [ENF, ['geo:afrimas']],
    ],
  },
  'ev:x:elfy_ostavlyayut_kreposti_siladel_po': { g: [[HUM, ['geo:siladel']]], l: [[ELF, ['geo:siladel']]] },
  'ev:x:maharatha_pribiraet_khabarut': { g: [['Махаратха', ['geo:khabarut']]] },
  'ev:x:novye_nabegi_vyshnevodska': { g: [['Вышневодск', []]], l: [[ENF, []]] },
  'ev:x:padenie_tirana_madakisha': { l: [['Тирания Мадакиша', ['countries/archdemon_s_plateau/index']]] },
}
