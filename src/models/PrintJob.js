import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";
import { Printer } from "./Printer.js";

class PrintJob extends Model {}
PrintJob.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  printer_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  type: { type: DataTypes.ENUM("kitchen_ticket","bar_ticket","cash_receipt","reprint"), allowNull: false },
  ref: { type: DataTypes.STRING(120) }, // ORDER#id etc.
  payload: { type: DataTypes.BLOB("long"), allowNull: false }, // bytes ESC/POS
  status: { type: DataTypes.ENUM("queued","sent","failed"), allowNull: false, defaultValue: "queued" },
  attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  last_error: { type: DataTypes.STRING(255) }
}, { sequelize, tableName: "print_jobs", paranoid: true, underscored: true });

PrintJob.belongsTo(Printer, { foreignKey: "printer_id" });
Printer.hasMany(PrintJob, { foreignKey: "printer_id" });

export { PrintJob };
