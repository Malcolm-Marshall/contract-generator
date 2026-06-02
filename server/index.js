import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.json({ limit: '5mb' }));

// serve templates (including the extracted .txt)
app.use('/templates', express.static(path.join(__dirname, 'templates')));

app.get('/', (req, res) => res.redirect('/edit'));

app.get('/edit', (req, res) => {
	res.sendFile(path.join(__dirname, 'templates', 'contract-edit.html'));
});

app.post('/pdf', async (req, res) => {
	const { html = '', text = '', filename = 'contract.pdf' } = req.body;
	const pageHtml = html || renderHtmlFromText(text);

	let browser;
	try {
		browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
		const page = await browser.newPage();
		await page.setContent(pageHtml, { waitUntil: 'load' });
		const pdf = await page.pdf({
			format: 'A4',
			printBackground: true,
			margin: { top: '25mm', right: '20mm', bottom: '25mm', left: '20mm' },
			preferCSSPageSize: true
		});

		res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
		res.send(pdf);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: err.message });
	} finally {
		if (browser) await browser.close();
	}
});

function renderHtmlFromText(text) {
	const headingMap = [
		'Project Details',
		'Description',
		'Construction Agreement',
		'Scope of Work',
		'Additional Materials',
		'Payment',
		'Walkthrough Checklist Requirements',
		'Submission Process',
		'Final Payment Release',
		'Cancellation and Refund Policy',
		'Indemnification',
		'Change Orders',
		'Timeliness and Quality of Work',
		'Questions and Communication',
		'Attendance Requirement',
		'Insurance',
		'Contractor Licensing',
		'Communication Requirement',
		'Confidentiality',
		'Cleanup',
		'Signatures'
	];

	const blocks = String(text)
		.split(/\r?\n\r?\n+/)
		.map(block => block.trim())
		.filter(Boolean);

	const htmlBlocks = blocks.map((block, index) => {
		const lines = block.split(/\r?\n/).map(line => line.replace(/\t/g, '    ')).filter(Boolean);
		if (lines.length === 0) return '';

		const title = lines[0];
		const cleanTitle = title.replace(/:$/, '');
		const isHeading = lines.length === 1 && (headingMap.includes(cleanTitle) || (/^[A-Z][A-Za-z0-9 &'"()\-\/]+$/.test(cleanTitle) && cleanTitle.length < 60));
		const bodyLines = isHeading ? lines.slice(1) : lines;
		const headingHtml = isHeading ? `<h2>${escapeHtml(cleanTitle)}</h2>` : '';

		if (bodyLines.length === 0) {
			return headingHtml;
		}

		if (bodyLines.some(line => /^\s*([\-*+]\s+|\d+\.\s+)/.test(line))) {
			const result = `${headingHtml}${renderNestedList(bodyLines)}`;
			return result;
		}

		const html = `${headingHtml}<p>${bodyLines.map(line => escapeHtml(line)).join('<br/>')}</p>`;
		const isDescription = /^description$/i.test(cleanTitle);
		return isDescription ? `${html}<div class="page-break"></div>` : html;
	});

	function renderNestedList(lines) {
		const root = { type: 'root', children: [] };
		const stack = [{ node: root, indent: -1 }];

		for (const rawLine of lines) {
			const match = rawLine.match(/^(\s*)([\-*+]\s+|\d+\.\s+)(.*)$/);
			if (!match) {
				const parent = stack[stack.length - 1].node;
				parent.children.push({ type: 'p', text: rawLine.trim() });
				continue;
			}

			const indent = Math.floor(match[1].length / 4);
			const marker = match[2].trim();
			const content = match[3].trim();
			const listTag = /^\d+\.$/.test(marker) ? 'ol' : 'ul';

			while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();

			let parent = stack[stack.length - 1].node;
			if (parent.type === 'li') {
				let lastChild = parent.children[parent.children.length - 1];
				if (!lastChild || lastChild.type !== 'list' || lastChild.tag !== listTag) {
					const list = { type: 'list', tag: listTag, children: [] };
					parent.children.push(list);
					lastChild = list;
				}
				parent = lastChild;
			} else if (parent.type === 'root' || parent.type === 'list') {
				if (parent.type === 'root' || parent.tag !== listTag) {
					const list = { type: 'list', tag: listTag, children: [] };
					parent.children.push(list);
					parent = list;
				}
			}

			const listItem = { type: 'li', children: [{ type: 'text', text: content }] };
			parent.children.push(listItem);
			stack.push({ node: listItem, indent });
		}

		function renderNodes(nodes) {
			return nodes.map(node => {
				if (node.type === 'p') {
					return `<p>${escapeHtml(node.text)}</p>`;
				}
				if (node.type === 'text') {
					return escapeHtml(node.text);
				}
				if (node.type === 'list') {
					return `<${node.tag}>${renderNodes(node.children)}</${node.tag}>`;
				}
				if (node.type === 'li') {
					return `<li>${renderNodes(node.children)}</li>`;
				}
				return '';
			}).join('');
		}

		return renderNodes(root.children);
	}

	return `<!doctype html><html><head><meta charset="utf-8"><title>Contract</title>
	<style>
		html, body, div, span, p, h1, h2, h3, h4, h5, h6, ul, ol, li, table, th, td, section, article { font-family: Arial, Helvetica, sans-serif !important; }
		body{margin:25mm 22mm; font-size:12pt; line-height:1.6; color:#111827; background:#ffffff;}
		p{margin:0 0 1.15em; color:#374151;}
		h2{margin:1.6em 0 0.45em; font-size:16.5pt; font-weight:700; color:#0f172a; border-bottom:1px solid rgba(148,163,184,0.25); padding-bottom:0.35em;}
		ul{margin:0 0 1.2em 1.4em; padding-left:0; list-style:disc inside;}
		ol{margin:0 0 1.2em 1.4em; padding-left:0; list-style:decimal inside;}
		li{margin:0.45em 0;}
		strong, b {font-weight:700;}
		.page-break{display:block; page-break-after:always; break-after:page; height:0;}
	</style></head><body>${htmlBlocks.join('')}</body></html>`;
}

function escapeHtml(str) {
	if (!str) return '';
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Contract PDF server listening on', port));
