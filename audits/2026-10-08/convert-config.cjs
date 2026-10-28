const fs = require('node:fs');
const path = require('node:path');
const { controller } = require('./ts-backend-tools.cjs');
controller('config', `import type { Attributes, CreationAttributes, Transaction, WhereOptions, QueryInterface, TableName } from 'sequelize';
import type { Request } from 'express';
import type ConfiguracionModel = require('../models/ConfiguracionSistema');
import type SedeModel = require('../models/Sede');
import type UsuarioModel = require('../models/Usuario');
import type { HttpError } from '../utils/http-error';
import { sanitizeTemaInterfaz } from '../utils/tema-interfaz';
import { encryptBackup, decryptBackup, orderedBackupModels, validateBackup, getBackupModels, type BackupData } from '../utils/backup';
import { initializeDocumentSequences } from '../utils/document-number';
type Body = CreationAttributes<SedeModel> & CreationAttributes<UsuarioModel> & Partial<Attributes<ConfiguracionModel>> & { emailDestino?: string; backup?: unknown };
type ConfigJson = Attributes<ConfiguracionModel>;
type ConfigMeta = ConfigJson & { servidor: { puertoActivo: number; puertoConfigurado: number; urlActiva: string; urlLocal: string; urlPublica: string | null; urlConfigurada: string; requiereReinicio: boolean; tunelActivo: boolean }; facturasTallerActualizadas?: number; requiereReinicio?: boolean; mensajeReinicio?: string };
// Interfaz interna de Sequelize 6 utilizada por el respaldo existente para citar tablas.
function quoteBackupTable(queryInterface: QueryInterface, table: TableName) {
  const generator = (queryInterface as QueryInterface & { queryGenerator: { quoteTable(table: TableName): string } }).queryGenerator;
  return generator.quoteTable(table);
}
`, [
  ['async function forceDeleteSede(sede, transaction)', 'async function forceDeleteSede(sede: SedeModel, transaction: Transaction)'],
  ['const err = new Error(', 'const err: HttpError = new Error('],
  ['function maskSecretFields(data)', "function maskSecretFields<T extends Pick<ConfigJson, 'smtpPass' | 'twilioAuthToken'>>(data: T)"],
  ['function toOpsConfig(configJson)', 'function toOpsConfig(configJson: ConfiguracionModel | ConfigJson)'],
  ['function attachServidorMeta(configJson, req)', 'function attachServidorMeta(configJson: ConfiguracionModel | ConfigJson, req: Request): ConfigMeta'],
  ['configJson?.toJSON ? configJson.toJSON()', "'toJSON' in configJson ? configJson.toJSON()"],
  ['const out = {};', 'const out: Record<string, unknown> = {};'],
  ['if (data[key] !== undefined) out[key] = data[key];', 'if (data[key as keyof ConfigJson] !== undefined) out[key] = data[key as keyof ConfigJson];'],
  ['const where = { activo: true };', 'const where: WhereOptions<Attributes<UsuarioModel>> = { activo: true };'],
  ['if (rol) where.rol = rol;', "if (rol) where.rol = rol as UsuarioModel['rol'];"],
  ['const updateData = { nombre, email, rol, sedeId: sedeId || null, activo };', 'const updateData: Partial<Attributes<UsuarioModel>> = { nombre, email, rol, sedeId: sedeId || null, activo };'],
  ["    const { sanitizeTemaInterfaz } = require('../utils/tema-interfaz');", ''],
  ['validationError.status || 400', "(validationError && typeof validationError === 'object' && 'status' in validationError && typeof validationError.status === 'number' ? validationError.status : 400)"],
  ["validationError.message || 'temaInterfaz inválido.'", "validationError instanceof Error ? validationError.message : 'temaInterfaz inválido.'"],
  ["payload.puertoServidor !== ''", "String(payload.puertoServidor) !== ''"],
  ['let puertoNuevo = null;', 'let puertoNuevo: number | null = null;'],
  ['buildAppUrl(puertoNuevo)', 'buildAppUrl(puertoNuevo || DEFAULT_PORT)'],
  ["    const models = require('../models');", '    const backupModels = getBackupModels(models);'],
  ["    const { encryptBackup, orderedBackupModels } = require('../utils/backup');", ''],
  ["    const { decryptBackup, orderedBackupModels, validateBackup } = require('../utils/backup');", ''],
  ["    const { initializeDocumentSequences } = require('../utils/document-number');", ''],
  ['const data = {};', 'const data: BackupData = {};'],
  ['models[name]', 'backupModels[name]'],
  ['const data = decryptBackup(req.body.backup, req.body.password);\n    await validateBackup(data, models, ordered);', 'const data = await validateBackup(decryptBackup(req.body.backup, req.body.password), models, ordered);'],
  ['sequelize.getQueryInterface().queryGenerator.quoteTable(backupModels[name].getTableName())', 'quoteBackupTable(sequelize.getQueryInterface(), backupModels[name].getTableName())'],
  ['versions.get(row.id)', 'versions.get(row.id)']
]);
const file = path.resolve(__dirname, '../../backend/controllers/config.controller.ts');
let text=fs.readFileSync(file,'utf8');
text=text.replaceAll('requireUser(req)?.rol', 'requireUser(req).rol');
text=text.replace('  } = require(\'../utils/server-config\');', "  } from '../utils/server-config';");
// Convert the multiline utility import omitted by the simple import converter.
text=text.replace('const {\n  clampPort,', 'import {\n  clampPort,').replace("} = require('../utils/server-config');", "} from '../utils/server-config';");
fs.writeFileSync(file,text);
