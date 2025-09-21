import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

export const ORDER_STATUS = ["open", "ready", "delivered", "closed", "void"];

export class Order extends Model {}

Order.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    table_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    waiter_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }, // User.id
    guests: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    status: { type: DataTypes.ENUM(...ORDER_STATUS), allowNull: false, defaultValue: "open" },
    notes: { type: DataTypes.STRING(255) },
    opened_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    closed_at: { type: DataTypes.DATE, allowNull: true },
    subtotal: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: "0.00" },
    discount_total: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: "0.00" },
    service_total: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: "0.00" },
    grand_total: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: "0.00" }
  },
  { sequelize, tableName: "orders", paranoid: true, underscored: true }
);
