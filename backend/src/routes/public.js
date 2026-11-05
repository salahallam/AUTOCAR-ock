import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { pool } from '../db.js';
import { sendLoggedEmail, bookingEmailHtml } from '../services/email.js';
const router = Router();
const schema = z.object({
  name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254),
  cin: z.string().trim().min(4).max(30), phone: z.string().trim().min(7).max(30), city: z.string().trim().min(2).max(100),
  vehicleId: z.coerce.number().int().positive(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), website: z.string().max(0).optional()
});
const daysBetween = (a,b) => Math.round((Date.parse(`${b}T00:00:00Z`)-Date.parse(`${a}T00:00:00Z`))/86400000)+1;
router.get('/vehicles', async (_req,res,next) => {
 try { const { rows } = await pool.query('SELECT id,name,category,model_year,transmission,fuel,daily_price,image_path,description FROM vehicles WHERE is_active=TRUE ORDER BY id'); res.json(rows); } catch(e){next(e)}
});
router.get('/availability', async (req,res,next) => {
 try {
  const q=z.object({startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),endDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).safeParse(req.query);
  if(!q.success || q.data.endDate<q.data.startDate) return res.status(400).json({error:'Dates invalides.'});
  const {rows}=await pool.query(`SELECT v.id FROM vehicles v WHERE v.is_active=TRUE
    AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.vehicle_id=v.id AND b.status='confirmed' AND daterange(b.start_date,b.end_date,'[]') && daterange($1::date,$2::date,'[]'))
    AND NOT EXISTS (SELECT 1 FROM vehicle_blocks x WHERE x.vehicle_id=v.id AND daterange(x.start_date,x.end_date,'[]') && daterange($1::date,$2::date,'[]'))`,[q.data.startDate,q.data.endDate]);
  res.json({availableVehicleIds:rows.map(r=>r.id)});
 }catch(e){next(e)}
});
router.post('/bookings', async (req,res,next) => {
 const parsed=schema.safeParse(req.body);
 if(!parsed.success) return res.status(400).json({error:'Veuillez vérifier les champs du formulaire.',details:parsed.error.flatten().fieldErrors});
 const d=parsed.data;
 if(d.website) return res.status(400).json({error:'Demande invalide.'});
 const today=new Date().toISOString().slice(0,10);
 if(d.startDate<today || d.endDate<d.startDate) return res.status(400).json({error:'Les dates sélectionnées sont invalides.'});
 const totalDays=daysBetween(d.startDate,d.endDate);
 if(!Number.isInteger(totalDays)||totalDays<1||totalDays>365) return res.status(400).json({error:'Durée de location invalide.'});
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  const v=await client.query('SELECT id,name,daily_price FROM vehicles WHERE id=$1 AND is_active=TRUE FOR SHARE',[d.vehicleId]);
  if(!v.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Voiture introuvable.'});}
  const conflict=await client.query(`SELECT 1 FROM bookings WHERE vehicle_id=$1 AND status='confirmed' AND daterange(start_date,end_date,'[]') && daterange($2::date,$3::date,'[]')
    UNION ALL SELECT 1 FROM vehicle_blocks WHERE vehicle_id=$1 AND daterange(start_date,end_date,'[]') && daterange($2::date,$3::date,'[]') LIMIT 1`,[d.vehicleId,d.startDate,d.endDate]);
  if(conflict.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'Cette voiture n’est pas disponible pour ces dates.'});}
  const price=Number(v.rows[0].daily_price), total=price*totalDays;
  const ref=`ACR-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
  const inserted=await client.query(`INSERT INTO bookings(booking_reference,vehicle_id,customer_name,customer_email,customer_cin,phone,city,start_date,end_date,total_days,daily_price,total_price)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[ref,d.vehicleId,d.name,d.email,d.cin,d.phone,d.city,d.startDate,d.endDate,totalDays,price,total]);
  await client.query('COMMIT');
  const booking=inserted.rows[0], vehicleName=v.rows[0].name;
  const html=bookingEmailHtml(booking,vehicleName);
  await Promise.all([
   sendLoggedEmail({bookingId:booking.id,to:process.env.AGENCY_EMAIL||'salahallam036@gmail.com',subject:`Nouvelle demande ${ref}`,html,type:'agency_new_booking'}),
   sendLoggedEmail({bookingId:booking.id,to:d.email,subject:`Demande reçue — ${ref}`,html,type:'customer_booking_received'})
  ]);
  res.status(201).json({message:'Votre demande a été enregistrée. L’agence vous contactera pour confirmation.',reference:ref,status:'pending',totalDays,totalPrice:total});
 }catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.code==='23P01')return res.status(409).json({error:'La voiture vient d’être réservée pour ces dates. Choisissez d’autres dates.'});next(e)}
 finally{client.release()}
});
export default router;
