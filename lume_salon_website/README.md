# Lumé Salon & Spa Website

A mobile-first salon and spa website built with HTML5, CSS3, and vanilla JavaScript.

## Features

- Responsive landing page with JSON-driven service catalog
- Accessible booking modal with customer and phone validation
- Live availability based on service duration, stylist schedules, blocked times, and confirmed appointments
- Automatic appointment confirmation backed by Supabase/PostgreSQL
- Database-side locking and an overlap constraint to prevent double bookings
- Interactive local-only admin demo at `admin.html` for the school tech expo

## Run locally

The service catalog is fetched from JSON, so serve the project over HTTP instead of opening `index.html` directly.

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Configure Supabase before enabling bookings

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql).
3. Add the project's Project URL and **anon/public** key to [`js/supabase-config.js`](./js/supabase-config.js). Never put a `service_role` key in this website.
4. Keep the `timeZone` value in `js/supabase-config.js` aligned with `salon_settings.time_zone` in the database. The default is `America/Jamaica`.
5. In Supabase Authentication, create an email/password user for each admin. Disable public sign-ups in Authentication settings.
6. Authorize an admin by running this in the SQL Editor, replacing the email with the exact staff account email:

   ```sql
   insert into public.salon_admins (user_id)
   select id from auth.users where email = 'admin@example.com'
   on conflict (user_id) do nothing;
   ```

   Do not expose `salon_admins` or grant public users table access. Only users in this table can call the admin database functions.
7. Add each stylist in the Supabase Table Editor (`staff`), assign their supported services (`staff_services`), and create their initial weekly hours (`staff_hours`). Use PostgreSQL weekday numbers: Sunday `0`, Monday `1`, through Saturday `6`. After setup, admins can change weekly hours and special dates from `admin-live.html`.
8. Adjust service durations in the `services` table to the salon's actual booking durations. The starter values use the longest duration in each catalog range (for example, Silk Press is 120 minutes). These values determine which appointments fit.
9. Add breaks or other unavailable periods to `blocked_periods`. A null `staff_id` blocks the period for all stylists; otherwise it blocks only that stylist.
10. Deploy the site over HTTPS and test sign-in, schedule changes, and booking with separate accounts and browser sessions.

Appointments created through the website are immediately `confirmed`. The database serializes booking attempts for the same stylist and rejects overlapping appointments even if two customers submit at nearly the same time. When a slot is taken before a customer submits, the site asks them to choose another time.

The anon key is intended for browser use. Never put the Supabase `service_role` key or admin passwords in website code. Row-level security is enabled and direct table access is revoked for public roles; customer availability, booking, and staff admin operations are available only through database functions. The staff admin page uses Supabase Auth email/password login, keeps its session in memory, and only exposes admin RPC functions to authenticated users allowlisted in `salon_admins`. Use HTTPS in production, strong unique passwords, and an owner-managed process for removing former staff from the admin allowlist. The protected Supabase dashboard is still needed to provision staff and admin accounts. The site does not yet send email receipts.

## Expo admin demo

Open `admin-live.html` (or use **Salon admin** in the website footer) to sign in and manage live schedules and appointments. **Admin demo** opens the separate sample-only showcase at `admin.html`.

Open `admin.html` to showcase the sample salon dashboard. The demo lets you edit weekly hours, add one-day openings or closures, view sample appointments, and cancel a sample appointment. Changes are saved in that browser's local storage and can be cleared with **Reset demo**.

This is a presentation-only demo: it does not authenticate staff, connect to Supabase, change the public booking calendar, or manage real customer data. Do not use it as the salon's production admin system.

## Service catalog

Update display names, descriptions, images, and prices in `js/services.json`. Keep its service IDs aligned with the `services.id` values in Supabase. Manage booking durations separately in the database.

Prices are illustrative sample prices in Jamaican dollars (JMD). Online images and Google Fonts require an internet connection.
