import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

export const ITEM_STATUS = ["new","pending","queued","in_kitchen","ready","delivered","void"];

export class OrderItem extends Model { }

OrderItem.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    product_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    modifiers_json: { type: DataTypes.JSON, allowNull: true },
    order_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    item_name: { type: DataTypes.STRING(150), allowNull: false },
    quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    unit_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: "0.00" },
    notes: { type: DataTypes.STRING(255) },
    cost_override: { type: DataTypes.DECIMAL(10, 4), allowNull: true }, // costo unitario manual (solo para ítems sin product_id)
    station: { type: DataTypes.STRING(50), allowNull: true }, // cocina/barra/etc
    status: {
      type: DataTypes.ENUM(...ITEM_STATUS),
      allowNull: false,
      defaultValue: "queued"
    },
    stock_applied_at: { type: DataTypes.DATE, allowNull: true },
    fired_at: { type: DataTypes.DATE, allowNull: true },       // pasa a in_kitchen
    prep_started_at: { type: DataTypes.DATE, allowNull: true },// opcional si distinguís "tomado"
    ready_at: { type: DataTypes.DATE, allowNull: true },       // pasa a ready
    delivered_at: { type: DataTypes.DATE, allowNull: true },   // pasa a delivered
    modifiers_json: { type: DataTypes.JSON } // ej: {sin_sal: true, agregar_queso: true}
  },
  { sequelize, tableName: "order_items", paranoid: true, underscored: true }
);
