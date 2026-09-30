# Putting the site on your own server (Caddy)

The site is a folder of static files (`dist/` after `npm run build`). Caddy serves them and gets HTTPS certificates automatically.

## Quick route: build on the server from GitHub

Needs Node.js 22 or newer, git and Caddy on the server.

```bash
# first time
git clone https://github.com/viravelmozhna/knittedstorybears.git /opt/knittedstorybears
mkdir -p /var/www/knittedstorybears /var/www/knittedstorybears-caddy

# every update
cd /opt/knittedstorybears
git pull
npm ci
npm run build
rsync -a --delete dist/ /var/www/knittedstorybears/
cp deploy/caddy-redirects.caddy /var/www/knittedstorybears-caddy/redirects.caddy
systemctl reload caddy
```

Then do steps 1, 3 and 4 below: DNS, the Caddy config, and comments. Step 2 is the other way to upload, from your own computer.

## 1. Point the domain at the server

At your domain registrar, change these DNS records. They currently point to Blogger.

| Name | Type | Value |
| --- | --- | --- |
| `@` (knittedstorybears.com) | A | your server's IP |
| `www` | A | your server's IP (replaces the `ghs.google.com` CNAME) |
| `comments` | A | your server's IP |

## 2. Upload the site

The first time, on the server:

```bash
sudo mkdir -p /var/www/knittedstorybears /var/www/knittedstorybears-caddy
sudo chown $USER /var/www/knittedstorybears /var/www/knittedstorybears-caddy
```

Then on your computer:

```bash
DEPLOY_SERVER=you@your-server npm run deploy
```

This builds the site, copies it to `/var/www/knittedstorybears`, and uploads the list of old Blogger addresses to `/var/www/knittedstorybears-caddy/redirects.caddy`.

## 3. Configure Caddy

Add the blocks from [`Caddyfile`](Caddyfile) to `/etc/caddy/Caddyfile` on the server, then run:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

- **HTTPS:** Caddy fetches the certificates as soon as the DNS changes from step 1 are live.
- **Old addresses:** every old Blogger address (for example `/2021/06/amigurumi-dragon.html`) redirects to its new page. Google keeps your rankings, and links on Pinterest keep working.

## 4. Start the comments (Remark42)

Remark42 is a small, private comment system that runs on your server. Readers can comment with just a name, and there are no ads or tracking. Caddy already forwards `comments.knittedstorybears.com` to it.

With Docker, on the server, in a copy of `deploy/remark42/`:

```bash
cp .env.example .env        # then put a random secret in it: openssl rand -hex 32
docker compose up -d
```

No Docker? Remark42 is also a single program you can download from [its releases page](https://github.com/umputun/remark42/releases) and run as a service with the same settings.

To moderate comments, set up Google sign-in (instructions are in `docker-compose.yml`), sign in once through the comment box on any pattern, copy your user ID into `ADMIN_ID` in `.env`, then run `docker compose up -d` again.

The comments from Blogger are already saved in the site. They show under each pattern as "earlier comments from the old blog".

## 5. Retire the Blogger blog

Once the new site is live, go to Blogger → Settings:

1. Remove the custom domain.
2. Set **Blog readers** to private.

Don't delete the blog, so you keep a backup. Keeping it private stops Google from seeing the same patterns in two places.

## Updating later

After adding or editing a pattern, run `DEPLOY_SERVER=you@your-server npm run deploy` again.
