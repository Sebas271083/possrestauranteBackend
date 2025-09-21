// src/scripts/seed_demo.js
import "dotenv/config.js";
import { sequelize } from "../config/db.js";
import { hashPassword } from "../utils/password.js";
import {
  Area, Table,
  Category, Product,
  ModifierGroup, ModifierOption,
  ProductCategory, ProductModifierGroup,
  User,
} from "../models/index.js";

async function seed() {
  console.log("➡️  Iniciando seed de DEMO…");
  await sequelize.authenticate();
  // Si estás en dev y te faltan tablas, podés descomentar:
  // await sequelize.sync({ alter: true });

  const t = await sequelize.transaction();
  try {
    // ---------- Usuarios demo (opcional) ----------
    // Admin ya lo tenés; creamos un mozo si no existe
    await User.findOrCreate({
      where: { email: "mozo@pos.com" },
      defaults: {
        email: "mozo@pos.com",
        password_hash: await hashPassword("Mozo1234!"),
        full_name: "Mozo Demo",
        role: "waiter",
        is_active: true
      },
      transaction: t
    });

 /*   // ---------- Áreas ----------
    const [salon, terraza, delivery] = await Promise.all([
      Area.findOrCreate({ where: { name: "Salón Principal" }, defaults: { sort_order: 1 }, transaction: t }).then(r => r[0]),
      Area.findOrCreate({ where: { name: "Terraza" }, defaults: { sort_order: 2 }, transaction: t }).then(r => r[0]),
      Area.findOrCreate({ where: { name: "Delivery/Takeaway" }, defaults: { sort_order: 3 }, transaction: t }).then(r => r[0]),
    ]);

    // ---------- Mesas ----------
    const tablesData = [
      { area_id: salon.id, label: "01", capacity: 4, status: "free" },
      { area_id: salon.id, label: "02", capacity: 4, status: "free" },
      { area_id: salon.id, label: "03", capacity: 2, status: "free" },
      { area_id: terraza.id, label: "T1", capacity: 4, status: "free" },
      { area_id: terraza.id, label: "T2", capacity: 2, status: "free" },
      { area_id: delivery.id, label: "PICKUP", capacity: 0, status: "free" },
    ];
    for (const tbl of tablesData) {
      await Table.findOrCreate({
        where: { area_id: tbl.area_id, label: tbl.label },
        defaults: tbl,
        transaction: t
      });
    }

    // ---------- Categorías ----------
    const [catBebidas, catPizzas, catBurgers, catPostres] = await Promise.all([
      Category.findOrCreate({ where: { name: "Bebidas" }, transaction: t }).then(r => r[0]),
      Category.findOrCreate({ where: { name: "Pizzas" }, transaction: t }).then(r => r[0]),
      Category.findOrCreate({ where: { name: "Hamburguesas" }, transaction: t }).then(r => r[0]),
      Category.findOrCreate({ where: { name: "Postres" }, transaction: t }).then(r => r[0]),
    ]);

    // ---------- Productos ----------
    // station: "bar" | "kitchen" (coincide con tu KDS)
    const products = [
      { name: "Coca Cola 500ml", price: 2800, station: "bar", is_active: true },
      { name: "Agua 500ml", price: 2200, station: "bar", is_active: true },
      { name: "Pizza Muzzarella", price: 7500, station: "kitchen", is_active: true },
      { name: "Pizza Napolitana", price: 8200, station: "kitchen", is_active: true },
      { name: "Hamburguesa Clásica", price: 6800, station: "kitchen", is_active: true },
      { name: "Papas Fritas", price: 3900, station: "kitchen", is_active: true },
      { name: "Flan Casero", price: 3200, station: "kitchen", is_active: true },
    ];
    const createdProds = [];
    for (const p of products) {
      const [row] = await Product.findOrCreate({
        where: { name: p.name },
        defaults: p,
        transaction: t
      });
      createdProds.push(row);
    }
    const prod = (name) => createdProds.find(p => p.name === name);

    // ---------- Vincular Productos ↔ Categorías (N:M) ----------
    async function linkProductToCategories(p, categories) {
      for (const c of categories) {
        await ProductCategory.findOrCreate({
          where: { product_id: p.id, category_id: c.id },
          defaults: { product_id: p.id, category_id: c.id },
          transaction: t
        });
      }
    }
    await linkProductToCategories(prod("Coca Cola 500ml"), [catBebidas]);
    await linkProductToCategories(prod("Agua 500ml"), [catBebidas]);
    await linkProductToCategories(prod("Pizza Muzzarella"), [catPizzas]);
    await linkProductToCategories(prod("Pizza Napolitana"), [catPizzas]);
    await linkProductToCategories(prod("Hamburguesa Clásica"), [catBurgers]);
    await linkProductToCategories(prod("Papas Fritas"), [catBurgers]);
    await linkProductToCategories(prod("Flan Casero"), [catPostres]);

    // ---------- Grupos de modificadores ----------
    // Pizzas: Tamaño y Adicionales
    const [gTamanio, gAdic, gPunto, gHielo] = await Promise.all([
      ModifierGroup.findOrCreate({ where: { name: "Tamaño" }, defaults: { is_required: false, max_select: 1 }, transaction: t }).then(r => r[0]),
      ModifierGroup.findOrCreate({ where: { name: "Adicionales" }, defaults: { is_required: false, max_select: 5 }, transaction: t }).then(r => r[0]),
      ModifierGroup.findOrCreate({ where: { name: "Punto de cocción" }, defaults: { is_required: false, max_select: 1 }, transaction: t }).then(r => r[0]),
      ModifierGroup.findOrCreate({ where: { name: "Hielo" }, defaults: { is_required: false, max_select: 1 }, transaction: t }).then(r => r[0]),
    ]);

    // Opciones
    async function ensureOption(group, name, price_delta) {
      const [opt] = await ModifierOption.findOrCreate({
        where: { group_id: group.id, name },
        defaults: { group_id: group.id, name, price_delta },
        transaction: t
      });
      return opt;
    }

    // Tamaño (para pizzas)
    await ensureOption(gTamanio, "Individual", 0);
    await ensureOption(gTamanio, "Mediana", 1500);
    await ensureOption(gTamanio, "Grande", 2800);

    // Adicionales (para pizzas y burger)
    await ensureOption(gAdic, "Jamón", 900);
    await ensureOption(gAdic, "Huevo", 600);
    await ensureOption(gAdic, "Extra Queso", 800);

    // Punto (para burger)
    await ensureOption(gPunto, "Jugoso", 0);
    await ensureOption(gPunto, "A punto", 0);
    await ensureOption(gPunto, "Bien cocido", 0);

    // Hielo (para bebidas)
    await ensureOption(gHielo, "Con hielo", 0);
    await ensureOption(gHielo, "Sin hielo", 0);

    // ---------- Vincular Productos ↔ Grupos (N:M) ----------
    async function linkProductToGroups(p, groups) {
      for (const g of groups) {
        await ProductModifierGroup.findOrCreate({
          where: { product_id: p.id, group_id: g.id },
          defaults: { product_id: p.id, group_id: g.id },
          transaction: t
        });
      }
    }
    // Pizzas: Tamaño + Adicionales
    await linkProductToGroups(prod("Pizza Muzzarella"), [gTamanio, gAdic]);
    await linkProductToGroups(prod("Pizza Napolitana"), [gTamanio, gAdic]);
    // Burger: Punto + Adicionales
    await linkProductToGroups(prod("Hamburguesa Clásica"), [gPunto, gAdic]);
    // Bebidas: Hielo
    await linkProductToGroups(prod("Coca Cola 500ml"), [gHielo]);
    await linkProductToGroups(prod("Agua 500ml"), [gHielo]);
*/
    await t.commit();
    console.log("✅ Seed DEMO completado");
  } catch (e) {
    await t.rollback();
    console.error("❌ Seed DEMO falló:", e);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

seed();
