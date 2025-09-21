import "dotenv/config.js";
import { sequelize } from "../config/db.js";
import { User } from "../models/User.js";
import { hashPassword } from "../utils/password.js";
import "../models/index.js";

await sequelize.authenticate();
await sequelize.sync();

const [admin, created] = await User.findOrCreate({
  where: { email: "admin@admin.com" },
  defaults: {
    full_name: "Administrador",
    role: "admin",
    password_hash: await hashPassword("Admin123!"),
    is_active: true
  }
});
console.log(created ? "Admin creado" : "Admin ya existía:", admin.email);
process.exit(0);
