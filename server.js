```javascript
require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const DATA_DIR = path.join(__dirname, "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

// HTTPS ni ngombwa iyo website iri kuri internet.
// HST​S na secure cookies bishobora kongerwaho kuri production.

// Gukora folder yo kubikamo ibicuruzwa.
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Gushyiraho ibicuruzwa by'icyitegererezo igihe file itarabaho.
if (!fs.existsSync(PRODUCTS_FILE)) {
  const initialProducts = [
    {
      id: "1",
      name: "Radio",
      category: "Electronics",
      price: 15000,
      image: "https://placehold.co/600x400?text=Radio",
      description: "Radio yo kumva amakuru n'umuziki."
    },
    {
      id: "2",
      name: "Headphones",
      category: "Electronics",
      price: 8000,
      image: "https://placehold.co/600x400?text=Headphones",
      description: "Headphones zo kumva umuziki."
    },
    {
      id: "3",
      name: "Ubukomo bw'amasaro",
      category: "Imitako",
      price: 500,
      image: "https://placehold.co/600x400?text=Bracelet",
      description: "Ubukomo bwiza bukozwe mu masaro."
    }
  ];

  fs.writeFileSync(
    PRODUCTS_FILE,
    JSON.stringify(initialProducts, null, 2),
    "utf8"
  );
}

// Gusoma no kubika ibicuruzwa.
function readProducts() {
  const content = fs.readFileSync(PRODUCTS_FILE, "utf8");
  const products = JSON.parse(content);

  if (!Array.isArray(products)) {
    throw new Error("Products file igomba kuba array.");
  }

  return products;
}

function writeProducts(products) {
  const temporaryFile = PRODUCTS_FILE + ".tmp";

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(products, null, 2),
    "utf8"
  );

  fs.renameSync(temporaryFile, PRODUCTS_FILE);
}

// Gukora token y'agateganyo yo kwinjira muri admin.
const adminSessions = new Map();

function createSession() {
  const token = crypto.randomBytes(32).toString("hex");

  adminSessions.set(token, Date.now() + 8 * 60 * 60 * 1000);

  return token;
}

function requireAdmin(req, res, next) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer ([a-f0-9]+)$/i);

  if (!match) {
    return res.status(401).json({
      message: "Banza winjire muri Admin."
    });
  }

  const token = match[1];
  const expiresAt = adminSessions.get(token);

  if (!expiresAt || expiresAt < Date.now()) {
    adminSessions.delete(token);

    return res.status(401).json({
      message: "Session yarangiye. Ongera winjire."
    });
  }

  // Kongera igihe cyo kurangira mu gihe admin agikoresha.
  adminSessions.set(token, Date.now() + 8 * 60 * 60 * 1000);

  next();
}

// LOGIN ADMIN.
app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return res.status(500).json({
      message: "Shyira ADMIN_USERNAME na ADMIN_PASSWORD muri .env."
    });
  }

  const { username, password } = req.body || {};

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.length > 100 ||
    password.length > 200
  ) {
    return res.status(400).json({
      message: "Andika username na password byemewe."
    });
  }

  const usernameMatches = username === ADMIN_USERNAME;

  const passwordMatches =
    Buffer.byteLength(password) === Buffer.byteLength(ADMIN_PASSWORD) &&
    crypto.timingSafeEqual(
      Buffer.from(password),
      Buffer.from(ADMIN_PASSWORD)
    );

  if (!usernameMatches || !passwordMatches) {
    return res.status(401).json({
      message: "Username cyangwa password si byo."
    });
  }

  const token = createSession();

  return res.json({
    message: "Winjiye neza.",
    token
  });
});

// GUSOHOKA MURI ADMIN.
app.post("/api/admin/logout", requireAdmin, (req, res) => {
  const token = req.headers.authorization.slice(7);
  adminSessions.delete(token);

  res.json({ message: "Wasohotse muri Admin." });
});

// KUREBA IBICURUZWA.
// Iyi route irafunguye ku bakiriya.
app.get("/api/products", (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(readProducts());
  } catch (error) {
    console.error("Products read error:", error.message);

    res.status(500).json({
      message: "Ntibishobotse gusoma ibicuruzwa."
    });
  }
});

// Kugenzura amakuru y'igicuruzwa.
function validateProduct(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Amakuru y'igicuruzwa si yo.";
  }

  if (
    typeof body.name !== "string" ||
    body.name.trim().length < 1 ||
    body.name.trim().length > 120
  ) {
    return "Izina rigomba kuba hagati y'inyuguti 1 na 120.";
  }

  if (
    typeof body.category !== "string" ||
    body.category.trim().length < 1 ||
    body.category.trim().length > 100
  ) {
    return "Icyiciro cy'igicuruzwa si cyo.";
  }

  if (
    typeof body.price !== "number" ||
    !Number.isSafeInteger(body.price) ||
    body.price < 0 ||
    body.price > 1000000000
  ) {
    return "Igiciro kigomba kuba umubare wuzuye uri hagati ya 0 na 1,000,000,000 RWF.";
  }

  if (body.image !== undefined && typeof body.image !== "string") {
    return "Link y'ifoto si yo.";
  }

  if (body.image && body.image.length > 1000) {
    return "Link y'ifoto ni ndende cyane.";
  }

  if (body.image) {
    try {
      const imageURL = new URL(body.image);

      if (imageURL.protocol !== "https:") {
        return "Link y'ifoto igomba gukoresha HTTPS.";
      }
    } catch {
      return "Link y'ifoto ntabwo imeze neza.";
    }
  }

  if (
    body.description !== undefined &&
    (
      typeof body.description !== "string" ||
      body.description.length > 1000
    )
  ) {
    return "Ibisobanuro ntibigomba kurenza inyuguti 1000.";
  }

  return null;
}

// KONGERAHO IGICURUZWA.
app.post("/api/products", requireAdmin, (req, res) => {
  const validationError = validateProduct(req.body);

  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  try {
    const products = readProducts();

    const product = {
      id: crypto.randomUUID(),
      name: req.body.name.trim(),
      category: req.body.category.trim(),
      price: req.body.price,
      image: req.body.image ? req.body.image.trim() : "",
      description: req.body.description
        ? req.body.description.trim()
        : ""
    };

    products.push(product);
    writeProducts(products);

    res.status(201).json({
      message: "Igicuruzwa cyongeweho neza.",
      product
    });
  } catch (error) {
    console.error("Product create error:", error.message);

    res.status(500).json({
      message: "Ntibishobotse kubika igicuruzwa."
    });
  }
});

// GUHINDURA IGICURUZWA.
app.put("/api/products/:id", requireAdmin, (req, res) => {
  const validationError = validateProduct(req.body);

  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  try {
    const products = readProducts();

    const index = products.findIndex(
      product => product.id === req.params.id
    );

    if (index === -1) {
      return res.status(404).json({
        message: "Igicuruzwa nticyabonetse."
      });
    }

    const updatedProduct = {
      ...products[index],
      name: req.body.name.trim(),
      category: req.body.category.trim(),
      price: req.body.price,
      image: req.body.image ? req.body.image.trim() : "",
      description: req.body.description
        ? req.body.description.trim()
        : ""
    };

    products[index] = updatedProduct;
    writeProducts(products);

    res.json({
      message: "Igicuruzwa cyahinduwe neza.",
      product: updatedProduct
    });
  } catch (error) {
    console.error("Product update error:", error.message);

    res.status(500).json({
      message: "Ntibishobotse guhindura igicuruzwa."
    });
  }
});

// GUSIBA IGICURUZWA.
app.delete("/api/products/:id", requireAdmin, (req, res) => {
  try {
    const products = readProducts();

    const index = products.findIndex(
      product => product.id === req.params.id
    );

    if (index === -1) {
      return res.status(404).json({
        message: "Igicuruzwa nticyabonetse."
      });
    }

    products.splice(index, 1);
    writeProducts(products);

    res.json({
      message: "Igicuruzwa cyasibwe neza."
    });
  } catch (error) {
    console.error("Product delete error:", error.message);

    res.status(500).json({
      message: "Ntibishobotse gusiba igicuruzwa."
    });
  }
});

// Gufungura index.html na admin.html.
app.use(express.static(path.join(__dirname, "public"), {
  index: "index.html"
}));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Gufata amakosa ya JSON n'andi makosa.
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (err instanceof SyntaxError && "body"
