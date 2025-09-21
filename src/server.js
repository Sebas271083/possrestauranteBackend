import app, { initApp } from "./app.js";
import { sequelize } from "./config/db.js";

const PORT = process.env.PORT || 4000;

(async () => {
  try {
    await sequelize.authenticate();
    await initApp();
    console.log("DB conectada ✅");
    app.listen(PORT, () => console.log(`API en http://localhost:${PORT}`));
  } catch (err) {
    console.error("Error al iniciar:", err);
    process.exit(1);
  }
})();
