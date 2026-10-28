import type { Handler } from '../types/controller';
import { requireUser } from '../utils/request-user';
import { transactionFinished } from '../utils/transaction-state';
import type { Attributes, CreationAttributes, WhereOptions, WhereAttributeHash, IncludeOptions } from 'sequelize';
import type ProductModel = require('../models/Producto');
import type SerieModel = require('../models/NumeroSerie');
import type CategoriaModel = require('../models/Categoria');
type Body = CreationAttributes<ProductModel> & { componentes?: unknown; ajusteStock?: number | string | null; sedeId?: string; reasignarA?: string };
import models = require('../models');
const { Producto, Categoria, Sede, StockSede, NumeroSerie, MovimientoInventario, ComboComponente, sequelize } = models;
import { Op } from 'sequelize';
import { generateInternalBarcode, normalizeCodigoBarras } from '../utils/internal-barcode';
import { normalizeUnidadMedida } from '../utils/unidad-medida';
import { validateComboComponents, replaceComboComponents, recalculateParentComboCosts, getComboAvailability } from '../utils/combo';

const comboInclude: IncludeOptions = {
  model: ComboComponente,
  as: 'componentes',
  separate: true,
  include: [{
    model: Producto,
    as: 'producto',
    attributes: ['id', 'nombre', 'codigoBarras', 'precioCosto', 'tieneNumeroSerie', 'unidadMedida', 'activo']
  }]
};

// --- CRUD PRODUCTOS ---

export const getProductos: Handler<Body> = async (req, res, next) => {
  try {
    const { categoria, q } = req.query;
    const where: WhereAttributeHash<Attributes<ProductModel>> & { [Op.or]?: WhereOptions<Attributes<ProductModel>>[] } = { activo: true };

    if (categoria) {
      where.categoriaId = categoria;
    }

    if (q) {
      where[Op.or] = [
        { nombre: { [Op.iLike]: `%${q}%` } },
        { codigoBarras: { [Op.iLike]: `%${q}%` } }
      ];
    }

    const productos = await Producto.findAll({
      where,
      include: [
        { model: Categoria, as: 'categoria', attributes: ['nombre'] },
        comboInclude
      ],
      order: [['nombre', 'ASC']]
    });

    return res.json(productos);
  } catch (error) {
    next(error);
  }
};

export const createProducto: Handler<Body> = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const {
      nombre,
      codigoBarras,
      descripcion,
      precioVenta,
      precioCosto,
      tieneIVA,
      stockMinimo,
      tieneNumeroSerie,
      esReacondicionado,
      esServicio,
      esCombo,
      componentes,
      unidadMedida,
      categoriaId,
      imagenUrl
    } = req.body;
    const combo = !!esCombo;
    const unidad = combo ? 'und' : normalizeUnidadMedida(unidadMedida);
    const comboData = combo
      ? await validateComboComponents({ componentes, transaction })
      : null;

    let codigoFinal = normalizeCodigoBarras(codigoBarras);
    if (!codigoFinal) {
      codigoFinal = await generateInternalBarcode(transaction);
    }

    // Verificar código duplicado (incluyendo inactivos)
    const existe = await Producto.findOne({ where: { codigoBarras: codigoFinal }, transaction });
    if (existe) {
      if (existe.activo) {
        await transaction.rollback();
        return res.status(400).json({ error: 'El código de barras ya está asignado a otro producto activo.' });
      } else {
        // Restaurarlo y actualizarlo con la nueva información
        await existe.update({
          nombre,
          descripcion,
          precioVenta,
          precioCosto: comboData ? comboData.precioCosto : precioCosto,
          tieneIVA,
          stockMinimo,
          tieneNumeroSerie: (esServicio || combo) ? false : !!tieneNumeroSerie,
          esReacondicionado,
          esServicio: combo ? false : !!esServicio,
          esCombo: combo,
          unidadMedida: unidad,
          categoriaId,
          imagenUrl,
          activo: true
        }, { transaction });

        if (combo && comboData) {
          await replaceComboComponents(existe.id, comboData.normalized, transaction);
        } else {
          await ComboComponente.destroy({ where: { comboId: existe.id }, transaction });
        }

        // Garantizar que tiene sus registros de StockSede inicializados
        const sedes = await Sede.findAll();
        for (const sede of sedes) {
          const stockReg = await StockSede.findOne({ where: { productoId: existe.id, sedeId: sede.id }, transaction });
          if (!stockReg) {
            await StockSede.create({
              productoId: existe.id,
              sedeId: sede.id,
              cantidad: 0
            }, { transaction });
          }
        }

        await transaction.commit();

        if (req.logAudit) {
          await req.logAudit({
            accion: 'CREATE',
            modulo: 'Productos',
            registroId: existe.id,
            valorNuevo: existe.toJSON()
          });
        }

        return res.status(201).json(existe);
      }
    }

    const producto = await Producto.create({
      nombre,
      codigoBarras: codigoFinal,
      descripcion,
      precioVenta,
      precioCosto: comboData ? comboData.precioCosto : precioCosto,
      tieneIVA,
      stockMinimo,
      tieneNumeroSerie: (esServicio || combo) ? false : !!tieneNumeroSerie,
      esReacondicionado,
      esServicio: combo ? false : !!esServicio,
      esCombo: combo,
      unidadMedida: unidad,
      categoriaId,
      imagenUrl
    }, { transaction });

    if (combo && comboData) {
      await replaceComboComponents(producto.id, comboData.normalized, transaction);
    }

    // Inicializar el StockSede en 0 para todas las sedes de forma predeterminada
    const sedes = await Sede.findAll();
    for (const sede of sedes) {
      await StockSede.create({
        productoId: producto.id,
        sedeId: sede.id,
        cantidad: 0
      }, { transaction });
    }

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Productos',
        registroId: producto.id,
        valorNuevo: producto.toJSON()
      });
    }

    return res.status(201).json(producto);
  } catch (error) {
    if (!transactionFinished(transaction)) await transaction.rollback();
    next(error);
  } finally {
    if (!transactionFinished(transaction)) await transaction.rollback();
  }
};

export const updateProducto: Handler<Body> = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { id } = req.params;
    const producto = await Producto.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });

    if (!producto) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    const { codigoBarras } = req.body;
    if (codigoBarras && codigoBarras !== producto.codigoBarras) {
      const existe = await Producto.findOne({ where: { codigoBarras }, transaction });
      if (existe) {
        await transaction.rollback();
        return res.status(400).json({ error: 'El código de barras ya está asignado a otro producto (activo o inactivo).' });
      }
    }

    const { ajusteStock, sedeId, componentes, ...productData } = req.body;
    const combo = productData.esCombo !== undefined ? !!productData.esCombo : !!producto.esCombo;
    const comboData = combo
      ? await validateComboComponents({ comboId: id, componentes, transaction })
      : null;

    const usadoComoComponente = await ComboComponente.findOne({ where: { productoId: id }, transaction });
    if (usadoComoComponente && (combo || productData.esServicio)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Este producto forma parte de un combo activo y debe seguir siendo un producto físico.' });
    }

    if (combo && !producto.esCombo) {
      const stockExistente = await StockSede.sum('cantidad', { where: { productoId: id }, transaction });
      const serialesExistentes = await NumeroSerie.count({ where: { productoId: id }, transaction });
      if ((Number(stockExistente) || 0) > 0 || serialesExistentes > 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Para convertir un producto existente en combo, primero debe dejar su stock y seriales en cero.' });
      }
    }

    if (combo && comboData) {
      productData.esCombo = true;
      productData.esServicio = false;
      productData.tieneNumeroSerie = false;
      productData.unidadMedida = 'und';
      productData.stockMinimo = 0;
      productData.precioCosto = comboData.precioCosto;
    } else if (productData.esServicio) {
      productData.esCombo = false;
      productData.esServicio = true;
      productData.tieneNumeroSerie = false;
    } else if (productData.esServicio === false || String(productData.esServicio) === 'false') {
      productData.esServicio = false;
      productData.esCombo = false;
    }

    if (productData.unidadMedida !== undefined) {
      productData.unidadMedida = normalizeUnidadMedida(productData.unidadMedida);
    }

    const rolesAjusteStock = ['admin', 'superadmin'];
    if (!combo && rolesAjusteStock.includes(requireUser(req).rol) && sedeId && ajusteStock !== undefined && ajusteStock !== null) {
      const stockNuevo = parseInt(String(ajusteStock), 10);
      if (Number.isNaN(stockNuevo) || stockNuevo < 0) {
        await transaction.rollback();
        return res.status(400).json({ error: 'La cantidad de existencias debe ser un número mayor o igual a 0.' });
      }

      const [stockSede] = await StockSede.findOrCreate({
        where: { productoId: id, sedeId },
        defaults: { productoId: id, sedeId, cantidad: 0 },
        transaction
      });

      const cantidadAnterior = parseInt(String(stockSede.cantidad), 10);
      if (cantidadAnterior !== stockNuevo) {
        await stockSede.update({ cantidad: stockNuevo }, { transaction });

        await MovimientoInventario.create({
          productoId: id,
          sedeId,
          tipo: stockNuevo > cantidadAnterior ? 'entrada' : 'salida',
          cantidad: Math.abs(stockNuevo - cantidadAnterior),
          motivo: `Ajuste manual de inventario por ${requireUser(req).rol}`,
          usuarioId: requireUser(req).userId
        }, { transaction });
      }
    }

    const valorAnterior = producto.toJSON();
    await producto.update(productData, { transaction });
    if (combo && comboData) {
      await replaceComboComponents(id, comboData.normalized, transaction);
    } else {
      await ComboComponente.destroy({ where: { comboId: id }, transaction });
      await recalculateParentComboCosts(id, transaction);
    }
    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Productos',
        registroId: producto.id,
        valorAnterior,
        valorNuevo: producto.toJSON()
      });
    }

    return res.json(producto);
  } catch (error) {
    if (!transactionFinished(transaction)) await transaction.rollback();
    next(error);
  } finally {
    if (!transactionFinished(transaction)) await transaction.rollback();
  }
};

export const deleteProducto: Handler<Body> = async (req, res, next) => {
  try {
    const { id } = req.params;
    const producto = await Producto.findByPk(id);

    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    const usadoEnCombo = await ComboComponente.findOne({
      where: { productoId: id },
      include: [{ model: Producto, as: 'combo', where: { activo: true }, attributes: ['nombre'] }]
    });
    if (usadoEnCombo) {
      return res.status(400).json({
        error: `No se puede eliminar porque forma parte del combo ${usadoEnCombo.combo?.nombre || 'activo'}.`
      });
    }

    const valorAnterior = producto.toJSON();
    
    // Eliminación lógica
    await producto.update({ activo: false });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'DELETE',
        modulo: 'Productos',
        registroId: id,
        valorAnterior
      });
    }

    return res.json({ message: 'Producto eliminado exitosamente.' });
  } catch (error) {
    next(error);
  }
};

// --- BÚSQUEDA POR CÓDIGO DE BARRAS ---

export const getProductoByBarcode: Handler<Body> = async (req, res, next) => {
  try {
    const { codigo } = req.params;
    const { sedeId } = req.query; // Para incluir opcionalmente existencias en la sede del cajero

    const include: IncludeOptions[] = [
      { model: Categoria, as: 'categoria', attributes: ['nombre'] },
      comboInclude
    ];

    if (sedeId) {
      include.push({
        model: StockSede,
        as: 'stocks',
        where: { sedeId },
        required: false,
        attributes: ['cantidad']
      });
    }

    let producto = await Producto.findOne({
      where: { codigoBarras: codigo, activo: true },
      include
    });

    let autoDetectedImei = null;

    if (!producto) {
      // Buscar si el código corresponde a un número de serie / IMEI en stock
      const querySedeId = sedeId || (requireUser(req) ? requireUser(req).sedeId : null);
      const serieWhere: WhereOptions<Attributes<SerieModel>> = { serie: codigo, estado: 'en_stock' };
      if (querySedeId) {
        serieWhere.sedeId = querySedeId;
      }
      
      const serieObj = await NumeroSerie.findOne({
        where: serieWhere
      });

      if (serieObj) {
        autoDetectedImei = serieObj.serie;
        producto = await Producto.findOne({
          where: { id: serieObj.productoId, activo: true },
          include
        });
      }
    }

    if (!producto) {
      return res.status(404).json({ error: 'Producto o Serial no encontrado en stock.' });
    }

    const responseData = producto.toJSON<Attributes<ProductModel> & { stocks?: { cantidad: number }[]; disponibilidadCombo?: number; autoDetectedImei?: string }>();
    if (producto.esCombo && sedeId) {
      const disponibilidad = await getComboAvailability(producto.id, sedeId);
      responseData.disponibilidadCombo = disponibilidad.cantidad;
      responseData.stocks = [{ cantidad: disponibilidad.cantidad }];
    }
    if (autoDetectedImei) {
      responseData.autoDetectedImei = autoDetectedImei;
    }

    return res.json(responseData);
  } catch (error) {
    next(error);
  }
};

// --- IMPORTACIÓN MASIVA DESDE CSV ---

export const importarCSV: Handler<Body> = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Por favor, suba un archivo CSV.' });
  }

  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const csvData = req.file.buffer.toString('utf8');
    const lines = csvData.split(/\r?\n/);
    if (lines.length <= 1) {
      return res.status(400).json({ error: 'El archivo CSV está vacío o no contiene filas.' });
    }

    // Cabecera: nombre,codigoBarras,descripcion,precioVenta,precioCosto,tieneIVA,stockMinimo,tieneNumeroSerie,esReacondicionado,categoriaNombre
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const sedes = await Sede.findAll();
    const productosCreados = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Soporte simple para comas dentro de comillas
      const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
      const values = matches.map(v => v.trim().replace(/^"|"$/g, ''));

      // Mapear campos
      const row: Record<string, string | undefined> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx];
      });

      if (!row.nombre || !row.precioVenta || !row.precioCosto || !row.categoriaNombre) {
        continue; // Saltar filas incompletas
      }

      let codigoFila = normalizeCodigoBarras(row.codigoBarras);
      if (!codigoFila) {
        codigoFila = await generateInternalBarcode(transaction);
      }

      // Buscar o crear la categoría
      let categoria = await Categoria.findOne({ where: { nombre: row.categoriaNombre } });
      if (!categoria) {
        categoria = await Categoria.create({
          nombre: row.categoriaNombre,
          descripcion: 'Categoría auto-creada por importación masiva'
        }, { transaction });
      }

      // Evitar duplicados de código de barras (tanto activos como inactivos)
      const existe = await Producto.findOne({ where: { codigoBarras: codigoFila }, transaction });
      if (existe) {
        continue; // Saltar duplicados
      }

      const esServicioBool = row.esServicio === 'true' || row.esServicio === '1';

      const producto = await Producto.create({
        nombre: row.nombre,
        codigoBarras: codigoFila,
        descripcion: row.descripcion || '',
        precioVenta: parseFloat(String(row.precioVenta)),
        precioCosto: parseFloat(String(row.precioCosto)),
        tieneIVA: row.tieneIVA === 'true' || row.tieneIVA === '1',
        stockMinimo: parseInt(String(row.stockMinimo || 0)),
        tieneNumeroSerie: esServicioBool ? false : (row.tieneNumeroSerie === 'true' || row.tieneNumeroSerie === '1'),
        esReacondicionado: row.esReacondicionado === 'true' || row.esReacondicionado === '1',
        esServicio: esServicioBool,
        unidadMedida: normalizeUnidadMedida(row.unidadMedida),
        categoriaId: categoria.id,
        imagenUrl: row.imagenUrl || null
      }, { transaction });

      // Inicializar Stock para todas las sedes (soportando stock / stockInicial del CSV)
      const stockInicial = parseInt(String(row.stock || row.stockInicial || row.cantidadInicial || 0));
      for (const sede of sedes) {
        await StockSede.create({
          productoId: producto.id,
          sedeId: sede.id,
          cantidad: stockInicial
        }, { transaction });
      }

      productosCreados.push(producto.nombre);
    }

    await transaction.commit();

    if (req.logAudit && productosCreados.length > 0) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Productos',
        registroId: 'CSV_IMPORT',
        valorNuevo: { count: productosCreados.length, items: productosCreados }
      });
    }

    return res.json({
      message: `Importación exitosa. Se crearon ${productosCreados.length} productos.`,
      productos: productosCreados
    });
  } catch (error) {
    if (!transactionFinished(transaction)) await transaction.rollback();
    next(error);
  } finally {
    if (!transactionFinished(transaction)) await transaction.rollback();
  }
};

// --- GENERAR CÓDIGO INTERNO (sin persistir) ---

export const generarCodigoInterno: Handler<Body> = async (req, res, next) => {
  try {
    const codigoBarras = await generateInternalBarcode();
    return res.json({ codigoBarras });
  } catch (error) {
    next(error);
  }
};

// --- CATEGORÍAS ---

export const getCategorias: Handler<Body> = async (req, res, next) => {
  try {
    const categorias = await Categoria.findAll({
      attributes: {
        include: [[sequelize.fn('COUNT', sequelize.col('productos.id')), 'productCount']]
      },
      include: [{ model: Producto, as: 'productos', attributes: [], required: false }],
      group: ['Categoria.id'],
      order: [['nombre', 'ASC']],
      subQuery: false
    });

    return res.json(categorias.map((c) => {
      const json = c.toJSON<Attributes<CategoriaModel> & { productCount: number | string }>();
      json.productCount = parseInt(String(json.productCount), 10) || 0;
      return json;
    }));
  } catch (error) {
    next(error);
  }
};

export const createCategoria: Handler<Body> = async (req, res, next) => {
  try {
    const { nombre, descripcion } = req.body;
    if (!nombre) {
      return res.status(400).json({ error: 'El nombre de la categoría es obligatorio.' });
    }

    const nombreTrim = String(nombre).trim();
    if (!nombreTrim) {
      return res.status(400).json({ error: 'El nombre de la categoría es obligatorio.' });
    }

    const existe = await Categoria.findOne({ where: { nombre: nombreTrim } });
    if (existe) {
      return res.status(400).json({ error: 'Ya existe una categoría con ese nombre.' });
    }

    const categoria = await Categoria.create({
      nombre: nombreTrim,
      descripcion: descripcion || ''
    });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Productos',
        registroId: categoria.id,
        valorNuevo: categoria.toJSON()
      });
    }

    return res.status(201).json({ ...categoria.toJSON(), productCount: 0 });
  } catch (error) {
    next(error);
  }
};

export const updateCategoria: Handler<Body> = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion } = req.body;

    const categoria = await Categoria.findByPk(id);
    if (!categoria) {
      return res.status(404).json({ error: 'La categoría no existe.' });
    }

    const valorAnterior = categoria.toJSON();
    const patch: Partial<Attributes<CategoriaModel>> = {};

    if (nombre !== undefined) {
      const nombreTrim = String(nombre).trim();
      if (!nombreTrim) {
        return res.status(400).json({ error: 'El nombre de la categoría no puede quedar vacío.' });
      }
      const existe = await Categoria.findOne({
        where: { nombre: nombreTrim, id: { [Op.ne]: id } }
      });
      if (existe) {
        return res.status(400).json({ error: 'Ya existe una categoría con ese nombre.' });
      }
      patch.nombre = nombreTrim;
    }

    if (descripcion !== undefined) {
      patch.descripcion = descripcion == null ? '' : String(descripcion);
    }

    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'No hay cambios para guardar.' });
    }

    await categoria.update(patch);
    const productCount = await Producto.count({ where: { categoriaId: id } });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Productos',
        registroId: id,
        valorAnterior,
        valorNuevo: categoria.toJSON()
      });
    }

    return res.json({ ...categoria.toJSON(), productCount });
  } catch (error) {
    next(error);
  }
};

export const deleteCategoria: Handler<Body> = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { id } = req.params;
    const reasignarA = req.body?.reasignarA || req.query?.reasignarA || null;

    const categoria = await Categoria.findByPk(id, { transaction });
    if (!categoria) {
      await transaction.rollback();
      return res.status(404).json({ error: 'La categoría no existe.' });
    }

    const productosAsociados = await Producto.count({ where: { categoriaId: id }, transaction });
    if (productosAsociados > 0) {
      if (!reasignarA) {
        await transaction.rollback();
        return res.status(400).json({
          error: `Hay ${productosAsociados} producto(s) en esta categoría. Reasigna a otra categoría para poder eliminarla.`,
          productCount: productosAsociados,
          requiereReasignar: true
        });
      }
      if (String(reasignarA) === String(id)) {
        await transaction.rollback();
        return res.status(400).json({ error: 'La categoría destino debe ser distinta.' });
      }
      const destino = await Categoria.findByPk(reasignarA, { transaction });
      if (!destino) {
        await transaction.rollback();
        return res.status(400).json({ error: 'La categoría destino no existe.' });
      }
      await Producto.update(
        { categoriaId: reasignarA },
        { where: { categoriaId: id }, transaction }
      );
    }

    const valorAnterior = categoria.toJSON();
    await categoria.destroy({ transaction });
    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'DELETE',
        modulo: 'Productos',
        registroId: id,
        valorAnterior
      });
    }

    return res.json({
      message: productosAsociados > 0
        ? `Categoría eliminada. ${productosAsociados} producto(s) reasignado(s).`
        : 'Categoría eliminada correctamente.',
      reasignados: productosAsociados
    });
  } catch (error) {
    if (!transactionFinished(transaction)) await transaction.rollback();
    next(error);
  } finally {
    if (!transactionFinished(transaction)) await transaction.rollback();
  }
};
