import express from "express";
import session from "express-session";
import mysql from "mysql2/promise";
import cors from "cors";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
    secret: "clave-ultra-secreta",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 2 } // 2 horas
}));

const port = process.env.PORT ?? 8080;
const ipAddress = process.env.C9_HOSTNAME ?? 'localhost';

async function getDBConnection() {
    return await mysql.createConnection({
        host: "databaseunity.c53ikkaxvzot.us-east-1.rds.amazonaws.com",
        user: "admin",
        password: "moises123",
        database: "databaseunity",
        waitForConnections: true
    });
}

// ========== ✅ LOGIN  ==========
app.post("/loginUser", async (req, res) => {
    const { username, pass } = req.body;
    if (!username || !pass) return res.json({ done: false, message: "Faltan datos" });

    let connection;
    try {
        const passHash = crypto.createHash("sha256").update(pass).digest("hex");
        connection = await getDBConnection();

        const [result] = await connection.execute(
            "SELECT id, userName, password FROM usuarios WHERE userName = ?",
            [username]
        );

        if (result.length === 0 || result[0].password !== passHash)
            return res.json({ done: false, message: "Credenciales incorrectas" });

        return res.json({ done: true, message: "Login exitoso. Bienvenido!", userId: result[0].id });

    } catch (err) {
        console.error("❌ Error al buscar usuario:", err);
        return res.json({ done: false, message: "Error en el servidor" });
    } finally {
        if (connection) await connection.end();
    }
});

// ========== ✅ REGISTRO API ==========
app.post("/createUser", async (req, res) => {
    const {
        username, email, pass, birthDate, gender,
        country, deviceModel, operatingSystem, platform, systemLanguage
    } = req.body;

    if (!username || !email || !pass)
        return res.json({ done: false, message: "Faltan campos" });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
        return res.json({ done: false, message: "Correo no válido" });

    const passHash = crypto.createHash("sha256").update(pass).digest("hex");

    let connection;
    try {
        connection = await getDBConnection();

        const [userCheck] = await connection.execute(
            "SELECT * FROM usuarios WHERE userName = ?",
            [username]
        );
        if (userCheck.length > 0)
            return res.json({ done: false, message: "El usuario ya existe" });

        const [emailCheck] = await connection.execute(
            "SELECT * FROM usuarios WHERE email = ?",
            [email]
        );
        if (emailCheck.length > 0)
            return res.json({ done: false, message: "El correo ya está registrado" });

        const insertSQL = `
            INSERT INTO usuarios
            (userName, email, password, birthDate, gender, country, deviceModel, operatingSystem, platform, systemLanguage)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const values = [
            username, email, passHash, birthDate || null, gender || null,
            country || null, deviceModel || null, operatingSystem || null,
            platform || null, systemLanguage || null
        ];

        await connection.execute(insertSQL, values);
        console.log("✅ Usuario registrado:", username);
        res.json({ done: true, message: "Usuario creado con éxito" });

    } catch (err) {
        console.error("❌ Error al registrar:", err);
        res.json({ done: false, message: "Error al registrar el usuario" });
    } finally {
        if (connection) await connection.end();
    }
});

// ========== ✅ LOGIN PANEL WEB ==========
app.get("/login", (req, res) => {
    res.render("dashboard/login", { error: null });
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.render("dashboard/login", { error: "Todos los campos son obligatorios" });

    const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");

    let connection;
    try {
        connection = await getDBConnection();
        const [result] = await connection.execute(
            "SELECT * FROM usuarios WHERE userName = ? AND password = ?",
            [username, hashedPassword]
        );

        if (result.length === 0)
            return res.render("dashboard/login", { error: "Usuario o contraseña incorrectos" });

        // ✅ Guardar sesión
        req.session.authenticated = true;
        req.session.userId = result[0].id;
        req.session.username = result[0].userName;

        return res.redirect("/dashboard");

    } catch (err) {
        console.error("❌ Error al validar login web:", err);
        return res.render("dashboard/login", { error: "Error del servidor" });
    } finally {
        if (connection) await connection.end();
    }
});

app.get("/register", (req, res) => {
    res.render("dashboard/register", { error: null, success: null });
  });
  
  app.post("/register", async (req, res) => {
    try {
      const response = await fetch(`http://${ipAddress}:${port}/createUser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      });
      const result = await response.json();
  
      if (result.done) {
        return res.render("dashboard/register", {
          success: "✅ Usuario creado correctamente. Ya puedes iniciar sesión.",
          error: null
        });
      } else {
        return res.render("dashboard/register", {
          error: result.message || "Error al registrar",
          success: null
        });
      }
    } catch (err) {
      console.error("❌ Error en registro web:", err);
      return res.render("dashboard/register", {
        error: "Error del servidor",
        success: null
      });
    }
  });
  

// ========== ✅ LOGOUT ==========
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
});

// ========== ✅ GUARDAR SESIÓN DE JUEGO ==========
app.post("/saveSession", async (req, res) => {
    const { userId, startTime, endTime } = req.body;
    if (!userId || !startTime || !endTime)
        return res.json({ done: false, message: "Datos incompletos" });

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start) || isNaN(end))
        return res.json({ done: false, message: "Fechas inválidas" });

    const duration = Math.floor((end - start) / 1000);
    let connection;
    try {
        connection = await getDBConnection();
        const sql = `INSERT INTO sesiones (userId, startTime, endTime, duration_seconds)
                     VALUES (?, ?, ?, ?)`;
        await connection.execute(sql, [userId, startTime, endTime, duration]);

        console.log(`📦 Sesión guardada: ${userId}, duración: ${duration}s`);
        res.json({ done: true, message: "Sesión registrada correctamente." });

    } catch (err) {
        console.error("❌ Error al guardar sesión:", err);
        res.json({ done: false, message: "Error al guardar la sesión" });
    } finally {
        if (connection) await connection.end();
    }
});

// ========== ✅ DASHBOARD PROTEGIDO ==========
app.get("/dashboard", async (req, res, next) => {
    if (!req.session.authenticated) return res.redirect("/login");
    next();
}, async (req, res) => {
    const sql = {
        users: `SELECT u.userName, u.country, u.deviceModel, u.platform, s.startTime, s.endTime,
                       TIMESTAMPDIFF(MINUTE, s.startTime, s.endTime) AS duration_min
                FROM usuarios u
                LEFT JOIN sesiones s ON u.id = s.userId
                WHERE s.startTime IS NOT NULL
                ORDER BY s.startTime DESC
                LIMIT 15`,
        totalUsers: `SELECT COUNT(*) AS total FROM usuarios`,
        avgSession: `SELECT ROUND(AVG(duration_seconds)/60, 2) AS avg FROM sesiones`,
        countries: `SELECT COUNT(DISTINCT country) AS total FROM usuarios`,
        activeToday: `SELECT COUNT(*) AS total FROM sesiones WHERE DATE(startTime) = CURDATE()`,
        thisWeek: `SELECT COUNT(*) AS total FROM sesiones WHERE startTime >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
        topDevice: `SELECT deviceModel, COUNT(*) AS total FROM usuarios GROUP BY deviceModel ORDER BY total DESC LIMIT 1`,
        topLanguage: `SELECT systemLanguage, COUNT(*) AS total FROM usuarios GROUP BY systemLanguage ORDER BY total DESC LIMIT 1`,
        topPlatform: `SELECT platform, COUNT(*) AS total FROM usuarios GROUP BY platform ORDER BY total DESC LIMIT 1`,
        sessionsByDay: `SELECT DATE(startTime) as day, COUNT(*) AS count
                        FROM sesiones
                        WHERE startTime >= DATE_SUB(CURDATE(), INTERVAL 15 DAY)
                        GROUP BY day
                        ORDER BY day ASC`,
        countriesPie: `SELECT country, COUNT(*) AS total FROM usuarios GROUP BY country ORDER BY total DESC LIMIT 10`,
        durationHistogram: `SELECT FLOOR(duration_seconds / 60) AS duration_min, COUNT(*) AS count
                            FROM sesiones GROUP BY duration_min ORDER BY duration_min`,
        genderPlatform: `SELECT gender, platform, COUNT(*) AS total FROM usuarios GROUP BY gender, platform`
    };

    let connection;
    try {
        connection = await getDBConnection();
        const results = {};
        for (const [key, query] of Object.entries(sql)) {
            const [rows] = await connection.execute(query);
            results[key] = rows;
        }

        res.render("dashboard/index", {
            username: req.session.username,
            users: results.users,
            totalUsers: results.totalUsers[0]?.total ?? 0,
            avgSession: results.avgSession[0]?.avg ?? 0,
            countries: results.countries[0]?.total ?? 0,
            activeToday: results.activeToday[0]?.total ?? 0,
            sessionsThisWeek: results.thisWeek[0]?.total ?? 0,
            topDevice: results.topDevice[0]?.deviceModel ?? "N/A",
            topLanguage: results.topLanguage[0]?.systemLanguage ?? "N/A",
            topPlatform: results.topPlatform[0]?.platform ?? "N/A",
            sessionsByDay: results.sessionsByDay,
            countriesPie: results.countriesPie,
            durationHistogram: results.durationHistogram,
            genderPlatform: results.genderPlatform
        });

    } catch (err) {
        console.error("❌ Error en dashboard:", err);
        res.status(500).send("Error en el dashboard");
    } finally {
        if (connection) await connection.end();
    }
});

// ======================= LOGOUT =======================
app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/login"));
  })

// ========== 404 ==========
app.use((req, res) => {
    const url = req.originalUrl;
    res.status(404).render("not_found", { url });
});

// ========== INICIAR SERVIDOR ==========
app.listen(port, () => {
    console.log(`Servidor esperando en: http://${ipAddress}:${port}/login`);
});
