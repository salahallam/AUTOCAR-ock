import { Router } from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { sendLoggedEmail, bookingEmailHtml } from '../services/email.js';
const router=Router();
router.post('/login',async(req,res,next)=>{
 try{
  const p=z.object({email:z.string().email().max(254),password:z.string().min(1).max(200)}).safeParse(req.body);
  if(!p.success)return res.status(400).json({error:'Identifiants invalides.'});
  const {rows}=await pool.query('SELECT id,email,password_hash FROM admins WHERE email=$1 AND is_active=TRUE',[p.data.email.toLowerCase()]);
  if(!rows.length||!(await argon2.verify(rows[0].password_hash,p.data.password)))return res.status(401).json({error:'E-mail ou mot de passe incorrect.'});
  const a=rows[0];await pool.query('UPDATE admins SET last_login_at=NOW() WHERE id=$1',[a.id]);
  const token=jwt.sign({id:a.id,email:a.email},process.env.JWT_SECRET,{expiresIn:'8h'});
  res.cookie('admin_token',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',maxAge:8*60*60*1000});
  res.json({admin:{id:a.id,email:a.email}});
 }catch(e){next(e)}
});
router.post('/logout',(_req,res)=>{res.clearCookie('admin_token',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict'});res.json({message:'Déconnecté.'})});
router.use(requireAdmin);
router.get('/me',(req,res)=>res.json({admin:req.admin}));
router.get('/dashboard',async(_req,res,next)=>{try{
 const [counts,recent,vehicles]=await Promise.all([
  pool.query(`SELECT COUNT(*) FILTER(WHERE status='pending')::int pending,COUNT(*) FILTER(WHERE status='confirmed')::int confirmed,COUNT(*)::int total FROM bookings`),
  pool.query(`SELECT b.id,b.booking_reference,b.customer_name,b.customer_email,b.phone,b.city,b.start_date,b.end_date,b.total_days,b.total_price,b.status,b.created_at,v.name vehicle_name FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id ORDER BY b.created_at DESC LIMIT 100`),
  pool.query('SELECT id,name,daily_price,is_active FROM vehicles ORDER BY id')
 ]);res.json({counts:counts.rows[0],bookings:recent.rows,vehicles:vehicles.rows});
 }catch(e){next(e)}});
router.patch('/bookings/:id/status',async(req,res,next)=>{
 const p=z.object({status:z.enum(['confirmed','cancelled','completed']),adminNote:z.string().max(1000).optional()}).safeParse(req.body);
 if(!p.success)return res.status(400).json({error:'Statut invalide.'});
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const old=await c.query(`SELECT b.*,v.name vehicle_name FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id WHERE b.id=$1 FOR UPDATE`,[req.params.id]);
  if(!old.rowCount){await c.query('ROLLBACK');return res.status(404).json({error:'Réservation introuvable.'})}
  const b=old.rows[0];
  if(p.data.status==='confirmed'){
   await c.query('SELECT id FROM vehicles WHERE id=$1 FOR UPDATE',[b.vehicle_id]);
   const blocked=await c.query(`SELECT 1 FROM vehicle_blocks WHERE vehicle_id=$1 AND daterange(start_date,end_date,'[]') && daterange($2::date,$3::date,'[]') LIMIT 1`,[b.vehicle_id,b.start_date,b.end_date]);
   if(blocked.rowCount){await c.query('ROLLBACK');return res.status(409).json({error:'La voiture est bloquée pour ces dates.'})}
  }
  const updated=await c.query(`UPDATE bookings SET status=$2,admin_note=$3,confirmed_at=CASE WHEN $2='confirmed' THEN NOW() ELSE confirmed_at END,cancelled_at=CASE WHEN $2='cancelled' THEN NOW() ELSE cancelled_at END,updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,p.data.status,p.data.adminNote??null]);
  await c.query(`INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,details) VALUES($1,$2,'booking',$3,$4)`,[req.admin.id,`booking_${p.data.status}`,b.id,JSON.stringify({from:b.status,to:p.data.status})]);
  await c.query('COMMIT');
  const updatedBooking=updated.rows[0];
  if(p.data.status==='confirmed'||p.data.status==='cancelled'){
   const html=bookingEmailHtml(updatedBooking,b.vehicle_name)+`<p>Nouvel état : ${p.data.status==='confirmed'?'Confirmée':'Annulée'}</p>`;
   await sendLoggedEmail({bookingId:b.id,to:b.customer_email,subject:`Réservation ${updatedBooking.booking_reference} — ${p.data.status==='confirmed'?'confirmée':'annulée'}`,html,type:`customer_${p.data.status}`});
  }
  res.json({booking:updatedBooking});
 }catch(e){await c.query('ROLLBACK').catch(()=>{});if(e.code==='23P01')return res.status(409).json({error:'Chevauchement avec une autre réservation confirmée.'});next(e)}finally{c.release()}
});
router.post('/vehicles/:id/blocks',async(req,res,next)=>{
 const p=z.object({startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),endDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),reason:z.enum(['maintenance','unavailable']).default('unavailable'),notes:z.string().max(1000).optional()}).safeParse(req.body);
 if(!p.success||p.data.endDate<p.data.startDate)return res.status(400).json({error:'Dates invalides.'});
 try{const c=await pool.connect();try{await c.query('BEGIN');const vehicle=await c.query('SELECT id FROM vehicles WHERE id=$1 AND is_active=TRUE FOR UPDATE',[req.params.id]);if(!vehicle.rowCount){await c.query('ROLLBACK');return res.status(404).json({error:'Voiture introuvable.'})}const booked=await c.query(`SELECT 1 FROM bookings WHERE vehicle_id=$1 AND status='confirmed' AND daterange(start_date,end_date,'[]') && daterange($2::date,$3::date,'[]') LIMIT 1`,[req.params.id,p.data.startDate,p.data.endDate]);if(booked.rowCount){await c.query('ROLLBACK');return res.status(409).json({error:'Une réservation confirmée existe sur cette période.'})}const {rows}=await c.query(`INSERT INTO vehicle_blocks(vehicle_id,start_date,end_date,reason,notes,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[req.params.id,p.data.startDate,p.data.endDate,p.data.reason,p.data.notes??null,req.admin.id]);await c.query('COMMIT');res.status(201).json(rows[0]);}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}}
 catch(e){if(e.code==='23P01')return res.status(409).json({error:'Un blocage existe déjà sur cette période.'});next(e)}
});
router.patch('/vehicles/:id',async(req,res,next)=>{
 const p=z.object({dailyPrice:z.number().positive().max(100000),isActive:z.boolean()}).safeParse(req.body);
 if(!p.success)return res.status(400).json({error:'Données invalides.'});
 try{const {rows}=await pool.query('UPDATE vehicles SET daily_price=$2,is_active=$3,updated_at=NOW() WHERE id=$1 RETURNING id,name,daily_price,is_active',[req.params.id,p.data.dailyPrice,p.data.isActive]);if(!rows.length)return res.status(404).json({error:'Voiture introuvable.'});res.json(rows[0]);}catch(e){next(e)}
});
export default router;
