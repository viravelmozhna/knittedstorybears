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

Remark42 is a small, private comment system that runs on your server. Readers comment with just a name: no account, no sign-in with other services, no ads or tracking. Caddy already forwards `comments.knittedstorybears.com` to it.

On the server, with Docker:

```bash
mkdir -p /opt/remark42
cp deploy/remark42/* deploy/remark42/.env.example /opt/remark42/
cd /opt/remark42
cp .env.example .env && chmod 600 .env   # then fill in both values: openssl rand -hex 32
docker compose up -d --build
```

The comments are stored in `/opt/remark42/var` (keep it when updating; Remark42 also saves a daily backup in `var/backup`).

What's in `deploy/remark42/`:

- `docker-compose.yml`: the settings. The container is locked down: it runs as an ordinary user with no special permissions, can't write anywhere except its data folder, and has memory and CPU limits. It keeps no access logs, as the privacy policy promises.
- `Dockerfile`: pins the Remark42 version and prepares it so it can run locked down.
- `relabel.sh`: rewords the comment box, since there are no accounts: "Sign In" becomes "Add your name", "Username" becomes "Your name", and so on.

To update Remark42, change the version on the `FROM` line in `Dockerfile` (and the `image:` tag in `docker-compose.yml`), then run `docker compose build --pull && docker compose up -d` in `/opt/remark42`. If an update changed any of the texts `relabel.sh` rewords, the build stops with a message instead of quietly bringing "Sign In" back.

### Removing spam

There's no moderator login in the comment box. Spam is removed on the server with Remark42's admin API, using the `ADMIN_PASSWD` from `.env`. Caddy refuses that password from the internet, so it only works on the server itself:

```bash
cd /opt/remark42 && PW=$(grep ^ADMIN_PASSWD= .env | cut -d= -f2)
API=http://127.0.0.1:8080/api/v1

# the 50 newest comments, with their id, user id and page
curl -s "$API/last/50?site=knittedstorybears"

# delete one comment
curl -u "admin:$PW" -X DELETE "$API/admin/comment/COMMENT_ID?site=knittedstorybears&url=PAGE_URL"

# remove a spammer and all their comments
curl -u "admin:$PW" -X DELETE "$API/admin/user/USER_ID?site=knittedstorybears"

# block a user from commenting (ttl=0: for good)
curl -u "admin:$PW" -X PUT "$API/admin/user/USER_ID?site=knittedstorybears&block=1&ttl=0"
```

The comments from Blogger are already saved in the site. They show under each pattern as "earlier comments from the old blog".

## 5. Retire the Blogger blog

Once the new site is live, go to Blogger → Settings:

1. Remove the custom domain.
2. Set **Blog readers** to private.

Don't delete the blog, so you keep a backup. Keeping it private stops Google from seeing the same patterns in two places.

## Updating later

After adding or editing a pattern, run `DEPLOY_SERVER=you@your-server npm run deploy` again.
