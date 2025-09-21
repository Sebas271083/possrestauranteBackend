import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class WorkSession extends Model {}
WorkSession.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  employee_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

  check_in_at:  { type: DataTypes.DATE, allowNull: false },
  check_out_at: { type: DataTypes.DATE, allowNull: true }, // null => abierta

  break_minutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 }, // descansos
  source_in:  { type: DataTypes.STRING(20), allowNull: false, defaultValue: "kiosk" },   // kiosk|manual|api
  source_out: { type: DataTypes.STRING(20), allowNull: true },

  note: { type: DataTypes.STRING(255), allowNull: true },
  approved_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  approved_at: { type: DataTypes.DATE, allowNull: true },
}, {
  sequelize,
  tableName: "work_sessions",
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ["employee_id", "check_in_at"] },
    { fields: ["check_out_at"] }
  ]
});

export { WorkSession };
