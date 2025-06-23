import express, { Request, Response } from 'express';
import cors from 'cors'; 
import bodyParser from 'body-parser';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// const cred = fs.readFileSync('./notificationpps-firebase-adminsdk-fbsvc-605ff89b9f.json','utf-8');
// const serviceAccount = JSON.stringify(JSON.parse(cred));

// const serviceAccount = require('notificationpps-firebase-adminsdk-fbsvc-69dcbb76d4.json');

const app = express();
const PORT = process.env.PORT || 3000;

const db = admin.firestore();

app.use(bodyParser.json());

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

//  Initialize Supabase
const SUPABASE_URL = process.env.DATABASE_URL || '';
const SUPABASE_KEY = process.env.DATABASE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

//  Load Firebase credentials
const serviceAccountPath = process.env.SERVICE_ACCOUNT!;
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

//  Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
console.log('✅ Firebase Admin inicializado con el proyecto:', serviceAccount.project_id);
app.use(bodyParser.json());

//  Validate if required data exists in the request
function validateRequest(req: Request, fields: string[]): boolean {
  return fields.every((field) => req.body[field]);
}

//  Get push tokens from Supabase (for individual users or by role)
async function getPushTokens(filter: {
  field: string;
  value: string | number;
}): Promise<string[]> {
  const { data, error } = await supabase
    .from('device_tokens') 
    .select('token')
    .eq(filter.field, filter.value);

  if (error) {
    console.error('❌ Error obteniendo tokens:', error.message);
    return [];
  }

  return data.map((entry) => entry.token).filter((token) => token);
}

// Send push notification using Firebase Cloud Messaging
async function sendPushNotification(tokens: string[], title: string, body: string) {
  if (tokens.length === 0) {
    console.warn("No hay tokens disponibles para enviar la notificación.");
    return { success: false, sentCount: 0 };
  }

  const message = {
    notification: { title, body },
    data: { title, body },
    tokens,
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log('📊 Respuesta completa de Firebase:', JSON.stringify(response, null, 2)); // Log detallado
    return response;
  } catch (error) {
    console.error('❌ Error en sendPushNotification de Firebase:', error);
    throw error; 
  }
}


// Endpoint para enviar una notificación a un usuario específico
app.post("/notify", async (req, res) => {
  const { token, title, body } = req.body;

  const message = {
    notification: {
      title: title,
      body: body,
    },
    token: token,
  };

  try {
    const response = await admin.messaging().send(message);
    res.status(200).send(`Mensaje enviado correctamente: ${response}`);
  } catch (error) {
    res.status(500).send(`Error al enviar el mensaje: ${error}`);
  }
});

// Endpoint para enviar notificación a todos los empleados de un rol
app.post("/notify-role", async (req, res) => {
  const { title, body, role } = req.body;

  try {
    const employeeTokens : any[] = [];
    const querySnapshot = await db
      .collection("users")
      .where("role", "==", role)
      .get();
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.token) {
        employeeTokens.push(data.token);
      }
    });

    if (employeeTokens.length === 0) {
      return res
        .status(404)
        .send("No hay usuarios a los que enviar un mensaje");
    }

    const message = {
      notification: {
        title: title,
        body: body,
      },
      tokens: employeeTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    res.status(200).send(`Mensajes enviados: ${response.successCount}`);
  } catch (error) {
    res.status(500).send(`Error al enviar mensaje: ${error}`);
  }
});

// Endpoint para enviar un mail a un usuario
app.post("/send-mail", async (req, res) => {
  try {
    const { aceptacion, nombreUsuario, mail } = req.body;
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.MAIL,
        pass: process.env.PASSWORD,
      },
    });

    let resultado = await transporter.sendMail({
      from: '"Mi Comanda" <comandaferrero@gmail.com>',
      to: mail,
      subject: aceptacion
        ? "Felicitaciones su cuenta fue aceptada"
        : "Disculpe pero hemos bloqueado su cuenta",
      html: `
      <h1>${aceptacion ? "Felicitaciones " : "Disculpe "} ${nombreUsuario}</h1>
      <p>Su cuenta fue ${aceptacion ? "aceptada" : "rechazada"}</p>
      <p>Saludos La Comanda</p>
      `,
    });
    res.json({ ...resultado, seEnvio: true });
  } catch (e) {
    res.json({
      mensaje: "No se pudo enviar el mail",
      seEnvio: false,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});