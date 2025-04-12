const express = require("express");
const mysql = require("mysql2");
const path = require("path");
const session = require("express-session");

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "clave-super-secreta",
  resave: false,
  saveUninitialized: false
}));

const db = mysql.createConnection({
  host: "databaseunity.c53ikkaxvzot.us-east-1.rds.amazonaws.com",
  user: "admin",
  password: "moises123",
  database: "databaseunity",
  port: 3306
});

// ======================= RUTAS DE AUTENTICACIÓN =======================

app.get("/", (req, res) => res.redirect("/login"));

// Vista del login
app.get("/login", (req, res) => {
  res.render("dashboard/login", { error: null });
});

// Proceso de login
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const adminUser = "admin";
  const adminPass = "admin123";

  if (username === adminUser && password === adminPass) {
    req.session.authenticated = true;
    return res.redirect("/dashboard");
  } else {
    return res.render("dashboard/login", { error: "Credenciales incorrectas" });
  }
});


// ======================= DASHBOARD PROTEGIDO =======================

app.get("/dashboard", (req, res, next) => {
  if (!req.session.authenticated) return res.redirect("/login");
  next();
}, (req, res) => {
  const sql = {
    users: `
      SELECT u.userName, u.country, u.deviceModel, u.platform, s.startTime, s.endTime,
        TIMESTAMPDIFF(MINUTE, s.startTime, s.endTime) AS duration_min
      FROM usuarios u
      LEFT JOIN sesiones s ON u.id = s.userId
      WHERE s.startTime IS NOT NULL
      ORDER BY s.startTime DESC
      LIMIT 15
    `,
    totalUsers: `SELECT COUNT(*) AS total FROM usuarios;`,
    avgSession: `SELECT ROUND(AVG(duration_seconds)/60, 2) AS avg FROM sesiones;`,
    countries: `SELECT COUNT(DISTINCT country) AS total FROM usuarios;`,
    activeToday: `
      SELECT COUNT(*) AS total
      FROM sesiones
      WHERE DATE(startTime) = CURDATE()
    `,
    thisWeek: `
      SELECT COUNT(*) AS total
      FROM sesiones
      WHERE startTime >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    `,
    topDevice: `
      SELECT deviceModel, COUNT(*) AS total
      FROM usuarios
      GROUP BY deviceModel
      ORDER BY total DESC
      LIMIT 1
    `,
    topLanguage: `
      SELECT systemLanguage, COUNT(*) AS total
      FROM usuarios
      GROUP BY systemLanguage
      ORDER BY total DESC
      LIMIT 1
    `,
    topPlatform: `
      SELECT platform, COUNT(*) AS total
      FROM usuarios
      GROUP BY platform
      ORDER BY total DESC
      LIMIT 1
    `,
    sessionsByDay: `
      SELECT DATE(startTime) as day, COUNT(*) AS count
      FROM sesiones
      WHERE startTime >= DATE_SUB(CURDATE(), INTERVAL 15 DAY)
      GROUP BY day
      ORDER BY day ASC;
    `,
    countriesPie: `
      SELECT country, COUNT(*) AS total
      FROM usuarios
      GROUP BY country
      ORDER BY total DESC
      LIMIT 10
    `,
    durationHistogram: `
      SELECT FLOOR(duration_seconds / 60) AS duration_min, COUNT(*) AS count
      FROM sesiones
      GROUP BY duration_min
      ORDER BY duration_min
    `,
    genderPlatform: `
      SELECT gender, platform, COUNT(*) AS total
      FROM usuarios
      GROUP BY gender, platform
    `
  };

  const queries = Object.entries(sql).map(([key, query]) =>
    new Promise((resolve, reject) => {
      db.query(query, (err, result) => {
        if (err) reject({ key, err });
        else resolve({ key, result });
      });
    })
  );

  Promise.all(queries)
    .then((results) => {
      const data = {};
      results.forEach(({ key, result }) => {
        data[key] = result;
      });

      res.render("dashboard/index", {
        users: data.users,
        totalUsers: data.totalUsers[0].total,
        avgSession: data.avgSession[0].avg,
        countries: data.countries[0].total,
        activeToday: data.activeToday[0].total,
        sessionsThisWeek: data.thisWeek[0].total,
        topDevice: data.topDevice[0].deviceModel,
        topLanguage: data.topLanguage[0].systemLanguage,
        topPlatform: data.topPlatform[0].platform,
        sessionsByDay: data.sessionsByDay,
        countriesPie: data.countriesPie,
        durationHistogram: data.durationHistogram,
        genderPlatform: data.genderPlatform
      });
    })
    .catch(({ key, err }) => {
      console.error("❌ Error al ejecutar consulta [${key}]", err);
      res.status(500).send("Error en el dashboard");
    });
});

// ======================= LOGOUT =======================
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ======================= 404 =======================
app.use((req, res) => {
  res.status(404).send("404 - Página no encontrada");
});

// ======================= START =======================
app.listen(4000, () => {
  console.log("🌍 Dashboard corriendo en http://localhost:4000/dashboard");
})