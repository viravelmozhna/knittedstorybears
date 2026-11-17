// Contact form for knittedstorybears.com.
//
// Caddy forwards POST /api/contact here. The form fields are checked and sent
// by email (SMTP, e.g. Fastmail) to CONTACT_TO, with the visitor's address as
// Reply-To. Nothing is stored and nothing is logged. The visitor's IP address
// is kept in memory for at most an hour, only to limit repeated submissions.
//
// Settings come from the environment (see .env.example).
import http from 'node:http';
import nodemailer from 'nodemailer';

const env = (name, fallback) => {
	const value = process.env[name] ?? fallback;
	if (value === undefined || value === '') throw new Error(`Set ${name} in .env`);
	return value;
};

const PORT = Number(env('PORT', '8081'));
const SITE = env('SITE_URL', 'https://www.knittedstorybears.com');
const TO = env('CONTACT_TO');
const FROM = env('CONTACT_FROM', process.env.SMTP_USER);

const mailer = nodemailer.createTransport({
	host: env('SMTP_HOST', 'smtp.fastmail.com'),
	port: Number(env('SMTP_PORT', '465')),
	secure: Number(env('SMTP_PORT', '465')) === 465,
	auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
});

const LIMITS = { name: 100, email: 200, message: 5000 };
const MAX_BODY = 16 * 1024;
const PER_HOUR = 5;
const recent = new Map(); // ip -> timestamps of submissions in the last hour

function tooMany(ip) {
	const now = Date.now();
	const times = (recent.get(ip) ?? []).filter((t) => now - t < 3600_000);
	times.push(now);
	recent.set(ip, times);
	return times.length > PER_HOUR;
}
setInterval(() => {
	const now = Date.now();
	for (const [ip, times] of recent) {
		if (times.every((t) => now - t >= 3600_000)) recent.delete(ip);
	}
}, 600_000).unref();

const redirect = (res, path) => {
	res.writeHead(303, { Location: new URL(path, SITE).href, 'Cache-Control': 'no-store' });
	res.end();
};

function readBody(req) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		req.on('data', (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY) {
				reject(new Error('too large'));
				req.destroy();
			} else chunks.push(chunk);
		});
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});
}

// One line, no control characters: safe for the subject and Reply-To.
const oneLine = (s) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();

const server = http.createServer(async (req, res) => {
	if (req.method !== 'POST' || req.url !== '/api/contact') {
		res.writeHead(404).end();
		return;
	}
	try {
		const type = req.headers['content-type'] ?? '';
		if (!type.startsWith('application/x-www-form-urlencoded')) return redirect(res, '/contact/?error=invalid');

		const form = new URLSearchParams(await readBody(req));
		// Hidden field that people never see; bots tend to fill it in.
		if (form.get('website')) return redirect(res, '/contact/thanks/');

		const name = oneLine(form.get('name') ?? '');
		const email = oneLine(form.get('email') ?? '');
		const message = (form.get('message') ?? '').replace(/\r\n/g, '\n').trim();
		const valid =
			name.length > 0 &&
			name.length <= LIMITS.name &&
			email.length <= LIMITS.email &&
			/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(email) &&
			message.length > 0 &&
			message.length <= LIMITS.message;
		if (!valid) return redirect(res, '/contact/?error=invalid');

		// Caddy replaces any X-Forwarded-For the visitor sends with their real address.
		const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '')
			.split(',')
			.pop()
			.trim();
		if (tooMany(ip)) return redirect(res, '/contact/?error=limit');

		await mailer.sendMail({
			from: { name: 'Knitted Story Bears contact form', address: FROM },
			to: TO,
			replyTo: { name, address: email },
			subject: `Contact form: ${name}`,
			text: `${message}\n\n--\nFrom: ${name} <${email}>\nSent with the contact form on ${SITE}/contact/`,
		});
		redirect(res, '/contact/thanks/');
	} catch {
		redirect(res, '/contact/?error=send');
	}
});

server.requestTimeout = 15_000;
server.listen(PORT, () => console.log(`contact form listening on :${PORT}`));
