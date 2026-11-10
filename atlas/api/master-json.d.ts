// api/_data/master.json собирает scripts/build-master.ts, в git его нет — без объявления tsc на чистом клоне не находит модуль.
// Форму данных описывает не тип, а схема MasterDataSchema (src/lib/masterSchema.ts): api/master.ts разбирает файл ею на лету.
declare module '*/master.json' {
  const master: unknown
  export default master
}
