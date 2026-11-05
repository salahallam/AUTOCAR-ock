# Ahmed Car Rent

Site vitrine en français + API Node.js/Express + PostgreSQL + notifications Resend + espace d'administration.

## Structure
- `index.html`, `css/`, `js/`, `assets/` : site public existant, relié à l'API.
- `backend/` : API, migrations SQL, authentification administrateur et envoi d'e-mails.
- `admin/` : tableau de bord privé (connexion, réservations, tarifs et visibilité des véhicules).

## Installation complète
Voir `backend/README.md`. Résumé :
1. Installer Node.js 20+ et PostgreSQL.
2. Créer la base `ahmed_car_rent`.
3. Copier `backend/.env.example` vers `backend/.env`, puis renseigner les secrets et identifiants.
4. Dans `backend/`, exécuter `npm install`, `npm run migrate`, `npm run seed:admin`, puis `npm start`.
5. Servir le dossier du projet avec un serveur web local (par exemple Live Server sur le port 5500). Ouvrir le site via ce serveur, pas en double-cliquant sur `index.html`.
6. Ouvrir `/admin/` pour accéder au tableau de bord.

L'API locale attendue par le frontend est `http://localhost:4000/api`. En production, configurez `window.AHMED_API_URL` avant `js/main.js` pour pointer vers l'URL HTTPS de votre API. Configurez les origines CORS dans le fichier `.env`.

## Règles de réservation
- Une journée minimum ; location le jour même autorisée.
- Le jour de départ et le jour de retour sont comptés inclusivement : départ et retour le même jour = un jour.
- Toutes les demandes commencent en attente (`pending`).
- Les demandes en attente ne bloquent pas la voiture.
- Seules les réservations confirmées bloquent les dates.
- Les blocages de maintenance/indisponibilité empêchent les réservations.
- Les confirmations et annulations déclenchent un e-mail au client si Resend est configuré.

## Avant la mise en production
Configurer un domaine d'envoi vérifié dans Resend, HTTPS, sauvegardes PostgreSQL, politique de conservation et notice de confidentialité. Le CIN est une donnée personnelle : limiter strictement les accès et ne pas conserver ces données plus longtemps que nécessaire.
