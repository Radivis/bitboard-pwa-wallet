/**
 * Who receives the coinbase when mining from the lab Blocks UI (`LabCurrentBlockTemplateParams`),
 * not SQLite `lab_address_owners.owner_type` (`wallet` / `lab_entity`).
 */
export enum LabOwnerType {
  Wallet = 'wallet',
  LabEntity = 'labEntity',
}
