HUDDLE - class chat for the college network
============================================

FEATURES
- Every person gets a 4-digit PIN. Type a friend's PIN to chat with them privately.
- Group chat: type 6767 (change it in server.js, top of the file).
- Send documents, photos and voice messages.
- Voice lounge in the group: press "Join voice" and talk. Everyone in the call is shown on top.

RUN IT (host PC)
1. Install Node.js (nodejs.org) if you don't have it. Any version 18 or newer.
2. Double-click start.bat   (or open a terminal here and run:  node server.js)
3. The window prints your link, like  https://172.16.25.72:3443
4. First time only, Windows asks to allow access: tick both Private and Public, click Allow.
   If classmates still cannot connect, right-click allow-firewall.bat > Run as administrator.
5. Keep that window open. Closing it stops the site.

SHARE IT
Send classmates the https link (WhatsApp, class group, or write it on the board).
Their browser shows "Your connection is not private". This is normal for a home-made site:
  Chrome/Edge:  Advanced > Proceed to (site)
  Firefox:      Advanced > Accept the Risk and Continue
  Phone:        Show details / Advanced > visit this website
Then type a name and get a PIN. Done.

WHY HTTPS?
Browsers only allow the microphone on https pages (or localhost). Chat and files work on
the http link too, but voice messages and voice calls need the https link.

TIPS
- The host PC must stay on, awake and connected to the college network.
- If the host's IP changes, restart the server and share the new link it prints.
- Voice call works best for up to about 6-8 people at once.
- Lost your PIN on a new browser? Sign in > "I have a PIN" > PIN + the name you signed up with.
- Chats and files are saved in the data and uploads folders next to server.js.
  Delete both folders to start fresh.
- Change the group PIN / name: edit the GROUPS line at the top of server.js.

REACT FRONTEND (v2)
- The screen you see is now a React app. Its source is in the client folder (client/src).
- The finished build is in client/dist and server.js serves it automatically.
- After you change anything in client/src, rebuild it:   npm run build     (needs internet once for packages)
- Live-editing while developing: run "node server.js" in one terminal, then in another:
      npm run dev:client      and open http://localhost:5173
  (Microphone works on localhost.)
- The old plain frontend is still in the public folder. server.js uses it only if client/dist is missing.
