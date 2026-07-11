/**
 * Migración Odoo (odoo_db) → ERP TechStore (erp_techstore)
 *
 * Conserva: Usuarios, ConfiguracionesSistema
 * Limpia el resto y carga maestros + stock + ventas/facturas/compras mapeables.
 *
 * Uso:
 *   node scripts/migrate-odoo.js --dry-run
 *   node scripts/migrate-odoo.js --execute
 *
 * Variables en backend/.env:
 *   DB_*          → destino erp_techstore
 *   ODOO_DB_*     → origen odoo_db
 */
require('dotenv').config();

const { Sequelize, QueryTypes } = require('sequelize');
const {
  sequelize,
  Sede,
  Usuario,
  Categoria,
  Producto,
  StockSede,
  Cliente,
  Proveedor,
  Venta,
  ItemVenta,
  Factura,
  OrdenCompra,
  ItemOrdenCompra
} = require('../models');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const EXECUTE = args.includes('--execute');

const stats = {
  sedes: { inserted: 0, skipped: 0 },
  categorias: { inserted: 0, skipped: 0 },
  productos: { inserted: 0, skipped: 0 },
  clientes: { inserted: 0, skipped: 0 },
  proveedores: { inserted: 0, skipped: 0 },
  stock: { inserted: 0, skipped: 0 },
  ventas: { inserted: 0, skipped: 0 },
  itemsVenta: { inserted: 0, skipped: 0 },
  facturas: { inserted: 0, skipped: 0 },
  ordenesCompra: { inserted: 0, skipped: 0 },
  itemsCompra: { inserted: 0, skipped: 0 },
  warnings: []
};

function warn(msg) {
  stats.warnings.push(msg);
  console.warn(`  ⚠ ${msg}`);
}

function createOdooSequelize() {
  const host = process.env.ODOO_DB_HOST || process.env.DB_HOST || 'localhost';
  const port = process.env.ODOO_DB_PORT || process.env.DB_PORT || 5432;
  const name = process.env.ODOO_DB_NAME || 'odoo_db';
  const user = process.env.ODOO_DB_USER || process.env.DB_USER || 'postgres';
  const pass = process.env.ODOO_DB_PASS ?? process.env.DB_PASS ?? '';

  return new Sequelize(name, user, pass, {
    host,
    port: Number(port),
    dialect: 'postgres',
    logging: false
  });
}

async function tableExists(db, tableName) {
  const rows = await db.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = :tableName LIMIT 1`,
    { replacements: { tableName }, type: QueryTypes.SELECT }
  );
  return rows.length > 0;
}

async function columnExists(db, tableName, columnName) {
  const rows = await db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = :tableName AND column_name = :columnName LIMIT 1`,
    { replacements: { tableName, columnName }, type: QueryTypes.SELECT }
  );
  return rows.length > 0;
}

async function probeOdoo(odoo) {
  const required = ['res_partner', 'product_template'];
  const optional = [
    'product_product',
    'product_category',
    'stock_warehouse',
    'stock_quant',
    'stock_location',
    'sale_order',
    'sale_order_line',
    'account_move',
    'purchase_order',
    'purchase_order_line'
  ];

  const present = {};
  for (const t of [...required, ...optional]) {
    present[t] = await tableExists(odoo, t);
  }

  for (const t of required) {
    if (!present[t]) {
      throw new Error(`Tabla Odoo requerida no encontrada: ${t}. ¿Es odoo_db una base Odoo estándar?`);
    }
  }

  console.log('Tablas Odoo detectadas:');
  for (const [name, ok] of Object.entries(present)) {
    console.log(`  ${ok ? '✓' : '·'} ${name}`);
  }

  return present;
}

async function countOdoo(odoo, present) {
  const counts = {};
  const queries = {
    partners: `SELECT COUNT(*)::int AS c FROM res_partner WHERE active IS DISTINCT FROM false`,
    templates: `SELECT COUNT(*)::int AS c FROM product_template WHERE active IS DISTINCT FROM false`,
    categories: present.product_category
      ? `SELECT COUNT(*)::int AS c FROM product_category`
      : null,
    warehouses: present.stock_warehouse
      ? `SELECT COUNT(*)::int AS c FROM stock_warehouse WHERE active IS DISTINCT FROM false`
      : null,
    quants: present.stock_quant
      ? `SELECT COUNT(*)::int AS c FROM stock_quant WHERE quantity > 0`
      : null,
    saleOrders: present.sale_order
      ? `SELECT COUNT(*)::int AS c FROM sale_order WHERE state IN ('sale','done')`
      : null,
    invoices: present.account_move
      ? `SELECT COUNT(*)::int AS c FROM account_move WHERE move_type = 'out_invoice' AND state = 'posted'`
      : null,
    purchases: present.purchase_order
      ? `SELECT COUNT(*)::int AS c FROM purchase_order WHERE state IN ('purchase','done')`
      : null
  };

  for (const [key, sql] of Object.entries(queries)) {
    if (!sql) {
      counts[key] = 0;
      continue;
    }
    try {
      const [row] = await odoo.query(sql, { type: QueryTypes.SELECT });
      counts[key] = row?.c || 0;
    } catch (e) {
      counts[key] = 0;
      warn(`No se pudo contar ${key}: ${e.message}`);
    }
  }
  return counts;
}

const TABLES_TO_TRUNCATE = [
  'AuditLogs',
  'Abonos',
  'CuentasPorCobrar',
  'Notificaciones',
  'PagosVenta',
  'ItemsVenta',
  'Facturas',
  'Ventas',
  'ItemsCotizacion',
  'Cotizaciones',
  'FotosReparacion',
  'RepuestosOrden',
  'RentabilidadReparaciones',
  'OrdenesReparacion',
  'TradeIns',
  'EgresosCaja',
  'Cajas',
  'Nominas',
  'Empleados',
  'PagosCompra',
  'ItemsOrdenCompra',
  'OrdenesCompra',
  'MovimientosInventario',
  'NumerosSerie',
  'StockSedes',
  'Productos',
  'Categorias',
  'Clientes',
  'Proveedores',
  'CategoriasEgreso',
  'Sedes'
];

async function cleanErp(transaction) {
  console.log('Limpiando erp_techstore (conservando Usuarios y ConfiguracionesSistema)...');
  await sequelize.query('UPDATE "Usuarios" SET "sedeId" = NULL', { transaction });

  for (const table of TABLES_TO_TRUNCATE) {
    try {
      await sequelize.query(`TRUNCATE TABLE "${table}" CASCADE`, { transaction });
    } catch (e) {
      warn(`TRUNCATE ${table}: ${e.message}`);
    }
  }
}

function uniqueBarcode(raw, odooId, used) {
  let base = String(raw || '').trim();
  if (!base) base = `ODOO-${odooId}`;
  base = base.slice(0, 80);
  let code = base;
  let n = 1;
  while (used.has(code)) {
    code = `${base}-${n++}`.slice(0, 100);
  }
  used.add(code);
  return code;
}

async function migrateSedes(odoo, present, transaction) {
  console.log('→ Sedes');
  const map = new Map(); // odoo warehouse id → erp uuid
  let rows = [];

  if (present.stock_warehouse) {
    const hasPartner = await columnExists(odoo, 'stock_warehouse', 'partner_id');
    if (hasPartner) {
      rows = await odoo.query(
        `SELECT w.id, w.name, COALESCE(p.street, p.city, '') AS direccion, COALESCE(p.phone, p.mobile, '') AS telefono
         FROM stock_warehouse w
         LEFT JOIN res_partner p ON p.id = w.partner_id
         WHERE w.active IS DISTINCT FROM false
         ORDER BY w.id`,
        { type: QueryTypes.SELECT }
      );
    } else {
      rows = await odoo.query(
        `SELECT id, name, '' AS direccion, '' AS telefono
         FROM stock_warehouse
         WHERE active IS DISTINCT FROM false
         ORDER BY id`,
        { type: QueryTypes.SELECT }
      );
    }
  }

  if (!rows.length) {
    if (EXECUTE) {
      const sede = await Sede.create(
        { nombre: 'Principal', direccion: 'Migrada desde Odoo', telefono: null, activa: true },
        { transaction }
      );
      map.set('default', sede.id);
      stats.sedes.inserted = 1;
    } else {
      stats.sedes.inserted = 1;
      map.set('default', 'dry-run-sede');
    }
    return map;
  }

  for (const r of rows) {
    if (EXECUTE) {
      const sede = await Sede.create(
        {
          nombre: String(r.name || `Sede ${r.id}`).slice(0, 255),
          direccion: String(r.direccion || 'Sin dirección').slice(0, 255) || 'Sin dirección',
          telefono: r.telefono ? String(r.telefono).slice(0, 50) : null,
          activa: true
        },
        { transaction }
      );
      map.set(r.id, sede.id);
    } else {
      map.set(r.id, `dry-${r.id}`);
    }
    stats.sedes.inserted += 1;
  }

  const firstId = map.values().next().value;
  map.set('default', firstId);
  return map;
}

async function migrateCategorias(odoo, present, transaction) {
  console.log('→ Categorías');
  const map = new Map(); // odoo categ id → erp uuid

  let rows = [];
  if (present.product_category) {
    rows = await odoo.query(
      `SELECT id, name, complete_name
       FROM product_category
       ORDER BY id`,
      { type: QueryTypes.SELECT }
    );
  }

  if (!rows.length) {
    if (EXECUTE) {
      const cat = await Categoria.create(
        { nombre: 'General', descripcion: 'Categoría por defecto (migración Odoo)' },
        { transaction }
      );
      map.set('default', cat.id);
    } else {
      map.set('default', 'dry-cat');
    }
    stats.categorias.inserted = 1;
    return map;
  }

  for (const r of rows) {
    const nombre = String(r.complete_name || r.name || `Cat ${r.id}`).slice(0, 255);
    if (EXECUTE) {
      const cat = await Categoria.create(
        { nombre, descripcion: r.name ? String(r.name).slice(0, 255) : null },
        { transaction }
      );
      map.set(r.id, cat.id);
    } else {
      map.set(r.id, `dry-cat-${r.id}`);
    }
    stats.categorias.inserted += 1;
  }

  map.set('default', map.values().next().value);
  return map;
}

async function migrateProductos(odoo, present, catMap, transaction) {
  console.log('→ Productos');
  const map = new Map(); // odoo product_product.id → erp uuid
  const usedBarcodes = new Set();

  // Odoo 14–17: standard_price / barcode pueden estar en product_product o product_template
  const stdOnPp = await columnExists(odoo, 'product_product', 'standard_price');
  const stdOnPt = await columnExists(odoo, 'product_template', 'standard_price');
  const listOnPp = await columnExists(odoo, 'product_product', 'list_price');
  const listOnPt = await columnExists(odoo, 'product_template', 'list_price');
  const barcodeOnPp = await columnExists(odoo, 'product_product', 'barcode');
  const barcodeOnPt = await columnExists(odoo, 'product_template', 'barcode');
  const codeOnPp = await columnExists(odoo, 'product_product', 'default_code');
  const codeOnPt = await columnExists(odoo, 'product_template', 'default_code');
  const descOnPt = await columnExists(odoo, 'product_template', 'description_sale');
  const typeOnPt = await columnExists(odoo, 'product_template', 'type');

  const standardPriceExpr = stdOnPp
    ? 'pp.standard_price'
    : stdOnPt
      ? 'pt.standard_price'
      : '0';
  const listPriceExpr = listOnPp
    ? 'pp.list_price'
    : listOnPt
      ? 'pt.list_price'
      : '0';
  const barcodeExpr = barcodeOnPp
    ? 'pp.barcode'
    : barcodeOnPt
      ? 'pt.barcode'
      : 'NULL';
  const defaultCodeExpr = codeOnPp
    ? 'pp.default_code'
    : codeOnPt
      ? 'pt.default_code'
      : 'NULL';
  const descExpr = descOnPt ? 'pt.description_sale' : 'NULL';
  const typeFilter = typeOnPt
    ? "AND COALESCE(pt.type, 'consu') <> 'service'"
    : '';

  let rows;
  if (present.product_product) {
    rows = await odoo.query(
      `SELECT pp.id AS product_id,
              pt.id AS template_id,
              pt.name AS name_raw,
              ${defaultCodeExpr} AS default_code,
              ${barcodeExpr} AS barcode,
              ${listPriceExpr} AS list_price,
              ${standardPriceExpr} AS standard_price,
              pt.categ_id,
              pt.active,
              ${descExpr} AS description_sale
       FROM product_product pp
       JOIN product_template pt ON pt.id = pp.product_tmpl_id
       WHERE pt.active IS DISTINCT FROM false
         ${typeFilter}
       ORDER BY pp.id`,
      { type: QueryTypes.SELECT }
    );
  } else {
    rows = await odoo.query(
      `SELECT pt.id AS product_id,
              pt.id AS template_id,
              pt.name AS name_raw,
              ${codeOnPt ? 'pt.default_code' : 'NULL'} AS default_code,
              ${barcodeOnPt ? 'pt.barcode' : 'NULL'} AS barcode,
              ${listOnPt ? 'pt.list_price' : '0'} AS list_price,
              ${stdOnPt ? 'pt.standard_price' : '0'} AS standard_price,
              pt.categ_id,
              pt.active,
              ${descExpr} AS description_sale
       FROM product_template pt
       WHERE pt.active IS DISTINCT FROM false
         ${typeFilter}
       ORDER BY pt.id`,
      { type: QueryTypes.SELECT }
    );
  }

  for (const r of rows) {
    let nombre = r.name_raw;
    // Odoo 16+ sometimes stores name as JSON {"en_US":"..."}
    if (nombre && typeof nombre === 'object') {
      nombre = nombre.es_CO || nombre.es_ES || nombre.en_US || Object.values(nombre)[0] || `Producto ${r.product_id}`;
    }
    nombre = String(nombre || `Producto ${r.product_id}`).slice(0, 255);

    const codigoBarras = uniqueBarcode(r.barcode || r.default_code, r.product_id, usedBarcodes);
    const categoriaId = catMap.get(r.categ_id) || catMap.get('default');
    if (!categoriaId) {
      stats.productos.skipped += 1;
      continue;
    }

    if (EXECUTE) {
      const prod = await Producto.create(
        {
          nombre,
          codigoBarras,
          descripcion: r.description_sale ? String(r.description_sale).slice(0, 5000) : null,
          precioVenta: Number(r.list_price) || 0,
          precioCosto: Number(r.standard_price) || 0,
          tieneIVA: true,
          stockMinimo: 0,
          tieneNumeroSerie: false,
          esReacondicionado: false,
          categoriaId,
          activo: r.active !== false
        },
        { transaction }
      );
      map.set(r.product_id, prod.id);
      map.set(`tmpl:${r.template_id}`, prod.id);
    } else {
      map.set(r.product_id, `dry-prod-${r.product_id}`);
      map.set(`tmpl:${r.template_id}`, `dry-prod-${r.product_id}`);
    }
    stats.productos.inserted += 1;
  }

  return map;
}

function partnerIsCustomer(r) {
  if (r.customer_rank != null) return Number(r.customer_rank) > 0;
  if (r.customer != null) return Boolean(r.customer);
  return true;
}

function partnerIsSupplier(r) {
  if (r.supplier_rank != null) return Number(r.supplier_rank) > 0;
  if (r.supplier != null) return Boolean(r.supplier);
  return false;
}

async function migratePartners(odoo, sedeMap, transaction) {
  console.log('→ Clientes y Proveedores');
  const clienteMap = new Map();
  const proveedorMap = new Map();
  const defaultSedeId = sedeMap.get('default');

  const hasCustomerRank = await columnExists(odoo, 'res_partner', 'customer_rank');
  const hasSupplierRank = await columnExists(odoo, 'res_partner', 'supplier_rank');
  const hasCustomer = await columnExists(odoo, 'res_partner', 'customer');
  const hasSupplier = await columnExists(odoo, 'res_partner', 'supplier');
  const hasIsCompany = await columnExists(odoo, 'res_partner', 'is_company');
  const hasParentId = await columnExists(odoo, 'res_partner', 'parent_id');

  const selectExtra = [
    hasCustomerRank ? 'customer_rank' : '0 AS customer_rank',
    hasSupplierRank ? 'supplier_rank' : '0 AS supplier_rank',
    hasCustomer ? 'customer' : 'NULL AS customer',
    hasSupplier ? 'supplier' : 'NULL AS supplier'
  ].join(', ');

  const whereParts = ['active IS DISTINCT FROM false'];
  if (hasParentId && hasIsCompany) {
    whereParts.push('(parent_id IS NULL OR is_company = true)');
  } else if (hasParentId) {
    whereParts.push('parent_id IS NULL');
  }

  const rows = await odoo.query(
    `SELECT id, name, phone, mobile, email, vat, street, city, active,
            ${selectExtra}
     FROM res_partner
     WHERE ${whereParts.join(' AND ')}
     ORDER BY id`,
    { type: QueryTypes.SELECT }
  );

  for (const r of rows) {
    const nombre = String(r.name || `Partner ${r.id}`).slice(0, 255);
    const telefono = (r.phone || r.mobile) ? String(r.phone || r.mobile).slice(0, 50) : null;
    const email = r.email ? String(r.email).slice(0, 255) : null;
    const documento = r.vat ? String(r.vat).slice(0, 50) : null;
    const direccion = [r.street, r.city].filter(Boolean).join(', ').slice(0, 255) || null;

    const asCustomer = partnerIsCustomer(r);
    const asSupplier = partnerIsSupplier(r);

    // Si no hay flags claros, tratar como cliente
    const makeCustomer = asCustomer || (!asCustomer && !asSupplier);
    const makeSupplier = asSupplier;

    if (makeCustomer) {
      if (EXECUTE) {
        const cli = await Cliente.create(
          {
            nombre,
            telefono,
            email,
            documento,
            direccion,
            sedeId: defaultSedeId
          },
          { transaction }
        );
        clienteMap.set(r.id, cli.id);
      } else {
        clienteMap.set(r.id, `dry-cli-${r.id}`);
      }
      stats.clientes.inserted += 1;
    }

    if (makeSupplier) {
      const nit = documento || `SIN-NIT-${r.id}`;
      if (EXECUTE) {
        const prov = await Proveedor.create(
          {
            nombre,
            nit: String(nit).slice(0, 50),
            contacto: null,
            telefono,
            email,
            activo: true
          },
          { transaction }
        );
        proveedorMap.set(r.id, prov.id);
      } else {
        proveedorMap.set(r.id, `dry-prov-${r.id}`);
      }
      stats.proveedores.inserted += 1;
    }
  }

  return { clienteMap, proveedorMap };
}

async function migrateStock(odoo, present, productMap, sedeMap, transaction) {
  console.log('→ Stock');
  if (!present.stock_quant) {
    warn('Sin stock_quant: se omite inventario');
    return;
  }

  const hasWarehouseOnLocation = await columnExists(odoo, 'stock_location', 'warehouse_id');
  let rows;

  if (present.stock_location && hasWarehouseOnLocation) {
    rows = await odoo.query(
      `SELECT q.product_id, loc.warehouse_id, SUM(q.quantity)::float AS qty
       FROM stock_quant q
       JOIN stock_location loc ON loc.id = q.location_id
       WHERE q.quantity > 0
         AND loc.usage = 'internal'
         AND loc.warehouse_id IS NOT NULL
       GROUP BY q.product_id, loc.warehouse_id`,
      { type: QueryTypes.SELECT }
    );
  } else {
    // Sin warehouse en location: todo a sede default
    rows = await odoo.query(
      `SELECT q.product_id, NULL AS warehouse_id, SUM(q.quantity)::float AS qty
       FROM stock_quant q
       ${present.stock_location ? "JOIN stock_location loc ON loc.id = q.location_id AND loc.usage = 'internal'" : ''}
       WHERE q.quantity > 0
       GROUP BY q.product_id`,
      { type: QueryTypes.SELECT }
    );
  }

  const aggregated = new Map(); // key productErp|sedeErp → qty
  for (const r of rows) {
    const productoId = productMap.get(r.product_id);
    if (!productoId) {
      stats.stock.skipped += 1;
      continue;
    }
    const sedeId = (r.warehouse_id && sedeMap.get(r.warehouse_id)) || sedeMap.get('default');
    if (!sedeId) {
      stats.stock.skipped += 1;
      continue;
    }
    const key = `${productoId}|${sedeId}`;
    aggregated.set(key, (aggregated.get(key) || 0) + Math.max(0, Math.floor(Number(r.qty) || 0)));
  }

  for (const [key, cantidad] of aggregated.entries()) {
    const [productoId, sedeId] = key.split('|');
    if (cantidad <= 0) continue;
    if (EXECUTE) {
      await StockSede.create({ productoId, sedeId, cantidad }, { transaction });
    }
    stats.stock.inserted += 1;
  }
}

async function getDefaultUsuarioId(sedeMap, transaction) {
  let user = await Usuario.findOne({
    where: { activo: true },
    order: [['createdAt', 'ASC']],
    transaction
  });

  if (!user) {
    user = await Usuario.findOne({
      order: [['createdAt', 'ASC']],
      transaction
    });
  }

  if (!user) {
    warn('No había usuarios: se crea admin.migracion@local (password: Admin123!)');
    user = await Usuario.create(
      {
        nombre: 'Admin Migración',
        email: 'admin.migracion@local',
        password: 'Admin123!',
        rol: 'superadmin',
        sedeId: sedeMap.get('default') || null,
        activo: true
      },
      { transaction, individualHooks: true }
    );
  }

  return user.id;
}

async function migrateVentas(odoo, present, productMap, clienteMap, sedeMap, usuarioId, transaction) {
  console.log('→ Ventas');
  if (!present.sale_order || !present.sale_order_line) {
    warn('Sin sale_order: se omite histórico de ventas');
    return new Map();
  }

  const orderMap = new Map(); // odoo sale_order.id → erp venta uuid
  const hasAmountUntaxed = await columnExists(odoo, 'sale_order', 'amount_untaxed');
  const hasAmountTax = await columnExists(odoo, 'sale_order', 'amount_tax');
  const hasWarehouse = await columnExists(odoo, 'sale_order', 'warehouse_id');
  const hasDisplayType = await columnExists(odoo, 'sale_order_line', 'display_type');
  const hasNote = await columnExists(odoo, 'sale_order', 'note');
  const hasDiscount = await columnExists(odoo, 'sale_order_line', 'discount');

  const orders = await odoo.query(
    `SELECT id, name, partner_id, state, amount_total,
            ${hasAmountUntaxed ? 'amount_untaxed' : 'amount_total AS amount_untaxed'},
            ${hasAmountTax ? 'amount_tax' : '0 AS amount_tax'},
            ${hasWarehouse ? 'warehouse_id' : 'NULL AS warehouse_id'},
            ${hasNote ? 'note' : 'NULL AS note'},
            date_order
     FROM sale_order
     WHERE state IN ('sale', 'done')
     ORDER BY id`,
    { type: QueryTypes.SELECT }
  );

  for (const o of orders) {
    const sedeId = (o.warehouse_id && sedeMap.get(o.warehouse_id)) || sedeMap.get('default');
    const clienteId = o.partner_id ? clienteMap.get(o.partner_id) || null : null;
    const numeroVenta = String(o.name || `SO-${o.id}`).slice(0, 50);
    const subtotal = Number(o.amount_untaxed) || 0;
    const iva = Number(o.amount_tax) || 0;
    const total = Number(o.amount_total) || subtotal + iva;

    let ventaId;
    if (EXECUTE) {
      const venta = await Venta.create(
        {
          numeroVenta,
          clienteId,
          usuarioId,
          sedeId,
          subtotal,
          descuentoTotal: 0,
          iva,
          total,
          esCredito: false,
          saldoPendiente: 0,
          estado: 'completada',
          observaciones: o.note ? String(o.note).slice(0, 2000) : `Migrado desde Odoo (${o.date_order || ''})`
        },
        { transaction }
      );
      ventaId = venta.id;
    } else {
      ventaId = `dry-venta-${o.id}`;
    }
    orderMap.set(o.id, ventaId);
    stats.ventas.inserted += 1;

    const lines = await odoo.query(
      `SELECT id, product_id, product_uom_qty, price_unit, price_subtotal,
              ${hasDiscount ? 'discount' : '0 AS discount'}
       FROM sale_order_line
       WHERE order_id = :orderId
         AND product_id IS NOT NULL
         ${hasDisplayType ? "AND COALESCE(display_type, '') = ''" : ''}
       ORDER BY id`,
      { replacements: { orderId: o.id }, type: QueryTypes.SELECT }
    );

    for (const line of lines) {
      const productoId = productMap.get(line.product_id);
      if (!productoId) {
        stats.itemsVenta.skipped += 1;
        continue;
      }
      const cantidad = Math.max(1, Math.floor(Number(line.product_uom_qty) || 1));
      const precio = Number(line.price_unit) || 0;
      const descuentoPct = Number(line.discount) || 0;
      const lineSubtotal = Number(line.price_subtotal) || cantidad * precio * (1 - descuentoPct / 100);

      if (EXECUTE) {
        await ItemVenta.create(
          {
            ventaId,
            productoId,
            cantidad,
            precioBase: precio,
            precioModificado: precio,
            descuentoPct,
            iva: 0,
            subtotal: lineSubtotal,
            autorizadoPorAdmin: false
          },
          { transaction }
        );
      }
      stats.itemsVenta.inserted += 1;
    }
  }

  return orderMap;
}

async function migrateFacturas(odoo, present, clienteMap, sedeMap, orderMap, transaction) {
  console.log('→ Facturas');
  if (!present.account_move) {
    warn('Sin account_move: se omiten facturas');
    return;
  }

  const hasInvoiceOrigin = await columnExists(odoo, 'account_move', 'invoice_origin');
  const hasAmountUntaxed = await columnExists(odoo, 'account_move', 'amount_untaxed');
  const hasAmountTax = await columnExists(odoo, 'account_move', 'amount_tax');
  const hasInvoiceDateDue = await columnExists(odoo, 'account_move', 'invoice_date_due');

  const rows = await odoo.query(
    `SELECT id, name, partner_id, amount_total, payment_state, invoice_date,
            ${hasAmountUntaxed ? 'amount_untaxed' : 'amount_total AS amount_untaxed'},
            ${hasAmountTax ? 'amount_tax' : '0 AS amount_tax'},
            ${hasInvoiceOrigin ? 'invoice_origin' : 'NULL AS invoice_origin'},
            ${hasInvoiceDateDue ? 'invoice_date_due' : 'invoice_date AS invoice_date_due'}
     FROM account_move
     WHERE move_type = 'out_invoice'
       AND state = 'posted'
     ORDER BY id`,
    { type: QueryTypes.SELECT }
  );

  // Map sale order name → erp venta id
  const ventaByName = new Map();
  if (present.sale_order && orderMap.size) {
    const sos = await odoo.query(
      `SELECT id, name FROM sale_order WHERE state IN ('sale','done')`,
      { type: QueryTypes.SELECT }
    );
    for (const so of sos) {
      if (orderMap.has(so.id)) ventaByName.set(so.name, orderMap.get(so.id));
    }
  }

  for (const r of rows) {
    const clienteId = r.partner_id ? clienteMap.get(r.partner_id) : null;
    if (!clienteId) {
      stats.facturas.skipped += 1;
      continue;
    }

    let estado = 'pendiente';
    if (r.payment_state === 'paid') estado = 'pagada';
    else if (r.payment_state === 'partial') estado = 'abono_parcial';
    else if (r.payment_state === 'reversed') estado = 'anulada';

    const ventaId = r.invoice_origin ? ventaByName.get(r.invoice_origin) || null : null;
    const fechaVencimiento = r.invoice_date_due || r.invoice_date || new Date();

    if (EXECUTE) {
      await Factura.create(
        {
          numeroFactura: String(r.name || `FAC-${r.id}`).slice(0, 50),
          ventaId,
          ordenReparacionId: null,
          clienteId,
          sedeId: sedeMap.get('default'),
          subtotal: Number(r.amount_untaxed) || 0,
          iva: Number(r.amount_tax) || 0,
          total: Number(r.amount_total) || 0,
          estado,
          fechaVencimiento
        },
        { transaction }
      );
    }
    stats.facturas.inserted += 1;
  }
}

async function migrateCompras(odoo, present, productMap, proveedorMap, sedeMap, usuarioId, transaction) {
  console.log('→ Órdenes de compra');
  if (!present.purchase_order || !present.purchase_order_line) {
    warn('Sin purchase_order: se omiten compras');
    return;
  }

  const hasNotes = await columnExists(odoo, 'purchase_order', 'notes');
  const hasDatePlanned = await columnExists(odoo, 'purchase_order', 'date_planned');

  const orders = await odoo.query(
    `SELECT id, name, partner_id, amount_total, state, date_order,
            ${hasNotes ? 'notes' : 'NULL AS notes'},
            ${hasDatePlanned ? 'date_planned' : 'NULL AS date_planned'}
     FROM purchase_order
     WHERE state IN ('purchase', 'done')
     ORDER BY id`,
    { type: QueryTypes.SELECT }
  );

  for (const o of orders) {
    const proveedorId = o.partner_id ? proveedorMap.get(o.partner_id) : null;
    if (!proveedorId) {
      stats.ordenesCompra.skipped += 1;
      continue;
    }

    let estado = 'pendiente';
    if (o.state === 'done') estado = 'recibida';

    let ordenId;
    if (EXECUTE) {
      const orden = await OrdenCompra.create(
        {
          proveedorId,
          usuarioId,
          sedeId: sedeMap.get('default'),
          total: Number(o.amount_total) || 0,
          estado,
          estadoPago: 'pendiente',
          saldoPendiente: Number(o.amount_total) || 0,
          fechaEsperada: o.date_planned || null,
          observaciones: o.notes
            ? String(o.notes).slice(0, 2000)
            : `Migrado desde Odoo ${o.name || o.id}`
        },
        { transaction }
      );
      ordenId = orden.id;
    } else {
      ordenId = `dry-oc-${o.id}`;
    }
    stats.ordenesCompra.inserted += 1;

    const lines = await odoo.query(
      `SELECT id, product_id, product_qty, qty_received, price_unit
       FROM purchase_order_line
       WHERE order_id = :orderId
         AND product_id IS NOT NULL
       ORDER BY id`,
      { replacements: { orderId: o.id }, type: QueryTypes.SELECT }
    );

    for (const line of lines) {
      const productoId = productMap.get(line.product_id);
      if (!productoId) {
        stats.itemsCompra.skipped += 1;
        continue;
      }
      const cantidadPedida = Math.max(1, Math.floor(Number(line.product_qty) || 1));
      const cantidadRecibida = Math.max(0, Math.floor(Number(line.qty_received) || 0));

      if (EXECUTE) {
        await ItemOrdenCompra.create(
          {
            ordenCompraId: ordenId,
            productoId,
            cantidadPedida,
            cantidadRecibida,
            precioUnitario: Number(line.price_unit) || 0
          },
          { transaction }
        );
      }
      stats.itemsCompra.inserted += 1;
    }
  }
}

async function rebindUsuarios(sedeMap, transaction) {
  console.log('→ Reasignar usuarios a sede principal');
  const sedeId = sedeMap.get('default');
  if (!sedeId || !EXECUTE) return;
  await Usuario.update(
    { sedeId },
    { where: { sedeId: null }, transaction }
  );
}

function printReport(odooCounts) {
  console.log('\n========== RESUMEN ==========');
  if (odooCounts) {
    console.log('Origen Odoo (aprox.):');
    console.log(`  partners=${odooCounts.partners} templates=${odooCounts.templates} warehouses=${odooCounts.warehouses}`);
    console.log(`  quants=${odooCounts.quants} sales=${odooCounts.saleOrders} invoices=${odooCounts.invoices} purchases=${odooCounts.purchases}`);
  }
  console.log(`Modo: ${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}`);
  for (const [k, v] of Object.entries(stats)) {
    if (k === 'warnings') continue;
    console.log(`  ${k}: insertados=${v.inserted} omitidos=${v.skipped}`);
  }
  if (stats.warnings.length) {
    console.log(`Advertencias (${stats.warnings.length}):`);
    stats.warnings.forEach((w) => console.log(`  - ${w}`));
  }
  console.log('=============================\n');
}

async function main() {
  if (!DRY_RUN && !EXECUTE) {
    console.error('Indica --dry-run o --execute');
    console.error('  node scripts/migrate-odoo.js --dry-run');
    console.error('  node scripts/migrate-odoo.js --execute');
    process.exit(1);
  }
  if (DRY_RUN && EXECUTE) {
    console.error('Usa solo uno: --dry-run o --execute');
    process.exit(1);
  }

  console.log('Migración Odoo → ERP TechStore');
  console.log(`Destino: ${process.env.DB_NAME || 'erp_techstore'} @ ${process.env.DB_HOST || 'localhost'}`);
  console.log(`Origen:  ${process.env.ODOO_DB_NAME || 'odoo_db'} @ ${process.env.ODOO_DB_HOST || process.env.DB_HOST || 'localhost'}`);
  console.log('IMPORTANTE: haz backup de erp_techstore antes de --execute\n');

  const odoo = createOdooSequelize();

  try {
    await sequelize.authenticate();
    await odoo.authenticate();
    console.log('Conexiones OK\n');

    const present = await probeOdoo(odoo);
    const odooCounts = await countOdoo(odoo, present);
    console.log('\nConteos Odoo:', odooCounts, '\n');

    if (DRY_RUN) {
      console.log('DRY-RUN: no se escribirá en erp_techstore.');
      console.log('Se simulará el mapeo leyendo Odoo...\n');
    }

    const transaction = EXECUTE ? await sequelize.transaction() : null;

    try {
      if (EXECUTE) {
        await cleanErp(transaction);
      } else {
        console.log('(dry-run) se omitiría TRUNCATE de tablas de negocio\n');
      }

      const sedeMap = await migrateSedes(odoo, present, transaction);
      const catMap = await migrateCategorias(odoo, present, transaction);
      const productMap = await migrateProductos(odoo, present, catMap, transaction);
      const { clienteMap, proveedorMap } = await migratePartners(odoo, sedeMap, transaction);
      await migrateStock(odoo, present, productMap, sedeMap, transaction);

      let usuarioId = 'dry-user';
      if (EXECUTE) {
        usuarioId = await getDefaultUsuarioId(sedeMap, transaction);
      } else {
        const u = await Usuario.findOne({ where: { activo: true }, order: [['createdAt', 'ASC']] });
        if (!u) warn('No hay usuarios locales; en --execute se creará admin.migracion@local');
        else usuarioId = u.id;
      }

      const orderMap = await migrateVentas(
        odoo, present, productMap, clienteMap, sedeMap, usuarioId, transaction
      );
      await migrateFacturas(odoo, present, clienteMap, sedeMap, orderMap, transaction);
      await migrateCompras(
        odoo, present, productMap, proveedorMap, sedeMap, usuarioId, transaction
      );
      await rebindUsuarios(sedeMap, transaction);

      if (EXECUTE) {
        await transaction.commit();
        console.log('\nMigración aplicada correctamente.');
      }
    } catch (err) {
      if (transaction) await transaction.rollback();
      throw err;
    }

    printReport(odooCounts);
  } catch (err) {
    console.error('\nError en migración:', err.message);
    if (process.env.NODE_ENV === 'development') console.error(err);
    process.exitCode = 1;
  } finally {
    await odoo.close();
    await sequelize.close();
  }
}

main();
