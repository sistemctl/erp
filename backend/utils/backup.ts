import type { TableName } from 'sequelize';
export type BackupRow = Record<string, unknown> & { id: string };
export type BackupData = Record<string, BackupRow[]>;
interface BackupAttribute { references?: { model?: TableName } }
export interface BackupModel { rawAttributes: Record<string, BackupAttribute>; getTableName(): TableName; build(row: BackupRow): { validate(): Promise<unknown> }; findAll(options: { raw: true; transaction: import('sequelize').Transaction }): Promise<BackupRow[]>; bulkCreate(rows: BackupRow[], options: { validate: true; hooks: false; transaction: import('sequelize').Transaction }): Promise<unknown> }
// Adaptador localizado para recorrer modelos heterogéneos; cada fila se valida antes de restaurar.
export function getBackupModels(input: object): Record<string, BackupModel> {
  const registry: Record<string, BackupModel> = {};
  for (const [name, model] of Object.entries(input) as [string, unknown][]) {
    if (typeof model === 'function' && 'rawAttributes' in model && 'getTableName' in model && typeof model.getTableName === 'function') registry[name] = model as unknown as BackupModel;
  }
  return registry;
}
import crypto = require('crypto');
import { httpError } from './http-error';

function backupKey(password: unknown, salt: Buffer) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    throw httpError(400, 'La contraseña del respaldo debe tener al menos 12 caracteres.');
  }
  return crypto.scryptSync(password, salt, 32);
}

function encryptBackup(data: unknown, password: unknown) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', backupKey(password, salt), iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return { format: 'erp-techstore', version: 2, createdAt: new Date().toISOString(),
    salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
    payload: payload.toString('base64') };
}

function decryptBackup(input: unknown, password: unknown): unknown {
  const backup = input && typeof input === 'object' ? input as Record<string, unknown> : null;
  if (backup?.format !== 'erp-techstore' || backup.version !== 2) {
    throw httpError(400, 'Este respaldo no contiene el formato completo y cifrado actual.');
  }
  const salt = Buffer.from(String(backup.salt || ''), 'base64');
  const key = backupKey(password, salt);
  try {
    const iv = Buffer.from(String(backup.iv || ''), 'base64'), tag = Buffer.from(String(backup.tag || ''), 'base64');
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw new Error('Formato inválido');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(String(backup.payload), 'base64')), decipher.final()]).toString('utf8'));
  } catch (_) {
    throw httpError(400, 'La contraseña es incorrecta o el respaldo está dañado.');
  }
}

function orderedBackupModels(input: object) {
  const entries = Object.entries(getBackupModels(input));
  const tableName = (table: TableName) => typeof table === 'string' ? table : table.tableName;
  const namesByTable = new Map(entries.map(([name, model]) => [tableName(model.getTableName()), name]));
  const pending = new Map(entries.map(([name, model]) => [name, new Set(Object.values(model.rawAttributes)
    .map((attr) => attr.references?.model).filter((table): table is TableName => !!table).map((table) => namesByTable.get(tableName(table)))
    .filter((ref): ref is string => !!ref && ref !== name))]));
  const ordered: string[] = [];
  while (pending.size) {
    const ready = [...pending].filter(([, deps]) => [...deps].every((name) => !pending.has(name))).map(([name]) => name).sort();
    if (!ready.length) throw new Error('Las relaciones de respaldo contienen un ciclo.');
    for (const name of ready) { ordered.push(name); pending.delete(name); }
  }
  return ordered;
}

async function validateBackup(data: unknown, input: object, ordered: string[]): Promise<BackupData> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw httpError(400, 'Contenido del respaldo inválido.');
  const models = getBackupModels(input);
  const records = data as Record<string, unknown>;
  const validated: BackupData = {};
  const ids = new Map<string, Set<unknown>>();
  const namesByTable = new Map(ordered.map((name) => [models[name].getTableName(), name]));
  for (const name of ordered) {
    const rows = records[name];
    if (!Array.isArray(rows)) throw httpError(400, `El respaldo no incluye la tabla ${name}.`);
    const seen = new Set();
    for (const inputRow of rows) {
      const row = inputRow as BackupRow;
      if (!row || typeof row !== 'object' || Array.isArray(row) || !row.id || seen.has(row.id)) {
        throw httpError(400, `Registro o identificador inválido en ${name}.`);
      }
      seen.add(row.id);
      if (name === 'Usuario' && !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(row.password || ''))) {
        throw httpError(400, 'El respaldo no conserva contraseñas de usuarios válidas.');
      }
      try { await models[name].build(row).validate(); }
      catch (_) { throw httpError(400, `Un registro de ${name} no cumple el esquema actual.`); }
    }
    ids.set(name, seen);
    validated[name] = rows as BackupRow[];
  }
  for (const name of ordered) {
    for (const row of validated[name]) {
      for (const [field, attr] of Object.entries(models[name].rawAttributes)) {
        const target = namesByTable.get(attr.references?.model || '');
        if (target && row[field] != null && !ids.get(target)?.has(row[field])) {
          throw httpError(400, `Referencia inválida en ${name}.${field}.`);
        }
      }
    }
  }
  return validated;
}
export { encryptBackup, decryptBackup, orderedBackupModels, validateBackup };
