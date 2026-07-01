const { TradeIn, Producto, Categoria, StockSede, NumeroSerie, Cliente, Sede, Usuario, sequelize } = require('../models');
const { resolveQuerySede, resolveActionSede } = require('../utils/sede');

// --- GET ALL TRADE-INS ---
exports.getTradeIns = async (req, res, next) => {
  try {
    const { sede, cliente } = req.query;
    const where = {};

    const querySedeId = resolveQuerySede(sede, req.usuario);
    if (querySedeId) {
      where.sedeId = querySedeId;
    }

    if (cliente) {
      where.clienteId = cliente;
    }

    const tradeIns = await TradeIn.findAll({
      where,
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'documento', 'telefono'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        { model: Usuario, as: 'usuario', attributes: ['nombre'] },
        { model: Producto, as: 'productoInventario', attributes: ['nombre', 'codigoBarras'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json(tradeIns);
  } catch (error) {
    next(error);
  }
};

// --- REGISTRAR TRADE-IN ---
exports.registrarTradeIn = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { clienteId, tipoEquipo, marca, modelo, imei, estadoFisico, valoracion, ventaId, sedeId: bodySedeId } = req.body;
    const sedeId = await resolveActionSede(bodySedeId, req.usuario, Sede, transaction);
    const usuarioId = req.usuario.userId;

    if (!sedeId) {
      return res.status(400).json({ error: 'Debe seleccionar una sede para el trade-in.' });
    }

    if (!clienteId || !tipoEquipo || !marca || !modelo || !estadoFisico || !valoracion) {
      return res.status(400).json({ error: 'Datos de trade-in incompletos.' });
    }

    // 1. Obtener o crear categoría "Equipos Reacondicionados"
    const [categoria] = await Categoria.findOrCreate({
      where: { nombre: 'Equipos Reacondicionados' },
      defaults: { descripcion: 'Dispositivos de clientes recibidos como parte de pago' },
      transaction
    });

    // 2. Definir código de barras (usar IMEI o autogenerado si no hay IMEI)
    const serial = imei || `TRD-${Date.now()}`;
    
    // Verificar si ya existe un producto con el mismo código de barras
    let productoExistente = await Producto.findOne({ where: { codigoBarras: serial }, transaction });
    if (productoExistente) {
      return res.status(400).json({ error: `Ya existe un producto registrado en el sistema con el IMEI/Código ${serial}.` });
    }

    // 3. Crear el Producto Reacondicionado en el catálogo
    const prodVal = parseFloat(valoracion);
    const precioSugerido = prodVal * 1.30; // 30% de incremento sugerido para venta de reacondicionados

    const producto = await Producto.create({
      nombre: `[Usado] ${marca} ${modelo} (${estadoFisico.toUpperCase()})`,
      codigoBarras: serial,
      descripcion: `Equipo recibido en Trade-In de cliente. Marca: ${marca}, Modelo: ${modelo}, Estado: ${estadoFisico}. IMEI: ${serial}`,
      precioCosto: prodVal,
      precioVenta: precioSugerido,
      tieneIVA: false,
      stockMinimo: 0,
      tieneNumeroSerie: true,
      esReacondicionado: true,
      categoriaId: categoria.id,
      activo: true
    }, { transaction });

    // 4. Registrar Stock en la Sede actual
    await StockSede.create({
      productoId: producto.id,
      sedeId,
      cantidad: 1
    }, { transaction });

    // 5. Registrar el Número de Serie / IMEI
    await NumeroSerie.create({
      productoId: producto.id,
      sedeId,
      serial,
      estado: 'en_stock',
      clienteId: null,
      fechaCompra: new Date()
    }, { transaction });

    // 6. Registrar el Trade-In
    const tradeIn = await TradeIn.create({
      clienteId,
      sedeId,
      usuarioId,
      tipoEquipo,
      marca,
      modelo,
      imei: serial,
      estadoFisico,
      valoracion: prodVal,
      ventaId: ventaId || null,
      productoInventarioId: producto.id
    }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'TradeIn',
        registroId: tradeIn.id,
        valorNuevo: tradeIn.toJSON()
      });
    }

    return res.status(201).json(tradeIn);
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};
