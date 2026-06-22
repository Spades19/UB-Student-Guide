# Railway Deployment Guide

## What Was Changed For Hosting

1. `server.js` now uses `process.env.PORT || 5000`.
   Railway assigns a port automatically, so the app must listen on that value.

2. `server.js` now supports Railway MySQL variables:
   - `MYSQLHOST`
   - `MYSQLUSER`
   - `MYSQLPASSWORD`
   - `MYSQLDATABASE`
   - `MYSQLPORT`

3. Browser JavaScript now uses relative API paths such as `/login`, `/chat`, and `/api/admin/analytics`.
   This lets the same frontend work locally and on the deployed Railway domain.

4. `railway.json` tells Railway to start the app with `npm start`.

5. `.env.example` lists the environment variables needed for deployment.

## Deploy Steps

1. Push the project to GitHub.

2. Open Railway and create a new project.

3. Add a MySQL database service to the Railway project.

4. Add a Node.js service from your GitHub repository.

5. In the Node.js service variables, add:
   ```text
   GEMINI_API_KEY=your_real_key
   JWT_SECRET=a_long_random_secret
   ```

6. Make sure the Node.js service can access the MySQL variables from the MySQL service.
   Railway usually provides `MYSQLHOST`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`, and `MYSQLPORT`.

7. Deploy the Node.js service.

8. Seed the hosted knowledge base after the first deployment:
   ```bash
   npm run seed
   ```

9. Open the public Railway URL.

10. Register or log in, then test:
   - chat
   - history
   - sessions
   - admin login
   - admin dashboard

## After Deployment

Promote your own user to admin from the Railway shell or locally against the Railway DB:

```bash
npm run make-admin your-email@example.com
```

Then log out and log back in.

## Important

Do not upload your real `.env` file to GitHub. It is already listed in `.gitignore`.
