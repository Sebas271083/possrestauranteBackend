import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class Printer extends Model {}
Printer.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  role: { type: DataTypes.ENUM("kitchen","bar","cash","other"), allowNull: false }, // a qué sirve
  interface: { type: DataTypes.ENUM("network","file"), allowNull: false, defaultValue: "network" },
  // network
  host: { type: DataTypes.STRING(120) },  // ej: 192.168.1.50
  port: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 9100 },
  // file (debug)
  file_path: { type: DataTypes.STRING(255) }, // ej: /tmp/print.raw
  // settings
  width_chars: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 42 }, // 58mm ≈ 32-42, 80mm ≈ 48-64
  codepage: { type: DataTypes.STRING(20), defaultValue: "CP437" },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { sequelize, tableName: "printers", paranoid: true, underscored: true });

export { Printer };
