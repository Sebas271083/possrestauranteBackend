import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

const METHODS = ["cash","card","mp_link","mp_point","other"];

// ...
class Payment extends Model {}
Payment.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  order_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  user_id:   { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }, // cajero
  session_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  method: { type: DataTypes.ENUM("cash","card","mp_link","mp_point","other"), allowNull: false },
  amount: { type: DataTypes.DECIMAL(10,2), allowNull: false },
  ref: { type: DataTypes.STRING(120) },
  parent_payment_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }, // 👈 NUEVO (opcional)
  meta: { type: DataTypes.JSON },
  created_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }
}, { sequelize, tableName: "payments", paranoid: true, underscored: true });


export { Payment, METHODS };
