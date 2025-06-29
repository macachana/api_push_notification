import express, { Request, Response } from 'express';
import cors from 'cors'; 
import bodyParser from 'body-parser';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

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

console.log(serviceAccountPath);

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


//  Send notification to a specific user
// app.post('/notify', async (req: Request, res: Response): Promise<void> => {
//   if (!validateRequest(req, ['tokens', 'title', 'body'])) {
//     res.status(400).json({ error: 'Faltan datos en la solicitud.' });
//     return;
//   }

//   try {
//     const response = await sendPushNotification(req.body.tokens, req.body.title, req.body.body);
//     res.status(200).json(response);
//   } catch (error) {
//     res.status(500).json({ error: 'Error al enviar mensaje.', details: error });
//   }
// });
app.post("/notify", async (req: Request, res: Response) => {
  const { token, title, body }: { token: string; title: string; body: string } = req.body;

  const message: admin.messaging.Message = {
    notification: {
      title,
      body,
    },
    data: {
      customTitle: title,
      customBody: body,
      type: "inApp"
    },
    token,
  };
  // const message: admin.messaging.Message = {
  //   notification: {
  //     title,
  //     body,
  //   },
  //   token,
  // };

  try {
    const response = await admin.messaging().send(message);
    res.status(200).send(`Mensaje enviado correctamente: ${response}`);
  } catch (error) {
    res.status(500).send(`Error al enviar el mensaje: ${(error as Error).message}`);
  }
});

//  Send notification to all users with a specific role
app.post('/notify-role', async (req: Request, res: Response): Promise<void> => {
  console.log('📩 Datos recibidos en el backend:', req.body); // 🔍 Ver qué está llegando

  if (!validateRequest(req, ['tokens', 'title', 'body'])) {
    console.error('⚠️ Solicitud inválida:', req.body);
    res.status(400).json({ error: 'Faltan datos en la solicitud.' });
    return;
  }

  try {
    const response = await sendPushNotification(req.body.tokens, req.body.title, req.body.body);
    res.status(200).json(response);
  } catch (error) {
    console.error('❌ Error en Firebase:', error);
    res.status(500).json({ error: 'Error al enviar mensaje.', details: error });
  }
});

// app.post("/notify-role", async (req: Request, res: Response) => {
//   const { title, body, role }: { title: string; body: string; role: string } = req.body;

//   try {
//     const employeeTokens: string[] = [];

//     const querySnapshot = await supabase
//     .from("tokens")
//     .select("usuario")
//     .eq("usuario.tipo", role);

//     querySnapshot.forEach((doc) => {
//       const data = doc.data() as { token?: string };
//       if (data.token) {
//         employeeTokens.push(data.token);
//       }
//     });

//     if (employeeTokens.length === 0) {
//       return res
//         .status(404)
//         .send("No hay usuarios a los que enviar un mensaje");
//     }

//     const message: admin.messaging.MulticastMessage = {
//       notification: {
//         title,
//         body,
//       },
//       tokens: employeeTokens,
//     };

//     const response = await admin.messaging().sendEachForMulticast(message);
//     res.status(200).send(`Mensajes enviados: ${response.successCount}`);
//   } catch (error) {
//     res.status(500).send(`Error al enviar mensaje: ${(error as Error).message}`);
//   }
// });


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});