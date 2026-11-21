const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../backend');
for (const domain of ['auth', 'public', 'notificaciones', 'series', 'auditlog']) {
  const file = path.join(root, 'controllers', domain + '.controller.js');
  let text = fs.readFileSync(file, 'utf8');
  text = text.replace(/const \{([\s\S]*?)\} = require\('\.\.\/models'\);/g, 'const {$1} = models;');
  text = text.replace(/const \{ ([^}]+) \} = require\('([^']+)'\);/g, "import { $1 } from '$2';");
  text = text.replace(/exports\.(\w+) = async/g, 'export const $1: Handler<Body> = async');
  text = text.replaceAll('req.usuario', 'requireUser(req)');
  text = text.replaceAll('transaction.finished', 'transactionFinished(transaction)');
  let header = "import models = require('../models');\nimport type { Handler } from '../types/controller';\nimport { requireUser } from '../utils/request-user';\n";
  if (domain === 'auth') {
    header += "import { denyToken } from '../utils/token-denylist';\ntype Body = { email?: string; password?: string };\n";
    text = text.replace("const jwt = require('jsonwebtoken');", "import jwt = require('jsonwebtoken');")
      .replace("require('dotenv').config();", "import dotenv = require('dotenv');\ndotenv.config();")
      .replace('    // Crear JWT token', "    const secret = process.env.JWT_SECRET;\n    if (!secret) throw new Error('JWT_SECRET no configurado.');\n    // Crear JWT token")
      .replace('process.env.JWT_SECRET,', 'secret,')
      .replace("process.env.JWT_EXPIRES_IN || '8h'", "(process.env.JWT_EXPIRES_IN || '8h') as jwt.SignOptions['expiresIn']")
      .replace("    import { denyToken } from '../utils/token-denylist';\n", '')
      .replace("require('jsonwebtoken').decode(token)", 'jwt.decode(token)')
      .replace('if (decoded?.exp)', "if (decoded && typeof decoded !== 'string' && decoded.exp)");
  } else if (domain === 'series') {
    header += "import type { Attributes, CreationAttributes, WhereOptions } from 'sequelize';\nimport type SerieModel = require('../models/NumeroSerie');\nimport { transactionFinished } from '../utils/transaction-state';\ntype Body = Partial<CreationAttributes<SerieModel>> & { series?: string[] };\n";
    text = text.replace('const where = {};', 'const where: WhereOptions<Attributes<SerieModel>> = {};')
      .replace("estado: 'en_stock'\n    }))", "estado: 'en_stock' as const\n    }))");
  } else if (domain === 'auditlog') {
    header += "import type { Attributes, IncludeOptions, WhereAttributeHash } from 'sequelize';\nimport type AuditModel = require('../models/AuditLog');\ntype Body = Record<string, never>;\n";
    text = text.replace('const where = {};', 'const where: WhereAttributeHash<Attributes<AuditModel>> = {};')
      .replace('where.accion = accion;', "where.accion = accion as Attributes<AuditModel>['accion'];")
      .replace('    const userInclude = {', '    const userInclude: IncludeOptions = {')
      .replace('where.createdAt = {};', 'const dates: { [Op.gte]?: Date; [Op.lte]?: Date } = {};\n      where.createdAt = dates;')
      .replaceAll('where.createdAt[', 'dates[');
  } else {
    header += 'type Body = Record<string, never>;\n';
  }
  if (domain === 'public') text = text.replace('const ESTADO_LABELS = {', 'const ESTADO_LABELS: Record<string, string> = {').replace('function maskImei(imei)', 'function maskImei(imei: string | null)');
  fs.writeFileSync(file.replace(/\.js$/, '.ts'), header + text);
  fs.unlinkSync(file);
  const route = path.join(root, 'routes', domain + '.routes.js');
  let routes = fs.readFileSync(route, 'utf8').replace(/const (\w+) = require\('([^']+)'\);/g, "import $1 = require('$2');")
    .replace(/const \{ ([^}]+) \} = require\('([^']+)'\);/g, "import { $1 } from '$2';")
    .replace('module.exports = router;', 'export = router;');
  fs.writeFileSync(route.replace(/\.js$/, '.ts'), routes);
  fs.unlinkSync(route);
}
