// src/email/email.worker.ts
import { parentPort, workerData } from 'worker_threads';
import * as sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendBatchEmails(users: string[], subject: string, text: string, html: string) {
  const msg = {
    to: users,
    from: 'alletre.auctions@gmail.com',
    subject,
    text,
    html,
  };

  try {
    await sgMail.sendMultiple(msg);
    parentPort?.postMessage({ success: true });
  } catch (error) {
    parentPort?.postMessage({ success: false, error });
  }
}

// workerData includes data passed from the main thread
sendBatchEmails(workerData.users, workerData.subject, workerData.text, workerData.html);
