# Cloudflare R2 CDN Setup Guide

Follow these steps to configure Global CDN storage for your videos. This ensures videos play smoothly without buffering, even with many users.

**Cost:** Free tier includes 10GB storage and zero egress fees (data transfer is free!).

## Step 1: Create a Cloudflare Account
1. Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. Create an account if you don't have one.

## Step 2: Enable R2 Storage
1. On the dashboard sidebar, verify you see **R2**. If not, you may need to add a payment method (even for the free tier, to prevent abuse).
2. Click on **R2** in the sidebar.
3. Click **Create Bucket**.
4. Name the bucket: `lms-videos` (or `bwc-lms-assets` if that's taken/preferred).
5. Click **Create Bucket**.

## Step 3: Enable Public Access (Important!)
1. Inside your new bucket, go to the **Settings** tab.
2. Scroll down to **R2.dev subdomain**.
3. Click **Allow Access**.
4. Copy the **Public R2.dev Bucket URL** (e.g., `https://pub-xxxxxxxx.r2.dev`).
   - This corresponds to `R2_PUBLIC_URL` in your `.env`.

## Step 4: Generate API Credentials
1. Go back to the main **R2** page (click R2 in sidebar).
2. On the right side, look for **Manage R2 API Tokens**. Click it.
3. Click **Create API token**.
4. **Permissions:** Select **Admin Read & Write**.
5. **TTL:** Leave as "Forever" or "Active".
6. Click **Create API Token**.

## Step 5: Copy Credentials to .env
You will see a screen with your secrets. **Do not close this screen until you copy them!**

Update your `backend/.env` file with these values:

```env
# Copy "Account ID" from the dashboard (often found on the main R2 page or Account Home)
CLOUDFLARE_ACCOUNT_ID=your_account_id_here

# Copy "Access Key ID" from the token creation screen
R2_ACCESS_KEY_ID=your_access_key_id_here

# Copy "Secret Access Key" from the token creation screen
R2_SECRET_ACCESS_KEY=your_secret_access_key_here

# The name of the bucket you created in Step 2
R2_BUCKET_NAME=lms-videos

# The "Public R2.dev Bucket URL" from Step 3
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

## Step 6: Verify
1. Restart your backend server (`Ctrl+C` then `python server.py`).
2. The logs will show `CDN enabled` if configured correctly.
3. Upload a new video in the app.
4. Check the logs: it should say `Uploaded to CDN: ...`.

### Troubleshooting
- **403 Forbidden:** Check if you selected "Admin Read & Write" permissions.
- **Connection Error:** Ensure your `CLOUDFLARE_ACCOUNT_ID` is correct (it's a 32-character hex string).
- **Video not playing:** Ensure `R2_PUBLIC_URL` starts with `https://` and does NOT end with a slash `/`.
