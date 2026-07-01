const {
  sequelize,
  Sede,
  Usuario,
  Categoria,
  Producto,
  StockSede,
  CategoriaEgreso,
  ConfiguracionSistema
} = require('../models');

const runSeeder = async () => {
  try {
    console.log('Iniciando carga de datos semilla...');

    // Limpiar tablas existentes en orden de dependencia
    await sequelize.query('TRUNCATE TABLE "AuditLogs" CASCADE;');
    await sequelize.query('TRUNCATE TABLE "StockSedes" CASCADE;');
    await sequelize.query('TRUNCATE TABLE "Productos" CASCADE;');
    await sequelize.query('TRUNCATE TABLE "Categorias" CASCADE;');
    await sequelize.query('TRUNCATE TABLE "Usuarios" CASCADE;');
    await sequelize.query('TRUNCATE TABLE "Sedes" CASCADE;');
    await sequelize.query('TRUNCATE TABLE "CategoriasEgreso" CASCADE;');
    await sequelize.query('TRUNCATE TABLE "ConfiguracionesSistema" CASCADE;');

    // 1. Crear Sedes
    const sedes = await Sede.bulkCreate([
      { nombre: 'Sede Centro', direccion: 'Carrera 7 #12-45, Bogotá', telefono: '601-3456789', activa: true },
      { nombre: 'Sede Norte', direccion: 'Avenida Pepe Sierra #116-40, Bogotá', telefono: '601-7654321', activa: true },
      { nombre: 'Sede Sur', direccion: 'Centro Comercial Plaza de las Américas, Bogotá', telefono: '601-9876543', activa: true }
    ]);
    console.log('Sedes creadas con éxito.');

    // 2. Crear Usuarios (uno por rol)
    const usuarios = await Usuario.bulkCreate([
      {
        nombre: 'Admin TechStore',
        email: 'admin@techstore.com',
        password: 'admin123',
        rol: 'admin',
        sedeId: sedes[0].id,
        activo: true
      },
      {
        nombre: 'Gerente Norte',
        email: 'gerente@techstore.com',
        password: 'gerente123',
        rol: 'gerente_sede',
        sedeId: sedes[1].id,
        activo: true
      },
      {
        nombre: 'Cajero Centro',
        email: 'cajero@techstore.com',
        password: 'cajero123',
        rol: 'cajero',
        sedeId: sedes[0].id,
        activo: true
      },
      {
        nombre: 'Técnico Sur',
        email: 'tecnico@techstore.com',
        password: 'tecnico123',
        rol: 'tecnico',
        sedeId: sedes[2].id,
        activo: true
      },
      {
        nombre: 'Contador General',
        email: 'contador@techstore.com',
        password: 'contador123',
        rol: 'contador',
        sedeId: sedes[0].id,
        activo: true
      }
    ], { individualHooks: true }); // Para que ejecute el hook beforeSave e encripte contraseñas
    console.log('Usuarios creados con éxito.');

    // 3. Crear Categorías
    const categorias = await Categoria.bulkCreate([
      { nombre: 'Computadores', descripcion: 'Laptops, Torres y Todo en Uno' },
      { nombre: 'Celulares', descripcion: 'iPhones, Smartphones Android y accesorios' },
      { nombre: 'Consolas', descripcion: 'PlayStation, Nintendo, Xbox y accesorios' },
      { nombre: 'Repuestos', descripcion: 'Pantallas, baterías, Flexores, cargadores internos' },
      { nombre: 'Accesorios', descripcion: 'Cargadores, Audífonos, Protectores' },
      { nombre: 'Audio', descripcion: 'Parlantes, Barras de Sonido, Equipos' },
      { nombre: 'Almacenamiento', descripcion: 'Discos SSD, Memorias USB, SD' },
      { nombre: 'Componentes', descripcion: 'Procesadores, Memorias RAM, Placas base' },
      { nombre: 'Software', descripcion: 'Sistemas Operativos, Licencias' },
      { nombre: 'Gaming', descripcion: 'Sillas, ratones y teclados gamer' }
    ]);
    console.log('Categorías creadas con éxito.');

    // 4. Crear 20 Productos
    const productos = await Producto.bulkCreate([
      { nombre: 'MacBook Air M2 8GB/256GB', codigoBarras: '0190199312345', descripcion: 'MacBook Air M2 color gris espacial', precioVenta: 4899900.00, precioCosto: 3800000.00, tieneIVA: true, stockMinimo: 3, tieneNumeroSerie: true, esReacondicionado: false, categoriaId: categorias[0].id },
      { nombre: 'iPhone 15 Pro Max 256GB', codigoBarras: '0190199543210', descripcion: 'iPhone 15 Pro Max Titanio Natural', precioVenta: 5499900.00, precioCosto: 4300000.00, tieneIVA: true, stockMinimo: 2, tieneNumeroSerie: true, esReacondicionado: false, categoriaId: categorias[1].id },
      { nombre: 'PlayStation 5 Slim 1TB', codigoBarras: '0711719548321', descripcion: 'Consola PlayStation 5 edición digital', precioVenta: 2499900.00, precioCosto: 1950000.00, tieneIVA: true, stockMinimo: 4, tieneNumeroSerie: true, esReacondicionado: false, categoriaId: categorias[2].id },
      { nombre: 'Pantalla iPhone 13 Pro OEM', codigoBarras: '8880010020030', descripcion: 'Repuesto pantalla OLED de alta calidad', precioVenta: 650000.00, precioCosto: 420000.00, tieneIVA: false, stockMinimo: 5, tieneNumeroSerie: false, esReacondicionado: false, categoriaId: categorias[3].id },
      { nombre: 'Batería MacBook Pro 13 2020', codigoBarras: '8880010020047', descripcion: 'Batería de repuesto para A2289 A2251', precioVenta: 380000.00, precioCosto: 210000.00, tieneIVA: false, stockMinimo: 3, tieneNumeroSerie: false, esReacondicionado: false, categoriaId: categorias[3].id },
      { nombre: 'Cargador Apple USB-C 20W', codigoBarras: '0190199222222', descripcion: 'Adaptador de corriente USB-C original', precioVenta: 119900.00, precioCosto: 60000.00, tieneIVA: true, stockMinimo: 10, tieneNumeroSerie: false, esReacondicionado: false, categoriaId: categorias[4].id },
      { nombre: 'Audífonos AirPods Pro 2', codigoBarras: '0190199333333', descripcion: 'AirPods Pro con estuche de carga USB-C', precioVenta: 1149900.00, precioCosto: 850000.00, tieneIVA: true, stockMinimo: 5, tieneNumeroSerie: true, esReacondicionado: false, categoriaId: categorias[4].id },
      { nombre: 'SSD Kingston NV2 1TB NVMe', codigoBarras: '0740617333336', descripcion: 'Disco estado sólido PCIe 4.0 M.2', precioVenta: 280000.00, precioCosto: 190000.00, tieneIVA: true, stockMinimo: 8, tieneNumeroSerie: false, esReacondicionado: false, categoriaId: categorias[6].id },
      { nombre: 'Memoria RAM DDR4 16GB Kingston', codigoBarras: '0740617222222', descripcion: 'Memoria RAM Fury Beast 3200Mhz', precioVenta: 210000.00, precioCosto: 140000.00, tieneIVA: true, stockMinimo: 10, tieneNumeroSerie: false, esReacondicionado: false, categoriaId: categorias[7].id },
      { nombre: 'Mouse Logitech G203 Lightsync', codigoBarras: '0097855155856', descripcion: 'Mouse gamer cableado RGB color negro', precioVenta: 120000.00, precioCosto: 75000.00, tieneIVA: true, stockMinimo: 15, tieneNumeroSerie: false, esReacondicionado: false, categoriaId: categorias[9].id },
      { nombre: 'Teclado Mecánico Redragon Kumara', codigoBarras: '0695037674512', descripcion: 'Teclado TKL interruptores azules', precioVenta: 220000.00, precioCosto: 135000.00, tieneIVA: true, stockMinimo: 8, tieneNumeroSerie: false, esReacondicionado: false, categoriaId: categorias[9].id },
      { nombre: 'Nintendo Switch OLED 64GB', codigoBarras: '0045496590094', descripcion: 'Nintendo Switch pantalla OLED Blanco', precioVenta: 1799900.00, precioCosto: 1350000.00, tieneIVA: true, stockMinimo: 3, tieneNumeroSerie: true, esReacondicionado: false, categoriaId: categorias[2].id },
      { nombre: 'iPhone 13 128GB Reacondicionado', codigoBarras: '0190199999999', descripcion: 'iPhone 13 color Azul grado A', precioVenta: 2300000.00, precioCosto: 1600000.00, tieneIVA: true, stockMinimo: 1, tieneNumeroSerie: true, esReacondicionado: true, categoriaId: categorias[1].id },
      { nombre: 'iPad 9a Gen 64GB WiFi', codigoBarras: '0194252445123', descripcion: 'iPad color Gris Espacial de 10.2 pulgadas', precioVenta: 1699900.00, precioCosto: 1250000.00, tieneIVA: true, stockMinimo: 4, tieneNumeroSerie: true, esReacondicionado: false, categoriaId: categorias[0].id },
      { nombre: 'Licencia Windows 11 Pro OEM', codigoBarras: '0885370922254', descripcion: 'Clave de activación original Windows 11', precioVenta: 150000.00, precioCosto: 60000.00, tieneIVA: true, stockMinimo: 100, tieneNumeroSerie: false, esReacondicionado: false, categoriaId: categorias[8].id },
      { nombre: 'Cable HDMI 2.1 Ugreen 2M', codigoBarras: '6957303813444', descripcion: 'Cable HDMI 8K ultra velocidad', precioVenta: 45000.00, precioCosto: 22000.00, tieneIVA: true, stockMinimo: 20, tieneNumeroSerie: false, esReacondicionado: false, categoriaId: categorias[4].id },
      { nombre: 'SSD Externo Samsung T7 1TB', codigoBarras: '0887276412345', descripcion: 'SSD portátil USB 3.2 color azul', precioVenta: 499900.00, precioCosto: 380000.00, tieneIVA: true, stockMinimo: 5, tieneNumeroSerie: true, esReacondicionado: false, categoriaId: categorias[6].id },
      { nombre: 'Control PS5 DualSense Blanco', codigoBarras: '0711719541346', descripcion: 'Control inalámbrico para PS5', precioVenta: 329900.00, precioCosto: 240000.00, tieneIVA: true, stockMinimo: 6, tieneNumeroSerie: false, esReacondicionado: false, categoriaId: categorias[2].id },
      { nombre: 'Parlante JBL Flip 6', codigoBarras: '0050036382123', descripcion: 'Parlante portátil a prueba de agua color negro', precioVenta: 549900.00, precioCosto: 390000.00, tieneIVA: true, stockMinimo: 5, tieneNumeroSerie: false, esReacondicionado: false, categoriaId: categorias[5].id },
      { nombre: 'Procesador Intel Core i5-12400F', codigoBarras: '0735858503043', descripcion: 'CPU LGA1700 sin gráficos integrados', precioVenta: 699900.00, precioCosto: 510000.00, tieneIVA: true, stockMinimo: 5, tieneNumeroSerie: true, esReacondicionado: false, categoriaId: categorias[7].id }
    ]);
    console.log('Productos creados con éxito.');

    // 5. Cargar Stocks iniciales por Sede
    for (const p of productos) {
      for (const s of sedes) {
        await StockSede.create({
          productoId: p.id,
          sedeId: s.id,
          cantidad: Math.floor(Math.random() * 20) + 5 // stock aleatorio entre 5 y 25 unidades
        });
      }
    }
    console.log('StockSede inicializado para todos los productos en todas las sedes.');

    // 6. Crear Categorías de Egreso
    await CategoriaEgreso.bulkCreate([
      { nombre: 'Gastos operativos', descripcion: 'Domicilios, papelería, servicios públicos' },
      { nombre: 'Compra de repuestos urgente', descripcion: 'Adquisición express de repuesto fuera de orden' },
      { nombre: 'Alimentación del equipo', descripcion: 'Refrigerios, desayunos o almuerzos de empleados' },
      { nombre: 'Pago a proveedor', descripcion: 'Pago en efectivo a proveedores locales' },
      { nombre: 'Retiro del propietario', descripcion: 'Retiro de caja autorizado para el dueño' },
      { nombre: 'Otros gastos', descripcion: 'Egresos imprevistos detallados por el cajero' }
    ]);
    console.log('Categorías de egreso creadas con éxito.');

    // 7. Crear Configuración del Sistema
    await ConfiguracionSistema.create({
      empresa: 'TechStore Colombia S.A.S.',
      nit: '901.456.789-0',
      direccion: 'Centro de Alta Tecnología - Local 240, Bogotá',
      telefono: '+57 311 987 6543',
      descuentoMaximoPct: 15.00,
      egresoMaximoSinPin: 50000.00,
      notificacionesActivas: false,
      smsActivo: false,
      whatsappActivo: false,
      ivaDefecto: 19.00,
      nominaFrecuenciaDefault: 'quincenal',
      nominaDiaCorteQuincena: 15,
      nominaDiaPago1: 15,
      nominaDiaPago2: 30,
    });
    console.log('Configuración global del sistema creada con éxito.');

    console.log('=== SEEDING COMPLETADO CON ÉXITO ===');
    process.exit(0);
  } catch (error) {
    console.error('Error durante la carga de datos semilla:', error);
    process.exit(1);
  }
};

runSeeder();
