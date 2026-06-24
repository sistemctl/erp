const { Producto, Categoria, Sede, StockSede, sequelize } = require('../models');
const { Op } = require('sequelize');

// --- CRUD PRODUCTOS ---

exports.getProductos = async (req, res, next) => {
  try {
    const { categoria, q } = req.query;
    const where = { activo: true };

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
      include: [{ model: Categoria, as: 'categoria', attributes: ['nombre'] }],
      order: [['nombre', 'ASC']]
    });

    return res.json(productos);
  } catch (error) {
    next(error);
  }
};

exports.createProducto = async (req, res, next) => {
  const transaction = await sequelize.transaction();
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
      categoriaId,
      imagenUrl
    } = req.body;

    // Verificar código duplicado
    const existe = await Producto.findOne({ where: { codigoBarras, activo: true } });
    if (existe) {
      return res.status(400).json({ error: 'El código de barras ya está asignado a otro producto.' });
    }

    const producto = await Producto.create({
      nombre,
      codigoBarras,
      descripcion,
      precioVenta,
      precioCosto,
      tieneIVA,
      stockMinimo,
      tieneNumeroSerie,
      esReacondicionado,
      categoriaId,
      imagenUrl
    }, { transaction });

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
    await transaction.rollback();
    next(error);
  }
};

exports.updateProducto = async (req, res, next) => {
  try {
    const { id } = req.params;
    const producto = await Producto.findByPk(id);

    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    const { codigoBarras } = req.body;
    if (codigoBarras && codigoBarras !== producto.codigoBarras) {
      const existe = await Producto.findOne({ where: { codigoBarras, activo: true } });
      if (existe) {
        return res.status(400).json({ error: 'El código de barras ya está asignado a otro producto.' });
      }
    }

    const valorAnterior = producto.toJSON();
    await producto.update(req.body);

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
    next(error);
  }
};

exports.deleteProducto = async (req, res, next) => {
  try {
    const { id } = req.params;
    const producto = await Producto.findByPk(id);

    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
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

exports.getProductoByBarcode = async (req, res, next) => {
  try {
    const { codigo } = req.params;
    const { sedeId } = req.query; // Para incluir opcionalmente existencias en la sede del cajero

    const include = [{ model: Categoria, as: 'categoria', attributes: ['nombre'] }];

    if (sedeId) {
      include.push({
        model: StockSede,
        as: 'stocks',
        where: { sedeId },
        required: false,
        attributes: ['cantidad']
      });
    }

    const producto = await Producto.findOne({
      where: { codigoBarras: codigo, activo: true },
      include
    });

    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado con el código de barras provisto.' });
    }

    return res.json(producto);
  } catch (error) {
    next(error);
  }
};

// --- IMPORTACIÓN MASIVA DESDE CSV ---

exports.importarCSV = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Por favor, suba un archivo CSV.' });
  }

  const transaction = await sequelize.transaction();
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
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx];
      });

      if (!row.nombre || !row.codigoBarras || !row.precioVenta || !row.precioCosto || !row.categoriaNombre) {
        continue; // Saltar filas incompletas
      }

      // Buscar o crear la categoría
      let categoria = await Categoria.findOne({ where: { nombre: row.categoriaNombre } });
      if (!categoria) {
        categoria = await Categoria.create({
          nombre: row.categoriaNombre,
          descripcion: 'Categoría auto-creada por importación masiva'
        }, { transaction });
      }

      // Evitar duplicados de código de barras
      const existe = await Producto.findOne({ where: { codigoBarras: row.codigoBarras, activo: true } });
      if (existe) {
        continue; // Saltar duplicados
      }

      const producto = await Producto.create({
        nombre: row.nombre,
        codigoBarras: row.codigoBarras,
        descripcion: row.descripcion || '',
        precioVenta: parseFloat(row.precioVenta),
        precioCosto: parseFloat(row.precioCosto),
        tieneIVA: row.tieneIVA === 'true' || row.tieneIVA === '1',
        stockMinimo: parseInt(row.stockMinimo || 0),
        tieneNumeroSerie: row.tieneNumeroSerie === 'true' || row.tieneNumeroSerie === '1',
        esReacondicionado: row.esReacondicionado === 'true' || row.esReacondicionado === '1',
        categoriaId: categoria.id,
        imagenUrl: row.imagenUrl || null
      }, { transaction });

      // Inicializar Stock en 0 para todas las sedes
      for (const sede of sedes) {
        await StockSede.create({
          productoId: producto.id,
          sedeId: sede.id,
          cantidad: 0
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
    await transaction.rollback();
    next(error);
  }
};
