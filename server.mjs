import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import crypto from "crypto";
import path from "path";
import session from "express-session";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
    secret: "clave-super-secreta",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

const port = process.env.PORT ?? 8080;
const ipAddress = process.env.C9_HOSTNAME ?? 'localhost';

// Conexión a MySQL
async function getDBConnection() {
    return await mysql.createConnection({
        host: "databaseunity.c53ikkaxvzot.us-east-1.rds.amazonaws.com",//process.env.MYSQL_HOST,
        user: "admin",//process.env.MYSQL_USER,
        password: "moises123",//process.env.MYSQL_PASSWORD,
        database: "databaseunity",
        waitForConnections: true
    });
}

// ==================== ✅ DIRECTORIO RAIZ==================
app.get("/", (req, res) => res.redirect("/login"));

// ==================== ✅ LOGIN EXTENDIDO PARA UNITY====================
app.post("/loginUser", async (req, res) => {
    const { username, pass } = req.body;

    if (!username || !pass) {
        console.warn("⚠️ Faltan campos para login:", req.body);
        return res.json({ done: false, message: "Faltan datos" });
    }

    let connection;
    try {
        const passHash = crypto.createHash("sha256").update(pass).digest("hex");
        connection = await getDBConnection();

        const [result] = await connection.execute(
            "SELECT id, userName, password FROM usuarios WHERE userName = ?",
            [username]
        );

        if (result.length === 0 || result[0].password !== passHash) {
            return res.json({ done: false, message: "Credenciales incorrectas" });
        }

        const user = result[0];
        console.log("✅ Login correcto:", username);
        return res.json({ done: true, message: "Login exitoso. Bienvenido!", userId: user.id });

    } catch (err) {
        console.error("❌ Error al buscar usuario:", err);
        return res.json({ done: false, message: "Error en el servidor" });
    } finally {
        if (connection) await connection.end();
    }
});

// ==================== ✅ REGISTRO EXTENDIDO ====================
app.post("/createUser", async (req, res) => {
    const {
        username, email, pass, birthDate, gender,
        country, deviceModel, operatingSystem, platform, systemLanguage
    } = req.body;

    if (!username || !email || !pass) {
        return res.json({ done: false, message: "Faltan campos" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.json({ done: false, message: "Correo no válido" });
    }

    const passHash = crypto.createHash("sha256").update(pass).digest("hex");

    let connection;
    try {
        connection = await getDBConnection();

        const [userCheck] = await connection.execute(
            "SELECT * FROM usuarios WHERE userName = ?",
            [username]
        );
        if (userCheck.length > 0) {
            return res.json({ done: false, message: "El usuario ya existe" });
        }

        const [emailCheck] = await connection.execute(
            "SELECT * FROM usuarios WHERE email = ?",
            [email]
        );
        if (emailCheck.length > 0) {
            return res.json({ done: false, message: "El correo ya está registrado" });
        }

        const insertSQL = `
            INSERT INTO usuarios
            (userName, email, password, birthDate, gender, country, deviceModel, operatingSystem, platform, systemLanguage)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

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

// ==================== ✅ GUARDAR SESIÓN ====================
app.post("/saveSession", async (req, res) => {
    const { userId, startTime, endTime } = req.body;

    if (!userId || !startTime || !endTime) {
        return res.json({ done: false, message: "Datos incompletos" });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start) || isNaN(end)) {
        return res.json({ done: false, message: "Fechas inválidas" });
    }

    const duration = Math.floor((end - start) / 1000);

    let connection;
    try {
        connection = await getDBConnection();
        const sql = `
            INSERT INTO sesiones (userId, startTime, endTime, duration_seconds)
            VALUES (?, ?, ?, ?)
        `;

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

// ==================== ✅ LOGIN PARA DASHBOARD====================

app.get("/login", (req, res) => {
  res.render("dashboard/login", { error: null });
});

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

app.get("/dashboard", async (req, res) => {
    if (!req.session.authenticated) {
        return res.redirect("/login");
    }
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
        totalUsers: `SELECT COUNT(*) AS total FROM usuarios`,
        avgSession: `SELECT ROUND(AVG(duration_seconds)/60, 2) AS avg FROM sesiones`,
        countries: `SELECT COUNT(DISTINCT country) AS total FROM usuarios`,
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
            ORDER BY day ASC
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

    let connection;
    try {
        connection = await getDBConnection();

        const results = {};
        for (const [key, query] of Object.entries(sql)) {
            const [rows] = await connection.execute(query);
            results[key] = rows;
        }

        res.render("dashboard/index", {
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

// Página de recurso no encontrado (estatus 404)
app.use((req, res) => {
  const url = req.originalUrl;
  res.status(404).render('not_found', { url });
});

// ==================== 🔊 INICIAR SERVIDOR ====================
app.listen(port, () => {
    console.log(`Servidor esperando en: http://${ipAddress}:${port}`);
});
