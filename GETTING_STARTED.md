# 🚀 GETTING STARTED - Jitsi Frontend

Welcome! Your Jitsi Meeting Frontend is ready. Follow these 3 simple steps to get started.

## Step 1: Install (2 minutes)

```bash
cd Jitsi-frontend
npm install
```

**Expected output:**
```
added 200+ packages
```

## Step 2: Start Development (1 minute)

```bash
npm run dev
```

**Expected output:**
```
VITE v5.0.8 ready in 123 ms
➜  Local:   http://localhost:3000/
```

## Step 3: Test Meeting (Open browser immediately!)

```
http://localhost:3000?room=test-meeting
```

**What you'll see:**
1. Loader with animated spinner
2. "Connecting..." status
3. Elapsed time counter
4. After ~10 seconds: Jitsi meeting interface

## ✅ You're Running!

If you see the Jitsi meeting room, congratulations! 🎉

---

## 📚 Next: Read Documentation

Choose based on your need:

| Need | File | Time |
|------|------|------|
| Quick reference | QUICKSTART.md | 5 min |
| Understanding it | README.md | 20 min |
| Deploying it | DEPLOYMENT.md | 15 min |
| Connecting to main app | INTEGRATION.md | 10 min |

---

## 🆘 Troubleshooting

### Blank page or error?

1. **Check console for errors** (F12 → Console tab)
2. **Check that backend is running** (should be at jitsi-activation-backend.onrender.com)
3. **Check .env.local** (is VITE_DEBUG=true?)
4. **Try fresh install**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   npm run dev
   ```

### Stuck on loading?

1. Open browser console (F12)
2. Look for log messages
3. Check Network tab for failed requests
4. If backend not responding, it will timeout after 90 seconds
5. Click "Retry" button to try again

### Other issues?

- See COMPLETE_OVERVIEW.md for detailed troubleshooting
- Check README.md for feature explanations
- See DEPLOYMENT.md for deployment-specific issues

---

## 🎯 Common Commands

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run preview    # Preview production build
npm run lint       # Check for TypeScript errors
```

---

## 📁 Project Structure

```
Jitsi-frontend/
├── src/
│   ├── pages/MeetingPage.tsx       # Main meeting logic
│   ├── components/                 # UI components
│   ├── services/meetingService.ts # Backend polling
│   ├── utils/sanitization.ts      # Helpers
│   └── index.css                   # Styling
├── package.json
├── vite.config.ts
└── ...documentation files
```

---

## 🔧 Environment Variables

**Already configured in `.env.local`:**

```env
VITE_JITSI_BACKEND_URL=https://jitsi-activation-backend.onrender.com
VITE_JITSI_DOMAIN=meet.vmtb.in
VITE_MAIN_APP_URL=http://localhost:5173
VITE_DEBUG=true
```

**For production**, update `VITE_MAIN_APP_URL` and set `VITE_DEBUG=false`.

---

## 🎬 What's Happening Behind the Scenes?

1. **Frontend Starts**: Loads at http://localhost:3000
2. **Backend Called**: Polls every 5 seconds to start Jitsi server
3. **Loader Shows**: While waiting for server
4. **State Machine**: Skips first "already_running", confirms on second
5. **Jitsi Loads**: External API creates meeting
6. **User Experience**: Can participate in meeting
7. **Exit**: Returns to main app (or configured return URL)

---

## ✨ What You Can Do Now

- ✅ Test meeting page locally
- ✅ See loader animation
- ✅ Join a virtual meeting
- ✅ Review code structure
- ✅ Read documentation
- ✅ Prepare for deployment

---

## 🚀 Next Steps

### Today
- [ ] Run `npm install` (2 min)
- [ ] Run `npm run dev` (1 min)
- [ ] Test meeting at http://localhost:3000?room=test (5 min)

### This Week
- [ ] Read QUICKSTART.md or README.md
- [ ] Choose deployment option (Netlify/Vercel/Docker)
- [ ] Deploy to production
- [ ] Integrate with main app

### Later
- [ ] Test in production
- [ ] Gather user feedback
- [ ] Optimize performance
- [ ] Add custom features

---

## 📞 Resources

- **Questions?** Check README.md
- **Deploy?** Follow DEPLOYMENT.md
- **Integrate?** Follow INTEGRATION.md
- **Errors?** Enable VITE_DEBUG=true and check console

---

## 🎉 You're All Set!

Your Jitsi Meeting Frontend is ready to use.

**Get started now:**

```bash
cd Jitsi-frontend
npm install
npm run dev
```

Then open: http://localhost:3000?room=test-meeting

Happy meetings! 🎥

---

**Questions?** Check the documentation files or browser console logs (F12).
