# Vercel Deployment Guide

## Quick Deploy

1. **Install Vercel CLI** (optional but recommended):
   ```bash
   npm i -g vercel
   ```

2. **Deploy Frontend**:
   ```bash
   cd frontend
   vercel
   ```

3. **Follow prompts**:
   - Link to existing project or create new
   - Set environment variables
   - Deploy!

## Environment Variables Needed

Set these in Vercel Dashboard (Settings → Environment Variables):

- `NEXT_PUBLIC_BUNDLER_URL` - Your bundler service URL
  - Example: `https://your-bundler.railway.app` or `https://your-bundler.herokuapp.com`

## Making Changes After Deployment

### Option 1: Git Push (Recommended)
```bash
# Make changes
git add .
git commit -m "Update UI"
git push

# Vercel automatically deploys!
```

### Option 2: Manual Deploy
```bash
cd frontend
vercel --prod
```

### Option 3: Preview Deployments
```bash
# Create a branch
git checkout -b feature/new-ui
# Make changes
git push origin feature/new-ui

# Vercel creates a preview URL automatically!
```

## Continuous Deployment Workflow

1. **Initial Setup**:
   - Connect GitHub/GitLab repo to Vercel
   - Set environment variables
   - First deployment happens automatically

2. **Daily Workflow**:
   - Edit code locally
   - Test with `npm run dev`
   - Commit & push
   - Vercel auto-deploys

3. **Preview URLs**:
   - Every branch gets its own preview URL
   - Share with team for review
   - Merge to main → production

## Important Notes

### Frontend (Next.js)
- ✅ Deploys to Vercel automatically
- ✅ Static files work out of the box
- ✅ Environment variables: Set in Vercel dashboard

### Bundler Service (Node.js/Express)
- ⚠️ Needs separate hosting (Vercel Serverless Functions or separate service)
- Options:
  - **Railway** (recommended): `railway up`
  - **Render**: Connect repo and deploy
  - **Heroku**: `heroku create && git push heroku main`
  - **Vercel Serverless Functions**: Convert `bundler/index.js` to Vercel API routes

### deployments.json
- Currently loaded from `../../deployments.json`
- For Vercel, you may want to:
  - Host this file somewhere (GitHub Gist, IPFS, etc.)
  - Or use environment variables for contract addresses

## Deploying Bundler to Vercel (Alternative)

Convert bundler to Vercel Serverless Functions:

1. Move `bundler/index.js` to `frontend/api/process-payload.js`
2. Update imports
3. Vercel will auto-detect and deploy as serverless function

Then your bundler URL would be:
- `https://your-app.vercel.app/api/process-payload`

## Troubleshooting

### Build Fails
- Check `next.config.js` is correct
- Ensure all dependencies are in `package.json`
- Check build logs in Vercel dashboard

### Environment Variables Not Working
- Must be prefixed with `NEXT_PUBLIC_` for client-side access
- Set in Vercel dashboard: Settings → Environment Variables
- Redeploy after adding variables

### deployments.json Not Found
- Upload `deployments.json` to a public URL
- Or set contract addresses as environment variables
- Or commit `deployments.json` to repo (if not sensitive)

