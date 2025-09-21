import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

export const TABLE_STATUS = ["free", "occupied", "reserved", "blocked"];

export class Table extends Model { }

Table.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    area_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    label: { type: DataTypes.STRING(50), allowNull: false }, // ej: "M12"
    capacity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 2 },
    status: { type: DataTypes.ENUM(...TABLE_STATUS), allowNull: false, defaultValue: "free" },
    note: { type: DataTypes.STRING(255) },
    layout_x: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 40 },
    layout_y: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 40 },
    layout_w: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 96 }, // px
    layout_h: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 96 },
    layout_rot: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 }, // grados
    layout_shape: { type: DataTypes.ENUM("circle", "rect"), allowNull: false, defaultValue: "circle" }

  },
  { sequelize, tableName: "tables", paranoid: true, underscored: true }
);
