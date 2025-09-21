import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

export class User extends Model { }

User.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    email: { type: DataTypes.STRING(150), allowNull: false, unique: true, validate: { isEmail: true } },
    password_hash: { type: DataTypes.STRING(100), allowNull: false },
    full_name: { type: DataTypes.STRING(150), allowNull: false },
    role: {
      type: DataTypes.ENUM("admin", "manager", "cashier", "waiter", "kitchen", "delivery"),
      allowNull: false,
      defaultValue: "waiter"
    },
    twofa_secret: { type: DataTypes.STRING(100), allowNull: true },
    twofa_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    last_login_at: { type: DataTypes.DATE, allowNull: true }
  },
  { sequelize, tableName: "users", paranoid: true, underscored: true }
);
