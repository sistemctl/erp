import { Sequelize } from 'sequelize';
import dotenv = require('dotenv');
import runtimePaths = require('../utils/runtime-paths');
dotenv.config({ path: runtimePaths.ENV_PATH });

const sequelize = new Sequelize(
  process.env.DB_NAME || 'erp_techstore',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASS || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    dialect: 'postgres',
    logging: false, // Opcional: console.log para ver queries en dev
    define: {
      timestamps: true
    }
  }
);

export = sequelize;
