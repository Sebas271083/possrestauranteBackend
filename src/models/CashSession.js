// src/models/CashSession.js
 import { DataTypes, Model } from "sequelize";
 import { sequelize } from "../config/db.js";

 class CashSession extends Model {}
 CashSession.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  opened_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },  // User.id
  closed_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  opened_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  closed_at: { type: DataTypes.DATE, allowNull: true },
  opening_float: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: "0.00" },
 // Estado y totales de arqueo
  status: { type: DataTypes.ENUM("open","closed"), allowNull: false, defaultValue: "open" },
  expected_total: { type: DataTypes.DECIMAL(10,2), allowNull: true },
  counted_total:  { type: DataTypes.DECIMAL(10,2), allowNull: true },
  diff_total:     { type: DataTypes.DECIMAL(10,2), allowNull: true },
  // Breakdown por denominación (JSON o TEXT según tu MySQL)
  closing_breakdown: { type: DataTypes.JSON, allowNull: true },
  notes: { type: DataTypes.STRING(255) }
 }, { sequelize, tableName: "cash_sessions", paranoid: true, underscored: true });

 export { CashSession };
