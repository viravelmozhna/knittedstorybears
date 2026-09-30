# Hardened Remark42: the stock image's startup script runs as root to rewrite
# the web files with REMARK_URL/SITE and chown /srv. Doing that once here lets
# the container run as the unprivileged app user on a read-only filesystem.
# relabel.sh rewords the widget's sign-in text (see the script).
# To update: bump the tag (check the release notes first), then
#   docker compose build --pull && docker compose up -d
FROM umputun/remark42:v1.17.1

WORKDIR /srv
ENV REMARK_URL=https://comments.knittedstorybears.com \
    SITE=knittedstorybears
COPY relabel.sh /tmp/relabel.sh
RUN mkdir -p /srv/var \
 && sh /tmp/relabel.sh && rm /tmp/relabel.sh \
 && /srv/init.sh \
 && chown -R root:root /srv/web /srv/remark42 /srv/init.sh \
 && chmod -R go-w /srv/web

USER 1001:1001
ENTRYPOINT ["/srv/remark42"]
CMD ["server"]
