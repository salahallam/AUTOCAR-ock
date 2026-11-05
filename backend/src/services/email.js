import { Resend } from 'resend';
import { pool } from '../db.js';
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
export async function sendLoggedEmail({ bookingId, to, subject, html, type }) {
  if (!resend || !process.env.EMAIL_FROM) {
    await pool.query(`INSERT INTO email_logs(booking_id,recipient,email_type,status,error_message) VALUES($1,$2,$3,'skipped','Resend not configured')`, [bookingId,to,type]);
    return;
  }
  try {
    const { data, error } = await resend.emails.send({ from: process.env.EMAIL_FROM, to, subject, html });
    if (error) throw new Error(error.message);
    await pool.query(`INSERT INTO email_logs(booking_id,recipient,email_type,provider_id,status) VALUES($1,$2,$3,$4,'sent')`, [bookingId,to,type,data?.id ?? null]);
  } catch (e) {
    await pool.query(`INSERT INTO email_logs(booking_id,recipient,email_type,status,error_message) VALUES($1,$2,$3,'failed',$4)`, [bookingId,to,type,String(e.message).slice(0,1000)]);
    console.error('Email delivery failed:', e.message);
  }
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function bookingEmailHtml(b, vehicleName) {
 return `<div style="font-family:Arial,sans-serif;line-height:1.7"><h2>Demande de réservation ${esc(b.booking_reference)}</h2><p>Client : ${esc(b.customer_name)}</p><p>Voiture : ${esc(vehicleName)}</p><p>Dates : ${esc(b.start_date)} au ${esc(b.end_date)}</p><p>Durée : ${b.total_days} jour(s)</p><p>Total estimé : ${b.total_price} DH</p><p>Statut : En attente de confirmation de l'agence.</p></div>`;
}
