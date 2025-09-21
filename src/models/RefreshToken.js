import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

export class RefreshToken extends Model {}

RefreshToken.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  token_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
  user_agent: { type: DataTypes.STRING(255), allowNull: true },
  ip: { type: DataTypes.STRING(64), allowNull: true },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  revoked_at: { type: DataTypes.DATE, allowNull: true }
}, {
  sequelize,
  modelName: "RefreshToken",
  tableName: "refresh_tokens",
  underscored: true,
  paranoid: true // si ya venías usando deleted_at
});

export default RefreshToken;
