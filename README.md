# Better Start Personalized — Prototype 1

This safely combines the live Better Start Reader with the 90-second personalization experience.

## What is connected

- `/` opens the live Reader.
- `/make-it-yours` opens the quick, playful personalization flow.
- **Open my edition** saves the choices privately in that browser and opens the real Reader.
- The Reader identifies itself as the person’s edition and composes the wall with a target balance of 65% direct interests, 20% adjacent discoveries and 15% Better Start editorial surprises.
- The established rage-free policy, duplicate protection, source spacing, seven-day memory, refresh rules, Tetris layout, mobile composition, Joy Bench, saving and branded sharing remain in force.
- **Generic Reader** clears the active personal edition without deleting the person’s interview answers.

## Login-free test deployment

This prototype does not need a database, login, environment variables or paid service. Each tester’s choices live only in their own browser on the Vercel address.

1. Create one new GitHub repository named `better-start-personalized`.
2. Upload the **contents** of this folder to that repository.
3. In Vercel, choose **Add New → Project**.
4. Import `better-start-personalized`.
5. Leave every setting at its default and click **Deploy**.
6. Share the resulting `https://...vercel.app` address. It is public and login-free.

Later, accounts and a database can make an edition follow a person across phones and computers. They are intentionally not required for this prototype.
