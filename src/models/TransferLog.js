import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

export class TransferLog extends Model {}

TransferLog.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    action: { type: DataTypes.ENUM("transfer_order", "join_orders"), allowNull: false },
    source_table_id: { type: DataTypes.INTEGER.UNSIGNED },
    target_table_id: { type: DataTypes.INTEGER.UNSIGNED },
    source_order_id: { type: DataTypes.INTEGER.UNSIGNED },
    target_order_id: { type: DataTypes.INTEGER.UNSIGNED },
    performed_by: { type: DataTypes.INTEGER.UNSIGNED }, // User.id
    meta: { type: DataTypes.JSON }
  },
  { sequelize, tableName: "transfer_logs", paranoid: true, underscored: true }
);
